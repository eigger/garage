import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./routes/auth.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { ingestRoutes } from "./routes/ingest.js";
import { consumablePartRoutes } from "./routes/consumableParts.js";
import { reminderRoutes } from "./routes/reminders.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { tripRoutes } from "./routes/trips.js";
import { maintenancePresetRoutes } from "./routes/maintenancePresets.js";
import { backupRoutes } from "./routes/backup.js";
import { opinetRoutes } from "./routes/opinet.js";
import { cheonanCardRoutes } from "./routes/cheonanCard.js";
import { evChargerRoutes } from "./routes/evCharger.js";
import { hyundaiRoutes } from "./routes/hyundai.js";
import { hyundaiWebhookRoutes } from "./routes/hyundaiWebhook.js";
import { settingsRoutes } from "./routes/settings.js";
import { mapProviderRoutes } from "./routes/mapProviders.js";
import { pushRoutes } from "./routes/push.js";
import { reportsRoutes } from "./routes/reports.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const APP_VERSION = pkg.version;

let latestVersion = APP_VERSION;
let lastVersionCheck = 0;
const VERSION_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes cache

async function checkLatestVersion(): Promise<string> {
  const now = Date.now();
  if (now - lastVersionCheck < VERSION_CHECK_INTERVAL) {
    return latestVersion;
  }
  try {
    const res = await fetch("https://api.github.com/repos/eigger/garage/releases/latest", {
      headers: { "User-Agent": "garage-app" }
    });
    if (res.ok) {
      const data = await res.json() as { tag_name: string };
      latestVersion = data.tag_name.replace(/^v/, "");
      lastVersionCheck = now;
    }
  } catch (err) {
    // Suppress errors to avoid crashing healthcheck on network/GitHub API limit errors
    console.error("Failed to check latest version from GitHub:", err);
  }
  return latestVersion;
}

