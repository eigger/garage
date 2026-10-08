import cron from "node-cron";
import { APP_TIMEZONE } from "../lib/dateRange.js";
import { computeDueBaseline } from "@garage/shared";
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
    if (!part.expectedLifeKm && !part.expectedLifeMonths) {
      // 주기를 모두 지운 항목의 알림은 더 이상 기준이 없으므로 정리한다.
      await prisma.reminder.deleteMany({ where: { consumablePartId: part.id } });
      continue;
    }

    const { dueDate, dueOdometer } = computeDueBaseline(part);

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
        // dueDate/dueOdometer가 바뀐 경우에만 PENDING으로 되돌린다.
        // 그렇지 않으면 사용자가 DISMISSED한 상태를 유지한다.
        ...(dueChanged ? { status: "PENDING", pushNotifiedAt: null } : {}),
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
  // 새벽 3시(KST)에는 동기화만 한다 — 푸시를 같이 보내면 한밤중에 알림이 울린다.
  cron.schedule("0 3 * * *", () => {
    syncReminders().catch((err) => console.error("[reminders] scheduled sync failed", err));
  }, { timezone: APP_TIMEZONE });
  // 날짜 기준 기한(UTC 자정 = KST 09:00)이 지난 뒤인 낮 시간에 푸시한다. 오전 9시 30분에 그날 도래분,
  // 저녁 6시에 주행거리 변동으로 새로 도래한 분을 확인한다.
  for (const expr of ["30 9 * * *", "0 18 * * *"]) {
    cron.schedule(expr, () => {
      sendDueReminderPushes().catch((err) => console.error("[push] scheduled send failed", err));
    }, { timezone: APP_TIMEZONE });
  }
}
