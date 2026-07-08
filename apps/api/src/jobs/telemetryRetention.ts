import cron from "node-cron";
import { prisma } from "../lib/prisma.js";

const RETENTION_DAYS = 365;

// 원시 텔레메트리는 1년치만 보관한다 (트립 등 집계 데이터는 보존 기간 제한 없음).
export async function purgeOldTelemetry(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.telemetryRaw.deleteMany({ where: { time: { lt: cutoff } } });
  return result.count;
}

export function startTelemetryRetentionJob(): void {
  // 서버 기동 시 한 번 정리하고, 이후 매일 새벽 4시에 정리한다.
  purgeOldTelemetry().catch((err) => console.error("[telemetry-retention] initial purge failed", err));
  cron.schedule("0 4 * * *", () => {
    purgeOldTelemetry().catch((err) => console.error("[telemetry-retention] scheduled purge failed", err));
  });
}
