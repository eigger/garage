import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { datesEqual } from "../jobs/pushReminders.js";
import { sendDueReminderPushes } from "../jobs/pushReminders.js";

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

    const existing = await prisma.reminder.findUnique({
      where: { consumablePartId: part.id },
    });

    const dueChanged =
      existing &&
      (!datesEqual(existing.dueDate, dueDate) || existing.dueOdometer !== dueOdometer);

    await prisma.reminder.upsert({
      where: { consumablePartId: part.id },
      update: {
        dueDate,
        dueOdometer,
        type: part.partType,
        status: "PENDING",
        ...(dueChanged ? { pushNotifiedAt: null } : {}),
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
  async function run() {
    await syncReminders();
    await sendDueReminderPushes();
  }

  run().catch((err) => console.error("[reminders] initial sync failed", err));
  cron.schedule("0 3 * * *", () => {
    run().catch((err) => console.error("[reminders] scheduled sync failed", err));
  });
  // 오전 8시에도 푸시 재확인 (주행거리 변동으로 당일 기한 도래 가능)
  cron.schedule("0 8 * * *", () => {
    sendDueReminderPushes().catch((err) => console.error("[push] scheduled send failed", err));
  });
}
