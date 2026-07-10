import type { FuelLog, FuelType } from "./types";

export type FuelEfficiencyPoint = {
  logId: string;
  date: string;
  odometer: number;
  distanceKm: number;
  kmPerLiter: number;
  litersPer100Km: number;
};

// "가득 채움" 기록끼리만 비교해야 정확한 연비가 나온다(중간에 부분 주유가 있으면
// 그 구간은 건너뛴다). 두 가득 채움 사이의 주행거리를 이번 가득 채움에 넣은 양으로
// 나눈다 — 내역 화면의 개별 연비 배지와 동일한 계산식이라 두 화면의 숫자가 항상 일치한다.
export function computeFuelEfficiencyPoints(fuelLogs: FuelLog[]): FuelEfficiencyPoint[] {
  const ascLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const points: FuelEfficiencyPoint[] = [];
  let prevFullTank: FuelLog | null = null;

  for (const log of ascLogs) {
    if (!log.fullTank) continue;
    if (prevFullTank && log.odometer > prevFullTank.odometer && log.liters > 0) {
      const distanceKm = log.odometer - prevFullTank.odometer;
      points.push({
        logId: log.id,
        date: log.date,
        odometer: log.odometer,
        distanceKm,
        kmPerLiter: distanceKm / log.liters,
        litersPer100Km: (log.liters / distanceKm) * 100,
      });
    }
    prevFullTank = log;
  }

  return points;
}

export function efficiencyUnitLabels(fuelType: FuelType | null): { perUnit: string; per100: string } {
  if (fuelType === "ELECTRIC") return { perUnit: "km/kWh", per100: "kWh/100km" };
  return { perUnit: "km/L", per100: "L/100km" };
}

// FuelLog.liters는 필드명과 달리 전기차는 충전량(kWh)을 저장하는 용도로 재사용된다.
export function fuelVolumeUnit(fuelType: FuelType | null): string {
  return fuelType === "ELECTRIC" ? "kWh" : "L";
}
