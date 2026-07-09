import {
  ADMIN_SCHEDULE_DEFS,
  hasStoredAdminItem,
} from "@garage/shared";
import { prisma } from "./prisma.js";
import { getLatestOdometer } from "./odometer.js";
import { syncReminders } from "../jobs/reminders.js";

/** 없는 행정 항목만 추가한다 — 기존 차량·중복 호출에도 안전 */
export async function ensureAdminSchedule(vehicleId: string): Promise<void> {
  const existing = await prisma.consumablePart.findMany({
    where: { vehicleId, category: "ADMINISTRATIVE" },
    select: { partType: true },
  });
  const existingTypes = new Set(existing.map((p) => p.partType));
  const missing = ADMIN_SCHEDULE_DEFS.filter(
    (item) => !hasStoredAdminItem(existingTypes, item.itemKey),
  );
  if (missing.length === 0) return;

  const odometer = await getLatestOdometer(vehicleId);
  const installedDate = new Date();

  await prisma.consumablePart.createMany({
    data: missing.map((item) => ({
      vehicleId,
      partType: item.itemKey,
      category: item.category,
      installedDate,
      installedOdometer: odometer,
      expectedLifeMonths: item.expectedLifeMonths,
    })),
  });

  await syncReminders(vehicleId);
}
