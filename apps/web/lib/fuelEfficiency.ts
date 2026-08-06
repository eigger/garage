import type { FuelLog, FuelType } from "./types";

export type FuelEfficiencyPoint = {
  logId: string;
  date: string;
  odometer: number;
  distanceKm: number;
  kmPerLiter: number;
  litersPer100Km: number;
};

// "가득 채움" 두 번을 구간의 시작·끝으로 삼아야 정확한 연비가 나온다. 그 사이에 낀
// 부분 주유는 구간 경계로는 안 쓰지만(다음 가득 채움까지 안 채운 상태라 총 소모량을
// 아직 모름), 그 구간에서 실제로 넣은 연료이므로 리터 합계에는 반드시 포함해야 한다 —
// 안 그러면 부분 주유로 넣은 양만큼 거리는 세고 연료는 안 센 꼴이 되어 연비가 과대평가된다.
// 내역 화면의 개별 연비 배지와 동일한 계산식이라 두 화면의 숫자가 항상 일치한다.
export function computeFuelEfficiencyPoints(fuelLogs: FuelLog[]): FuelEfficiencyPoint[] {
  const ascLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const points: FuelEfficiencyPoint[] = [];
  let prevFullTank: FuelLog | null = null;
  let litersSincePrevFullTank = 0;

  for (const log of ascLogs) {
    litersSincePrevFullTank += log.liters;
    if (!log.fullTank) continue;

    if (prevFullTank && log.odometer > prevFullTank.odometer && litersSincePrevFullTank > 0) {
      const distanceKm = log.odometer - prevFullTank.odometer;
      points.push({
        logId: log.id,
        date: log.date,
        odometer: log.odometer,
        distanceKm,
        kmPerLiter: distanceKm / litersSincePrevFullTank,
        litersPer100Km: (litersSincePrevFullTank / distanceKm) * 100,
      });
    }
    prevFullTank = log;
    litersSincePrevFullTank = 0;
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
