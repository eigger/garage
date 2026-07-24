import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { fetchMileage } from "../lib/hyundai.js";
import { getValidAccessTokenForVehicleLink } from "../lib/hyundaiToken.js";

// 블루링크 오도미터는 "시동 종료 시점" 기준으로만 갱신되므로(규격서 확인), 하루에
// 몇 번씩 폴링해봐야 의미가 없다 — reminders 잡과 같은 하루 2회 패턴을 그대로 쓴다.
// OBD 웹훅의 bumpOdometerIfHigher와 동일한 규칙(기존 값보다 클 때만 갱신)을 적용해,
// 수동 기록이 더 최신이면 덮어쓰지 않는다.
export async function syncHyundaiMileage(): Promise<void> {
  const links = await prisma.hyundaiVehicleLink.findMany();

  for (const link of links) {
    try {
      const accessToken = await getValidAccessTokenForVehicleLink(link.accountLinkId);
      if (!accessToken) continue;

      const mileage = await fetchMileage(accessToken, link.hyundaiCarId);
      if (!mileage || mileage.odometerKm <= 0) continue;

      const odometer = Math.round(mileage.odometerKm);
      const vehicle = await prisma.vehicle.findUnique({ where: { id: link.vehicleId }, select: { odometer: true } });
      if (vehicle && odometer > vehicle.odometer) {
        await prisma.vehicle.update({ where: { id: link.vehicleId }, data: { odometer } });
      }
    } catch (err) {
      console.error(`[hyundai-sync] failed for vehicle ${link.vehicleId}`, err);
    }
  }
}

export function startHyundaiSyncJob(): void {
  syncHyundaiMileage().catch((err) => console.error("[hyundai-sync] initial sync failed", err));
  cron.schedule("0 7,19 * * *", () => {
    syncHyundaiMileage().catch((err) => console.error("[hyundai-sync] scheduled sync failed", err));
  });
}
