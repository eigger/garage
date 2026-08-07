import type { PrismaClient } from "../generated/prisma/client.js";

type Db = Pick<PrismaClient, "maintenanceRecord" | "consumablePart">;

/**
 * 해당 partType의 가장 최신 정비/행정 기록으로 ConsumablePart 기준일·주행거리를 맞춘다.
 * 과거 기록을 수정·추가해도 스케줄이 역행하지 않게 하려는 용도.
 * 기록이 하나도 없으면 ConsumablePart는 건드리지 않는다.
 */
export async function syncConsumablePartFromLatestRecord(
  tx: Db,
  vehicleId: string,
  partType: string,
): Promise<void> {
  const latestRecord = await tx.maintenanceRecord.findFirst({
    where: { vehicleId, type: partType },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  if (!latestRecord) return;

  await tx.consumablePart.updateMany({
    where: { vehicleId, partType },
    data: {
      installedDate: new Date(latestRecord.date),
      installedOdometer: latestRecord.odometer,
    },
  });
}
