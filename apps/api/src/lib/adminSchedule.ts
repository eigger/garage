import {
  ADMIN_SCHEDULE_DEFS,
  hasStoredAdminPresetName,
} from "@garage/shared";
import { prisma } from "./prisma.js";
import { getLatestOdometer } from "./odometer.js";
import { syncReminders } from "../jobs/reminders.js";

/** 없는 행정 항목만 추가한다 — 기존 차량·중복 호출에도 안전 */
export async function ensureAdminSchedule(vehicleId: string): Promise<void> {
  const presets = await prisma.maintenancePresetTemplate.findMany({
    where: { category: "ADMINISTRATIVE" },
    orderBy: { sortOrder: "asc" },
  });
  const defs =
    presets.length > 0
      ? presets.map((preset) => ({
          name: preset.name,
          expectedLifeMonths: preset.intervalMonths ?? 12,
        }))
      : ADMIN_SCHEDULE_DEFS.map((item) => ({
          name: item.itemKey,
          expectedLifeMonths: item.expectedLifeMonths,
        }));

  const existing = await prisma.consumablePart.findMany({
    where: { vehicleId, category: "ADMINISTRATIVE" },
    select: { partType: true },
  });
  const existingTypes = new Set(existing.map((p) => p.partType));
  const missing = defs.filter((item) => !hasStoredAdminPresetName(existingTypes, item.name));
  if (missing.length === 0) return;

  const odometer = await getLatestOdometer(vehicleId);
  const installedDate = new Date();
  const presetByName = new Map(presets.map((preset) => [preset.name, preset]));

  await prisma.consumablePart.createMany({
    data: missing.map((item) => ({
      vehicleId,
      partType: item.name,
      category: "ADMINISTRATIVE" as const,
      installedDate,
      installedOdometer: odometer,
      expectedLifeMonths: item.expectedLifeMonths,
      presetTemplateId: presetByName.get(item.name)?.id ?? null,
    })),
  });

  await syncReminders(vehicleId);
}
