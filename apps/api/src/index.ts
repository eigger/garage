import { randomUUID } from "crypto";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startReminderJob } from "./jobs/reminders.js";
import { startTripJob } from "./jobs/trips.js";
import { startTelemetryRetentionJob } from "./jobs/telemetryRetention.js";
import { startHyundaiSyncJob } from "./jobs/hyundaiSync.js";
import { ensureMaintenancePresets } from "./lib/seedPresets.js";

const app = await buildApp();

startReminderJob();
startTripJob();
startTelemetryRetentionJob();
startHyundaiSyncJob();

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

async function bootstrapMaintenancePresets() {
  try {
    const count = await ensureMaintenancePresets();
    app.log.info(`Maintenance presets ready (${count} templates)`);
  } catch (err) {
    app.log.error(err, "Failed to seed maintenance presets:");
  }
}
await bootstrapMaintenancePresets();

const port = Number(process.env.PORT ?? 8080);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
