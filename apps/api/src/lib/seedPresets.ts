import {
  ADMIN_SCHEDULE_DEFS,
  DEPRECATED_MAINTENANCE_PRESETS,
  MAINTENANCE_PRESET_DEFS,
  maintenanceStoredVariants,
} from "@garage/shared";
import { prisma } from "./prisma.js";

/** 정비·행정 마스터 프리셋을 idempotent하게 채운다. 새 설치·업데이트 시 API 기동마다 호출해도 안전하다. */
export async function ensureMaintenancePresets(): Promise<number> {
  for (const dep of DEPRECATED_MAINTENANCE_PRESETS) {
    await prisma.maintenancePresetTemplate.deleteMany({
      where: { fuelType: dep.fuelType, name: { in: maintenanceStoredVariants(dep.itemKey) } },
    });
  }

  for (let i = 0; i < MAINTENANCE_PRESET_DEFS.length; i++) {
    const preset = MAINTENANCE_PRESET_DEFS[i];
    await prisma.maintenancePresetTemplate.upsert({
      where: {
        category_fuelType_name: {
          category: "MAINTENANCE",
          fuelType: preset.fuelType,
          name: preset.itemKey,
        },
      },
      update: {
        intervalKm: preset.intervalKm ?? null,
        intervalMonths: preset.intervalMonths ?? null,
      },
      create: {
        category: "MAINTENANCE",
        fuelType: preset.fuelType,
        name: preset.itemKey,
        intervalKm: preset.intervalKm ?? null,
        intervalMonths: preset.intervalMonths ?? null,
        sortOrder: i,
      },
    });
  }

  for (let i = 0; i < ADMIN_SCHEDULE_DEFS.length; i++) {
    const preset = ADMIN_SCHEDULE_DEFS[i];
    const existing = await prisma.maintenancePresetTemplate.findFirst({
      where: {
        category: "ADMINISTRATIVE",
        name: preset.itemKey,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.maintenancePresetTemplate.update({
        where: { id: existing.id },
        data: { intervalMonths: preset.expectedLifeMonths },
      });
    } else {
      await prisma.maintenancePresetTemplate.create({
        data: {
          category: "ADMINISTRATIVE",
          fuelType: null,
          name: preset.itemKey,
          intervalMonths: preset.expectedLifeMonths,
          sortOrder: i,
        },
      });
    }
  }

  return MAINTENANCE_PRESET_DEFS.length + ADMIN_SCHEDULE_DEFS.length;
}
