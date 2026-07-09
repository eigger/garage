import { buildReminderPushMessage, parseLocale } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { getUserIdsForVehicle, isPushConfigured, sendPushToSubscription } from "../lib/push.js";

export function isReminderDue(
  reminder: { dueDate: Date | null; dueOdometer: number | null },
  currentOdometer: number,
  now: Date,
): boolean {
  const dueByDate = reminder.dueDate ? reminder.dueDate <= now : false;
  const dueByOdometer = reminder.dueOdometer ? currentOdometer >= reminder.dueOdometer : false;
  return dueByDate || dueByOdometer;
}

export function datesEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/** 기한이 지났고 아직 푸시하지 않은 리마인더에 Web Push 발송 */
export async function sendDueReminderPushes(): Promise<void> {
  if (!isPushConfigured()) return;

  const now = new Date();
  const reminders = await prisma.reminder.findMany({
    where: { status: "PENDING", pushNotifiedAt: null },
    include: { vehicle: { select: { id: true, name: true } } },
  });

  const odometerCache = new Map<string, number>();

  for (const reminder of reminders) {
    if (!odometerCache.has(reminder.vehicleId)) {
      odometerCache.set(reminder.vehicleId, await getLatestOdometer(reminder.vehicleId));
    }
    const currentOdometer = odometerCache.get(reminder.vehicleId)!;

    if (!isReminderDue(reminder, currentOdometer, now)) continue;

    const userIds = await getUserIdsForVehicle(reminder.vehicleId);
    if (userIds.length === 0) continue;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    const url = `/vehicles/${reminder.vehicleId}/schedule`;

    await Promise.all(
      subs.map((sub) => {
        const message = buildReminderPushMessage({
          locale: parseLocale(sub.locale),
          vehicleName: reminder.vehicle.name,
          itemStored: reminder.type,
        });
        return sendPushToSubscription(sub, { ...message, url });
      }),
    );

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { pushNotifiedAt: now },
    });
  }
}
