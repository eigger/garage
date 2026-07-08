import { prisma } from "./prisma.js";

// fuelLogs와 maintenanceRecords에 기록된 값 중 가장 큰 주행거리를 "현재 주행거리"로 간주한다.
// 두 기록 모두 사용자가 그때그때 입력하는 실제 계기판 값이라 날짜순보다 최댓값이 더 안전하다.
export async function getLatestOdometer(vehicleId: string): Promise<number> {
  const [fuel, maintenance] = await Promise.all([
    prisma.fuelLog.aggregate({ where: { vehicleId }, _max: { odometer: true } }),
    prisma.maintenanceRecord.aggregate({ where: { vehicleId }, _max: { odometer: true } }),
  ]);

  return Math.max(fuel._max.odometer ?? 0, maintenance._max.odometer ?? 0);
}