// 서버 부팅(index.ts)과 테스트(vitest)가 동일한 라우트/플러그인 구성을 공유하도록
// 앱 조립만 여기서 하고, 리스닝·백그라운드 잡·1회성 백필은 index.ts에 남겨둔다.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  if (!process.env.JWT_SECRET) {
    app.log.warn("JWT_SECRET이 설정되지 않았습니다. .env를 확인하세요.");
  }

  // @fastify/cors의 기본 methods는 'GET,HEAD,POST'라, 명시하지 않으면 크로스 오리진
  // PATCH/PUT/DELETE가 프리플라이트에서 전부 막힌다. 배포(Caddy)에서는 웹과 API가 같은
  // 오리진이라 드러나지 않지만, 로컬 개발이나 NEXT_PUBLIC_API_URL을 별도 호스트로 둔
  // 구성에서는 수정·삭제가 통째로 실패한다.
  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
  await app.register(websocket);
  // 기본은 전역 미적용 — 무차별 대입 방어가 필요한 로그인 라우트에서만 개별적으로 설정한다.
  await app.register(rateLimit, { global: false });

  // JWT 서명 검증까지만 하고, 페이로드를 그대로 신뢰하지는 않는다. 토큰 수명이 90일이라
  // 역할 강등·계정 삭제·비밀번호 초기화가 토큰에 반영되지 않으면 최대 90일간 옛 권한이
  // 살아있게 된다 — 요청마다 DB에서 현재 상태를 읽어 덮어쓰는 비용(가족 규모에선 무시 가능)이
  // 그 위험보다 훨씬 싸다.
  async function resolveUser(
    request: FastifyRequest,
    reply: FastifyReply,
    { allowPending }: { allowPending: boolean },
  ): Promise<void> {
    let payload: { sub: string; role: "ADMIN" | "GENERAL"; tokenVersion?: number };
    try {
      payload = await request.jwtVerify();
    } catch (err) {
      // 웹소켓·다운로드 링크처럼 Authorization 헤더를 붙일 수 없는 경로를 위한 쿼리 토큰 폴백.
      const query = request.query as Record<string, any>;
      const token = typeof query?.token === "string" ? query.token : undefined;
      if (!token) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      try {
        payload = app.jwt.verify(token);
      } catch (innerErr) {
        return reply.code(401).send({ error: "unauthorized" });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
    // 계정이 지워졌으면 서명이 유효해도 더 이상 통하지 않는다.
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    // 이 변경 이전에 발급된 토큰에는 tokenVersion이 없다. 그것만으로 전원을 로그아웃시키지는
    // 않고(0으로 간주), 실제로 무효화가 필요한 시점(비밀번호 초기화 등)에 버전이 올라가면
    // 그때 걸러진다.
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      return reply.code(401).send({ error: "token revoked" });
    }

    if (!allowPending && user.status !== "ACTIVE") {
      return reply.code(403).send({ error: "pending approval" });
    }

    request.user = {
      sub: user.id,
      role: user.role,
      status: user.status,
      tokenVersion: user.tokenVersion,
    };
  }

  app.decorate("authenticate", async (request, reply) => {
    await resolveUser(request, reply, { allowPending: false });
  });

  app.decorate("authenticateAllowPending", async (request, reply) => {
    await resolveUser(request, reply, { allowPending: true });
  });

  app.decorate("requireAdmin", async (request, reply) => {
    if (request.user.role !== "ADMIN") {
      reply.code(403).send({ error: "admin only" });
    }
  });

  // Prisma의 제약 위반이 그대로 500으로 새면 프론트는 "저장 실패"밖에 보여줄 수 없다.
  // 중복 이메일처럼 사용자가 고칠 수 있는 실패는 원인을 알 수 있는 상태 코드로 바꿔준다.
  app.setErrorHandler((error: unknown, request, reply) => {
    const err = error as { code?: string; statusCode?: number; message?: string };
    const code = err.code;

    if (code === "P2002") {
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];
      request.log.warn({ err: error, fields }, "unique constraint violation");
      return reply.code(409).send({ error: "duplicate", fields });
    }
    if (code === "P2025") {
      return reply.code(404).send({ error: "not found" });
    }

    // Fastify 자체 에러(검증 400, rate limit 429 등)는 원래 상태 코드를 유지한다.
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return reply.code(statusCode).send({ error: "internal server error" });
    }
    return reply.code(statusCode).send({ error: err.message });
  });

  app.get("/health", async () => {
    const latest = await checkLatestVersion();
    const updateAvailable = latest !== APP_VERSION;
    return {
      status: "ok",
      version: APP_VERSION,
      latestVersion: latest,
      updateAvailable
    };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(vehicleRoutes, { prefix: "/api/vehicles" });
  await app.register(ingestRoutes, { prefix: "/api/ingest" });
  await app.register(consumablePartRoutes, { prefix: "/api/consumable-parts" });
  await app.register(reminderRoutes, { prefix: "/api/reminders" });
  await app.register(attachmentRoutes, { prefix: "/api/attachments" });
  await app.register(tripRoutes, { prefix: "/api/trips" });
  await app.register(maintenancePresetRoutes, { prefix: "/api/maintenance-presets" });
  await app.register(backupRoutes, { prefix: "/api/backup" });
  await app.register(opinetRoutes, { prefix: "/api/opinet" });
  await app.register(cheonanCardRoutes, { prefix: "/api/cheonan-card" });
  await app.register(evChargerRoutes, { prefix: "/api/ev-charger" });
  await app.register(hyundaiRoutes, { prefix: "/api/hyundai" });
  await app.register(hyundaiWebhookRoutes, { prefix: "/api/hyundai/webhook" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(mapProviderRoutes, { prefix: "/api/map" });
  await app.register(pushRoutes, { prefix: "/api/push" });
  await app.register(reportsRoutes, { prefix: "/api/vehicles" });

  return app;
}
