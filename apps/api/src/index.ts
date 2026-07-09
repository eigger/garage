import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./routes/auth.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { ingestRoutes } from "./routes/ingest.js";
import { fuelLogRoutes } from "./routes/fuelLogs.js";
import { maintenanceRecordRoutes } from "./routes/maintenanceRecords.js";
import { consumablePartRoutes } from "./routes/consumableParts.js";
import { reminderRoutes } from "./routes/reminders.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { tripRoutes } from "./routes/trips.js";
import { maintenancePresetRoutes } from "./routes/maintenancePresets.js";
import { backupRoutes } from "./routes/backup.js";
import { opinetRoutes } from "./routes/opinet.js";
import { settingsRoutes } from "./routes/settings.js";
import { startReminderJob } from "./jobs/reminders.js";
import { startTripJob } from "./jobs/trips.js";
import { startTelemetryRetentionJob } from "./jobs/telemetryRetention.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const APP_VERSION = pkg.version;

const app = Fastify({ logger: true });

if (!process.env.JWT_SECRET) {
  app.log.warn("JWT_SECRET이 설정되지 않았습니다. .env를 확인하세요.");
}

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

app.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "unauthorized" });
  }
});

app.decorate("requireAdmin", async (request, reply) => {
  if (request.user.role !== "ADMIN") {
    reply.code(403).send({ error: "admin only" });
  }
});

app.get("/health", async () => ({ status: "ok", version: APP_VERSION }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(vehicleRoutes, { prefix: "/api/vehicles" });
await app.register(ingestRoutes, { prefix: "/api/ingest" });
await app.register(fuelLogRoutes, { prefix: "/api/fuel-logs" });
await app.register(maintenanceRecordRoutes, { prefix: "/api/maintenance-records" });
await app.register(consumablePartRoutes, { prefix: "/api/consumable-parts" });
await app.register(reminderRoutes, { prefix: "/api/reminders" });
await app.register(attachmentRoutes, { prefix: "/api/attachments" });
await app.register(tripRoutes, { prefix: "/api/trips" });
await app.register(maintenancePresetRoutes, { prefix: "/api/maintenance-presets" });
await app.register(backupRoutes, { prefix: "/api/backup" });
await app.register(opinetRoutes, { prefix: "/api/opinet" });
await app.register(settingsRoutes, { prefix: "/api/settings" });

startReminderJob();
startTripJob();
startTelemetryRetentionJob();

// 기존 차량 중 apiToken이 없는 차량에 대해 토큰을 생성해 준다 (하위 호환성).
async function backfillVehicleTokens() {
  try {
    const vehicles = await prisma.vehicle.findMany({ where: { apiToken: null } });
    for (const v of vehicles) {
      await prisma.vehicle.update({
        where: { id: v.id },
        data: { apiToken: randomUUID() },
      });
    }
  } catch (err) {
    app.log.error(err, "Failed to backfill vehicle tokens:");
  }
}
await backfillVehicleTokens();

const port = Number(process.env.PORT ?? 8080);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
