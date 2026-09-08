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

export type FuelCostPerDistancePoint = {
  logId: string;
  date: string;
  odometer: number;
  distanceKm: number;
  cost: number;
  costPerKm: number;
};

// 연비와 달리 "가득 채움" 조건이 필요 없다 — 직전 주유 이후 달린 거리(주행거리계 차이)와
// 이번에 지불한 금액은 탱크 잔량과 무관하게 둘 다 확정된 값이기 때문이다. 그래서 부분 주유만
// 반복하는 사용 패턴에서도 주유할 때마다 점이 하나씩 생긴다. 대신 한 번에 얼마를 넣었는지에
// 따라 구간별로 출렁이므로(적게 넣은 다음 구간은 낮게, 그다음은 높게 나온다) 개별 점의 값보다
// 추세를 보는 용도다.
export function computeFuelCostPerDistancePoints(fuelLogs: FuelLog[]): FuelCostPerDistancePoint[] {
  const ascLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const points: FuelCostPerDistancePoint[] = [];
  let prev: FuelLog | null = null;

  for (const log of ascLogs) {
    if (!prev) {
      prev = log;
      continue;
    }

    // 주행거리계가 안 늘었거나 거꾸로 간 건 입력 실수다. 이때 기준점을 그 기록으로 옮기면
    // 다음 구간 거리까지 부풀려지므로, 기준점은 마지막으로 멀쩡했던 기록에 그대로 둔다.
    const distanceKm = log.odometer - prev.odometer;
    if (distanceKm <= 0) continue;

    // 금액 미입력(0원)은 나눠봐야 의미가 없어 점을 만들지 않는다. 다만 그 사이 달린 거리는
    // 실제 주행이므로, 다음 구간이 이 기록부터 시작하도록 기준점은 옮긴다.
    if (log.cost > 0) {
      points.push({
        logId: log.id,
        date: log.date,
        odometer: log.odometer,
        distanceKm,
        cost: log.cost,
        costPerKm: log.cost / distanceKm,
      });
    }
    prev = log;
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
