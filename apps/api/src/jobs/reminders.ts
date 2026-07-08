import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";

// 소모품별로 "installedDate + expectedLifeMonths"와 "installedOdometer + expectedLifeKm"를
// 계산해서 Reminder를 upsert한다. 실제로 기한이 지났는지 여부는 조회 시점(reminders 라우트)에
// dueDate/dueOdometer를 현재 값과 비교해서 판단한다 — 이 잡은 "다음 기준점"만 최신 상태로 유지한다.
export async function syncReminders(vehicleId?: string): Promise<void> {
  const parts = await prisma.consumablePart.findMany({
    where: vehicleId ? { vehicleId } : undefined,
  });
  const odometerCache = new Map<string, number>();

  for (const part of parts) {
    if (!part.expectedLifeKm && !part.expectedLifeMonths) continue;

    let dueDate: Date | null = null;
    if (part.expectedLifeMonths) {
      dueDate = new Date(part.installedDate);
      dueDate.setMonth(dueDate.getMonth() + part.expectedLifeMonths);
    }

    const dueOdometer = part.expectedLifeKm
      ? part.installedOdometer + part.expectedLifeKm
      : null;

    if (!odometerCache.has(part.vehicleId)) {
      odometerCache.set(part.vehicleId, await getLatestOdometer(part.vehicleId));
    }

    await prisma.reminder.upsert({
      where: { consumablePartId: part.id },
      update: { 
        dueDate, 
        dueOdometer, 
        type: part.partType, 
        status: "PENDING", // 새 주기가 적용되었으므로 PENDING으로 복원
      },
      create: {
        vehicleId: part.vehicleId,
        consumablePartId: part.id,
        type: part.partType,
        dueDate,
        dueOdometer,
        status: "PENDING",
      },
    });
  }
}

export function startReminderJob(): void {
  // 서버 기동 시 한 번 즉시 동기화하고, 이후 매일 새벽 3시에 갱신한다.
  syncReminders().catch((err) => console.error("[reminders] initial sync failed", err));
  cron.schedule("0 3 * * *", () => {
    syncReminders().catch((err) => console.error("[reminders] scheduled sync failed", err));
  });
}
