import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 가족 구성원별 차량 접근권한이 이 앱의 핵심 보안 경계다. 과거 리마인더 "확인함"
// 라우트에 canAccessVehicle 체크가 통째로 빠져 있던 적이 있었는데(다른 사용자
// 차량의 리마인더도 id만 알면 처리 가능했음), 그 회귀를 다시 잡을 수 있도록
// 권한 경계 자체를 라우트 레벨에서 검증한다.
describe("vehicle access permission boundaries", () => {
  let app: FastifyInstance;
  const password = "test-password-123";
  let adminId: string;
  let ownerId: string;
  let outsiderId: string;
  let vehicleId: string;
  let reminderId: string;
  let adminToken: string;
  let ownerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    app = await buildApp();

    const passwordHash = await bcrypt.hash(password, 10);
    const suffix = randomUUID();

    const admin = await prisma.user.create({
      data: { name: "Test Admin", email: `test-admin-${suffix}@example.com`, passwordHash, role: "ADMIN" },
    });
    adminId = admin.id;

    const owner = await prisma.user.create({
      data: { name: "Test Owner", email: `test-owner-${suffix}@example.com`, passwordHash, role: "GENERAL" },
    });
    ownerId = owner.id;

    const outsider = await prisma.user.create({
      data: { name: "Test Outsider", email: `test-outsider-${suffix}@example.com`, passwordHash, role: "GENERAL" },
    });
    outsiderId = outsider.id;

    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID() },
    });
    vehicleId = vehicle.id;

    await prisma.userVehicleAccess.create({
      data: { userId: ownerId, vehicleId, canViewLocation: false },
    });

    const reminder = await prisma.reminder.create({
      data: {
        vehicleId,
        type: "engineOilFilter",
        dueOdometer: 0,
        status: "PENDING",
      },
    });
    reminderId = reminder.id;

    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN" });
    ownerToken = app.jwt.sign({ sub: ownerId, role: "GENERAL" });
    outsiderToken = app.jwt.sign({ sub: outsiderId, role: "GENERAL" });
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects requests with no token", async () => {
    const res = await app.inject({ method: "GET", url: `/api/vehicles/${vehicleId}` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with a garbage token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lets the vehicle owner read their own vehicle", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(vehicleId);
  });

  it("blocks a general user with no access from reading the vehicle", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets admins read any vehicle without an explicit access grant", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("blocks a general user with no access from creating a fuel log on the vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/fuel-logs`,
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 10000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets the vehicle owner create a fuel log on their vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/fuel-logs`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 10000 },
    });
    expect(res.statusCode).toBe(201);
    await prisma.fuelLog.delete({ where: { id: res.json().id } });
  });

  // 빠른 입력 폼이 "가득" 기본값을 되살릴 때 쓰는 필터. 같은 차를 여러 명이 쓰면
  // 가족의 마지막 기록이 아니라 본인 기록이어야 하고, 남의 기록이 섞여 나와서도 안 된다.
  it("scopes fuel logs to the caller when mine=true", async () => {
    const [mine, theirs] = await Promise.all([
      prisma.fuelLog.create({
        data: {
          vehicleId,
          userId: ownerId,
          date: new Date("2026-03-01"),
          odometer: 2000,
          liters: 30,
          cost: 50000,
          fullTank: false,
        },
      }),
      prisma.fuelLog.create({
        data: {
          vehicleId,
          userId: adminId,
          date: new Date("2026-03-02"),
          odometer: 2100,
          liters: 40,
          cost: 60000,
          fullTank: true,
        },
      }),
    ]);

    try {
      const all = await app.inject({
        method: "GET",
        url: `/api/vehicles/${vehicleId}/fuel-logs?limit=1`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      // 필터가 없으면 가장 최근 기록(관리자가 넣은 것)이 나온다.
      expect(all.json()[0].id).toBe(theirs.id);

      const onlyMine = await app.inject({
        method: "GET",
        url: `/api/vehicles/${vehicleId}/fuel-logs?limit=1&mine=true`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(onlyMine.json()).toHaveLength(1);
      expect(onlyMine.json()[0].id).toBe(mine.id);
      expect(onlyMine.json()[0].fullTank).toBe(false);
    } finally {
      await prisma.fuelLog.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } });
    }
  });

  it("blocks dismissing a reminder for a vehicle the user cannot access (regression: dismiss previously had no access check)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/reminders/${reminderId}/dismiss`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);

    const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
    expect(reminder?.status).toBe("PENDING");
  });

  it("lets the vehicle owner dismiss a reminder for their own vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/reminders/${reminderId}/dismiss`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("DISMISSED");
  });

  it("lets a general user register their own vehicle and grants them access to it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/vehicles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: `Owned By General ${randomUUID()}` },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.createdByUserId).toBe(ownerId);

    // 등록과 동시에 접근권한이 생기지 않으면 자기가 만든 차량이 목록에 뜨지 않는다.
    const access = await prisma.userVehicleAccess.findUnique({
      where: { userId_vehicleId: { userId: ownerId, vehicleId: created.id } },
    });
    expect(access).not.toBeNull();

    // 등록자는 관리자가 아니어도 자기 차량을 삭제할 수 있다.
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/vehicles/${created.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(deleteRes.statusCode).toBe(204);
  });

  it("blocks a general user from deleting a vehicle they did not register", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("blocks a general user from sharing a vehicle they did not register", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/vehicles/${vehicleId}/access/${outsiderId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { canViewLocation: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it("blocks non-admins from creating other user accounts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "New User", email: `should-not-be-created-${randomUUID()}@example.com`, password: "whatever123", role: "GENERAL" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets admins log in via the real login route and receive a working token", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("ADMIN");
  });

  it("rejects login with the wrong password", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("matches the stored email case-insensitively on login", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email.toUpperCase(), password },
    });
    expect(res.statusCode).toBe(200);
  });

  it("hides trip coordinates from a user without location permission", async () => {
    const trip = await prisma.trip.create({
      data: {
        vehicleId,
        startTime: new Date(),
        endTime: new Date(),
        distanceKm: 12,
        routePolyline: "_p~iF~ps|U_ulLnnqC",
      },
    });
    try {
      const withoutPermission = await app.inject({
        method: "GET",
        url: `/api/trips?vehicleId=${vehicleId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(withoutPermission.statusCode).toBe(200);
      const hidden = withoutPermission.json().find((t: { id: string }) => t.id === trip.id);
      expect(hidden.routePolyline).toBeNull();
      // 거리 같은 주행 요약은 그대로 보여야 한다 — 가리는 것은 위치뿐이다.
      expect(hidden.distanceKm).toBe(12);

      await prisma.userVehicleAccess.update({
        where: { userId_vehicleId: { userId: ownerId, vehicleId } },
        data: { canViewLocation: true },
      });

      const withPermission = await app.inject({
        method: "GET",
        url: `/api/trips?vehicleId=${vehicleId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const shown = withPermission.json().find((t: { id: string }) => t.id === trip.id);
      expect(shown.routePolyline).toBe("_p~iF~ps|U_ulLnnqC");
    } finally {
      await prisma.userVehicleAccess.update({
        where: { userId_vehicleId: { userId: ownerId, vehicleId } },
        data: { canViewLocation: false },
      });
      await prisma.trip.delete({ where: { id: trip.id } });
    }
  });
});

// 회원가입 → 승인 → 계정 관리로 이어지는 흐름의 경계. 승인 전 계정이 데이터에 닿거나,
// 마지막 관리자가 사라지거나, 무효화된 토큰이 계속 통하면 전부 복구가 어려운 사고다.
describe("user lifecycle boundaries", () => {
  let app: FastifyInstance;
  const password = "test-password-123";
  let adminId: string;
  let adminToken: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        name: "Lifecycle Admin",
        email: `lifecycle-admin-${randomUUID()}@example.com`,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    adminId = admin.id;
    createdUserIds.push(admin.id);
    adminToken = app.jwt.sign({ sub: admin.id, role: "ADMIN", tokenVersion: admin.tokenVersion });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  // 회원가입 라우트는 무차별 대입 방어로 IP당 15분에 5회로 제한돼 있다. 가입 동작 자체를
  // 검증하는 테스트에서만 실제 라우트를 호출하고, 나머지는 계정을 직접 만들어 쓴다
  // (안 그러면 뒤쪽 테스트가 429로 줄줄이 깨진다).
  async function register(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "New Member", email, password },
    });
    if (res.statusCode === 201) createdUserIds.push(res.json().id);
    return res;
  }

  async function createMember(status: "PENDING" | "ACTIVE") {
    const email = `member-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        name: "Member",
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "GENERAL",
        status,
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email };
  }

  async function loginAs(email: string, withPassword = password) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: withPassword },
    });
    return res;
  }

  it("creates self-registered accounts as pending general users", async () => {
    const res = await register(`signup-${randomUUID()}@example.com`);
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("PENDING");
    expect(res.json().role).toBe("GENERAL");
  });

  it("normalizes the email of a self-registered account to lowercase", async () => {
    const suffix = randomUUID();
    const res = await register(`MiXeD-${suffix}@Example.COM`);
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe(`mixed-${suffix}@example.com`);
  });

  it("rejects a duplicate email with 409 instead of a 500", async () => {
    const email = `dupe-${randomUUID()}@example.com`;
    expect((await register(email)).statusCode).toBe(201);
    expect((await register(email.toUpperCase())).statusCode).toBe(409);
  });

  it("lets a pending user read their own profile but blocks every data route", async () => {
    const { email } = await createMember("PENDING");

    const login = await loginAs(email);
    expect(login.statusCode).toBe(200);
    const token = login.json().token;

    // 승인 대기 화면을 그리려면 /me는 통과해야 한다.
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().status).toBe("PENDING");

    // 그 외에는 전부 막힌다 — 로그인만 하면 받아갈 수 있는 지도 API 키가 대표적인 이유.
    for (const url of ["/api/vehicles", "/api/map/providers", "/api/reminders"]) {
      const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it("lets an admin approve a pending user, which unblocks the data routes", async () => {
    const { id: userId, email } = await createMember("PENDING");

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "ACTIVE" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe("ACTIVE");

    const login = await loginAs(email);
    const res = await app.inject({
      method: "GET",
      url: "/api/vehicles",
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("invalidates existing tokens when an admin resets a password", async () => {
    const { id: userId, email } = await createMember("ACTIVE");

    const login = await loginAs(email);
    const oldToken = login.json().token;
    expect(
      (await app.inject({ method: "GET", url: "/api/vehicles", headers: { authorization: `Bearer ${oldToken}` } }))
        .statusCode,
    ).toBe(200);

    const reset = await app.inject({
      method: "POST",
      url: `/api/auth/users/${userId}/password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPassword: "brand-new-password-9" },
    });
    expect(reset.statusCode).toBe(204);

    // 분실한 기기에 남아있던 세션이 그대로 살아있으면 초기화의 의미가 없다.
    const afterReset = await app.inject({
      method: "GET",
      url: "/api/vehicles",
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(afterReset.statusCode).toBe(401);

    const relogin = await loginAs(email, "brand-new-password-9");
    expect(relogin.statusCode).toBe(200);
  });

  it("stops working the moment the account is deleted, even with a valid signature", async () => {
    const { id: userId, email } = await createMember("ACTIVE");

    const login = await loginAs(email);
    const token = login.json().token;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del.statusCode).toBe(204);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refuses to demote, deactivate or delete the last active admin", async () => {
    // 이 테스트 내에서는 관리자를 한 명만 남겨두고 검증한다.
    const otherAdmins = await prisma.user.findMany({
      where: { id: { not: adminId }, role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: otherAdmins.map((a) => a.id) } },
      data: { status: "PENDING" },
    });

    try {
      // 자기 자신은 역할/상태를 바꿀 수 없다(되돌릴 권한까지 함께 잃기 때문).
      const self = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "GENERAL" },
      });
      expect(self.statusCode).toBe(400);

      const selfDelete = await app.inject({
        method: "DELETE",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(selfDelete.statusCode).toBe(400);

      // 다른 관리자가 이 마지막 관리자를 강등하려는 경우도 막힌다.
      const secondAdmin = await prisma.user.create({
        data: {
          name: "Second Admin",
          email: `second-admin-${randomUUID()}@example.com`,
          passwordHash: await bcrypt.hash(password, 10),
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      createdUserIds.push(secondAdmin.id);
      const secondToken = app.jwt.sign({
        sub: secondAdmin.id,
        role: "ADMIN",
        tokenVersion: secondAdmin.tokenVersion,
      });

      // 이제 관리자가 둘이므로 강등이 허용된다.
      const demote = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { role: "GENERAL" },
      });
      expect(demote.statusCode).toBe(200);

      // 남은 관리자는 secondAdmin 하나 — 이제 이 계정은 강등할 수 없다.
      const lastOne = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${secondAdmin.id}`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { role: "GENERAL" },
      });
      expect(lastOne.statusCode).toBe(400);

      await prisma.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((a) => a.id) } },
        data: { status: "ACTIVE" },
      });
    }
  });

  it("blocks general users from managing other accounts", async () => {
    const { email } = await createMember("ACTIVE");

    const login = await loginAs(email);
    const token = login.json().token;

    for (const [method, url] of [
      ["GET", "/api/auth/users"],
      ["PATCH", `/api/auth/users/${adminId}`],
      ["POST", `/api/auth/users/${adminId}/password`],
      ["DELETE", `/api/auth/users/${adminId}`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: method === "GET" || method === "DELETE" ? undefined : { role: "GENERAL", newPassword: "x".repeat(12) },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });
});
