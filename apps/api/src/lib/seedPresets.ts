import {
  ADMIN_SCHEDULE_DEFS,
  DEPRECATED_MAINTENANCE_PRESETS,
  MAINTENANCE_PRESET_DEFS,
  adminStoredVariants,
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
    const variants = maintenanceStoredVariants(preset.itemKey);
    const existingRows = await prisma.maintenancePresetTemplate.findMany({
      where: {
        category: "MAINTENANCE",
        fuelType: preset.fuelType,
        name: { in: variants },
      },
      select: { id: true, name: true },
    });
    const preferred =
      existingRows.find((row) => row.name === preset.itemKey) ?? existingRows[0] ?? null;

    if (preferred) {
      await prisma.maintenancePresetTemplate.update({
        where: { id: preferred.id },
        data: {
          name: preset.itemKey,
          intervalKm: preset.intervalKm ?? null,
          intervalMonths: preset.intervalMonths ?? null,
          sortOrder: i,
        },
      });
      const extras = existingRows.filter((row) => row.id !== preferred.id);
      if (extras.length > 0) {
        await prisma.maintenancePresetTemplate.deleteMany({
          where: { id: { in: extras.map((row) => row.id) } },
        });
      }
    } else {
      await prisma.maintenancePresetTemplate.create({
        data: {
          category: "MAINTENANCE",
          fuelType: preset.fuelType,
          name: preset.itemKey,
          intervalKm: preset.intervalKm ?? null,
          intervalMonths: preset.intervalMonths ?? null,
          sortOrder: i,
        },
      });
    }
  }

  for (let i = 0; i < ADMIN_SCHEDULE_DEFS.length; i++) {
    const preset = ADMIN_SCHEDULE_DEFS[i];
    const variants = adminStoredVariants(preset.itemKey);
    const existingRows = await prisma.maintenancePresetTemplate.findMany({
      where: {
        category: "ADMINISTRATIVE",
        name: { in: variants },
      },
      select: { id: true, name: true },
    });
    const preferred =
      existingRows.find((row) => row.name === preset.itemKey) ?? existingRows[0] ?? null;

    if (preferred) {
      await prisma.maintenancePresetTemplate.update({
        where: { id: preferred.id },
        data: {
          name: preset.itemKey,
          intervalMonths: preset.expectedLifeMonths,
          sortOrder: i,
        },
      });
      const extras = existingRows.filter((row) => row.id !== preferred.id);
      if (extras.length > 0) {
        await prisma.maintenancePresetTemplate.deleteMany({
          where: { id: { in: extras.map((row) => row.id) } },
        });
      }
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
