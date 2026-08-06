import { prisma } from "./prisma.js";

export type VehicleFuelStats = {
  kmPerLiter: number | null;
  avgLiters: number | null;
};

// "이득순" 계산에 필요한 이 차량의 평균 연비·평균 주유량. 만땅 기록끼리 짝지어 연비를
// 구하는 계산식은 apps/web/lib/fuelEfficiency.ts의 computeFuelEfficiencyPoints와 동일해야
// 두 화면의 숫자가 어긋나지 않는다 — 구간 사이에 낀 부분 주유의 리터도 반드시 합산한다.
export async function getVehicleFuelStats(vehicleId: string): Promise<VehicleFuelStats> {
  const logs = await prisma.fuelLog.findMany({
    where: { vehicleId },
    orderBy: { date: "asc" },
    select: { odometer: true, liters: true, fullTank: true },
  });

  const efficiencies: number[] = [];
  let prev: { odometer: number } | null = null;
  let litersSincePrev = 0;
  for (const log of logs) {
    litersSincePrev += log.liters;
    if (!log.fullTank) continue;

    if (prev && log.odometer > prev.odometer && litersSincePrev > 0) {
      efficiencies.push((log.odometer - prev.odometer) / litersSincePrev);
    }
    prev = log;
    litersSincePrev = 0;
  }

  const fullTankLogs = logs.filter((l) => l.fullTank);
  const avgLiters =
    fullTankLogs.length > 0 ? fullTankLogs.reduce((sum, l) => sum + l.liters, 0) / fullTankLogs.length : null;
  const kmPerLiter = efficiencies.length > 0 ? efficiencies.reduce((sum, v) => sum + v, 0) / efficiencies.length : null;

  return { kmPerLiter, avgLiters };
}
