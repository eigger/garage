import {
  adminStoredVariants,
  maintenanceStoredVariants,
  resolveAdminItemKey,
  resolveMaintenanceItemKey,
} from "@garage/shared";
import type { PrismaClient } from "../generated/prisma/client.js";

type Db = Pick<PrismaClient, "maintenanceRecord" | "consumablePart">;

/**
 * 기록/스케줄에 카탈로그 키와 legacy 한글 라벨이 섞여 있을 수 있다.
 * (예: autoInsuranceRenewal vs 자동차보험 갱신)
 * 같은 항목으로 취급해야 하므로 동기화 시 모든 variant를 함께 본다.
 */
export function storedTypeVariants(stored: string): string[] {
  const adminKey = resolveAdminItemKey(stored);
  if (adminKey) return adminStoredVariants(adminKey);

  const maintenanceKey = resolveMaintenanceItemKey(stored);
  if (maintenanceKey) return maintenanceStoredVariants(maintenanceKey);

  return [stored];
}

/**
 * 해당 항목(카탈로그 variant 포함)의 가장 최신 정비/행정 기록으로
 * ConsumablePart 기준일·주행거리를 맞춘다.
 * 과거 기록을 수정·추가해도 스케줄이 역행하지 않게 하려는 용도.
 * 기록이 하나도 없으면 ConsumablePart는 건드리지 않는다.
 */
export async function syncConsumablePartFromLatestRecord(
  tx: Db,
  vehicleId: string,
  partType: string,
): Promise<void> {
  const variants = storedTypeVariants(partType);

  const latestRecord = await tx.maintenanceRecord.findFirst({
    where: { vehicleId, type: { in: variants } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  if (!latestRecord) return;

  await tx.consumablePart.updateMany({
    where: { vehicleId, partType: { in: variants } },
    data: {
      installedDate: new Date(latestRecord.date),
      installedOdometer: latestRecord.odometer,
    },
  });
}
