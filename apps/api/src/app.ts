import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
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
import { evChargerRoutes } from "./routes/evCharger.js";
import { settingsRoutes } from "./routes/settings.js";
import { mapProviderRoutes } from "./routes/mapProviders.js";
import { pushRoutes } from "./routes/push.js";

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

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
  await app.register(websocket);
  // 기본은 전역 미적용 — 무차별 대입 방어가 필요한 로그인 라우트에서만 개별적으로 설정한다.
  await app.register(rateLimit, { global: false });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      const query = request.query as Record<string, any>;
      const token = typeof query?.token === "string" ? query.token : undefined;
      if (token) {
        try {
          const decoded = app.jwt.verify<{ sub: string; role: "ADMIN" | "GENERAL" }>(token);
          request.user = decoded;
          return;
        } catch (innerErr) {
          // Fall through to 401
        }
      }
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.decorate("requireAdmin", async (request, reply) => {
    if (request.user.role !== "ADMIN") {
      reply.code(403).send({ error: "admin only" });
    }
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
  await app.register(evChargerRoutes, { prefix: "/api/ev-charger" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(mapProviderRoutes, { prefix: "/api/map" });
  await app.register(pushRoutes, { prefix: "/api/push" });

  return app;
}
