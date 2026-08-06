import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import {
  adminResetPasswordSchema,
  bootstrapAdminSchema,
  createUserSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
  updateUserSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";

type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "GENERAL";
  status: "PENDING" | "ACTIVE";
};

function publicUser(user: PublicUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

// 관리자를 0명으로 만드는 조작(마지막 관리자 강등·비활성·삭제)은 앱을 영구히 잠근다 —
// 사용자·차량·연동키를 아무도 관리할 수 없게 되고 복구 경로는 DB 직접 수정뿐이다.
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") return false;

  const otherAdmins = await prisma.user.count({
    where: { id: { not: userId }, role: "ADMIN", status: "ACTIVE" },
  });
  return otherAdmins === 0;
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/bootstrap/status", async () => {
    const userCount = await prisma.user.count();
    return { needsBootstrap: userCount === 0 };
  });

  app.post("/bootstrap/admin", async (request, reply) => {
    const parsed = bootstrapAdminSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.code(409).send({ error: "bootstrap disabled" });
    }

    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "ADMIN", status: "ACTIVE" },
    });
    return reply.code(201).send(publicUser(user));
  });

  // 공개 회원가입. 만들어진 계정은 승인 대기(PENDING) 상태라 로그인은 되지만
  // 관리자가 승인하기 전까지 어떤 데이터에도 닿지 못한다 — 지도 API 키처럼 로그인만
  // 하면 받아갈 수 있는 값이 있어서 승인 전 계정에 일반 권한을 주면 안 된다.
  app.post(
    "/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      // 아직 관리자가 없으면 승인해줄 사람도 없다 — 최초 1명은 부트스트랩으로 가야 한다.
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        return reply.code(409).send({ error: "bootstrap required" });
      }

      const { name, email, password } = parsed.data;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email, passwordHash, role: "GENERAL", status: "PENDING" },
      });
      return reply.code(201).send(publicUser(user));
    },
  );

  app.post(
    "/login",
    // 무차별 대입 방어: IP당 15분에 10회로 제한 (일반 로그인 실수 빈도보다 넉넉하게).
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return reply.code(401).send({ error: "invalid credentials" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return reply.code(401).send({ error: "invalid credentials" });

      // 승인 대기 계정도 토큰은 받는다 — 로그인 자체를 막아버리면 "승인 대기 중"이라는
      // 상태를 화면에 보여줄 방법이 없어서, 사용자는 비밀번호가 틀린 줄 알게 된다.
      const token = app.jwt.sign(
        { sub: user.id, role: user.role, tokenVersion: user.tokenVersion },
        { expiresIn: "90d" },
      );
      return { token, user: publicUser(user) };
    },
  );

  app.get("/me", { preHandler: [app.authenticateAllowPending] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return null;
    return publicUser(user);
  });

  // 관리자가 직접 계정을 만드는 경로 — 회원가입과 달리 승인 절차 없이 바로 활성이고
  // 역할도 지정할 수 있다.
  app.post(
    "/users",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { name, email, password, role } = parsed.data;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email, passwordHash, role, status: "ACTIVE" },
      });
      return reply.code(201).send(publicUser(user));
    },
  );

  // 구성원 관리 화면용. 계정 정보와 함께 "이 사람이 어떤 차량을 쓰는지"까지 한 번에
  // 내려줘서, 차량 화면을 일일이 돌지 않고 한 화면에서 접근권한을 편집할 수 있게 한다.
  app.get(
    "/users",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          vehicleAccess: {
            select: {
              vehicleId: true,
              canViewLocation: true,
              vehicle: { select: { name: true } },
            },
          },
          _count: { select: { createdVehicles: true } },
          hyundaiAccountLink: {
            select: { vehicles: { select: { vehicle: { select: { name: true } } } } },
          },
        },
      });

      return users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        vehicleAccess: user.vehicleAccess.map((a) => ({
          vehicleId: a.vehicleId,
          vehicleName: a.vehicle.name,
          canViewLocation: a.canViewLocation,
        })),
        createdVehicleCount: user._count.createdVehicles,
        // 이 사용자를 지우면 블루링크 연동이 함께 끊기는 차량들 — 삭제 확인 문구에 쓴다.
        hyundaiLinkedVehicleNames:
          user.hyundaiAccountLink?.vehicles.map((v) => v.vehicle.name) ?? [],
      }));
    },
  );

  // 차량 공유 대상 고르기용 최소 명부. 일반 사용자도 자기가 등록한 차량을 가족과 공유하려면
  // 상대를 골라야 하는데, 관리자 전용 /users는 이메일·역할까지 담고 있어 그대로 열 수 없다.
  // 여기서는 이름과 id만 내려준다.
  app.get("/users/directory", { preHandler: [app.authenticate] }, async () => {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    return users;
  });

  app.patch(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: "user not found" });

      const { role, status } = parsed.data;

      // 자기 자신을 강등하거나 비활성화하면, 그 순간 되돌릴 권한도 함께 잃는다.
      if (id === request.user.sub) {
        if (role && role !== target.role) {
          return reply.code(400).send({ error: "cannot change your own role" });
        }
        if (status && status !== target.status) {
          return reply.code(400).send({ error: "cannot change your own status" });
        }
      }

      const losesAdmin = role === "GENERAL" && target.role === "ADMIN";
      const losesActive = status === "PENDING" && target.status === "ACTIVE";
      if ((losesAdmin || losesActive) && (await isLastActiveAdmin(id))) {
        return reply.code(400).send({ error: "last admin" });
      }

      const user = await prisma.user.update({ where: { id }, data: parsed.data });
      return publicUser(user);
    },
  );

  // 관리자에 의한 비밀번호 초기화. 이 앱에는 이메일 발송 경로가 없어서, 가족 구성원이
  // 비밀번호를 잊었을 때 이게 유일한 복구 수단이다. 초기화와 동시에 그 계정의 기존
  // 토큰을 전부 무효화한다(분실한 기기에 남아있는 세션을 끊기 위해).
  app.post(
    "/users/:id/password",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = adminResetPasswordSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: "user not found" });

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
      await prisma.user.update({
        where: { id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      return reply.code(204).send();
    },
  );

  app.delete(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (id === request.user.sub) {
        return reply.code(400).send({ error: "cannot delete yourself" });
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: "user not found" });

      if (await isLastActiveAdmin(id)) {
        return reply.code(400).send({ error: "last admin" });
      }

      // 주유 기록의 userId는 SET NULL이라 기록 자체는 남고, 차량 접근권한·푸시 구독·
      // 블루링크 연동만 함께 사라진다(스키마의 onDelete 규칙 참고).
      await prisma.user.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // 내 프로필 정보 및 비밀번호 수정 라우트
  app.patch(
    "/profile",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const userId = request.user.sub;
      const { name, email, currentPassword, newPassword } = parsed.data;

      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;

      if (newPassword) {
        if (!currentPassword) {
          return reply.code(400).send({ error: "currentPassword is required" });
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return reply.code(404).send({ error: "user not found" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return reply.code(400).send({ error: "incorrect currentPassword" });

        updateData.passwordHash = await bcrypt.hash(newPassword, 10);
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      return publicUser(user);
    }
  );
}
