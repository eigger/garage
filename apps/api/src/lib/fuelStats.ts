import { prisma } from "./prisma.js";

export type VehicleFuelStats = {
  kmPerLiter: number | null;
  avgLiters: number | null;
};

// "이득순" 계산에 필요한 이 차량의 평균 연비·평균 주유량. 만땅 기록끼리 짝지어
// 연비를 구하는 계산식은 apps/web/lib/fuelEfficiency.ts의 computeFuelEfficiencyPoints와
// 동일해야 두 화면의 숫자가 어긋나지 않는다.
export async function getVehicleFuelStats(vehicleId: string): Promise<VehicleFuelStats> {
  const logs = await prisma.fuelLog.findMany({
    where: { vehicleId, fullTank: true },
    orderBy: { date: "asc" },
    select: { date: true, odometer: true, liters: true },
  });

  const efficiencies: number[] = [];
  let prev: { odometer: number } | null = null;
  for (const log of logs) {
    if (prev && log.odometer > prev.odometer && log.liters > 0) {
      efficiencies.push((log.odometer - prev.odometer) / log.liters);
    }
    prev = log;
  }

  const avgLiters = logs.length > 0 ? logs.reduce((sum, l) => sum + l.liters, 0) / logs.length : null;
  const kmPerLiter = efficiencies.length > 0 ? efficiencies.reduce((sum, v) => sum + v, 0) / efficiencies.length : null;

  return { kmPerLiter, avgLiters };
}
