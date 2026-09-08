import type { FuelLog, FuelType } from "./types";
import type { DistanceUnit, VolumeUnit } from "./i18n/settings-context";
import { KM_TO_MI, L_TO_GAL } from "./i18n/format";

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

// FuelLog.liters는 필드명과 달리 전기차는 충전량(kWh)을 저장하는 용도로 재사용된다.
// kWh는 갤런으로 환산할 수 있는 값이 아니므로 전기차는 부피 단위 설정을 따르지 않는다.
function usesGallons(fuelType: FuelType | null, volumeUnit: VolumeUnit): boolean {
  return fuelType !== "ELECTRIC" && volumeUnit === "gal";
}

export function fuelVolumeUnit(fuelType: FuelType | null, volumeUnit: VolumeUnit = "L"): string {
  if (fuelType === "ELECTRIC") return "kWh";
  return volumeUnit === "gal" ? "gal" : "L";
}

// DB는 항상 리터(전기차는 kWh)로 저장한다 — 표시할 때만 환산하고, 입력값은 저장 직전에
// 되돌린다. 두 함수는 서로의 역이라 왕복해도 값이 어긋나지 않는다.
export function toDisplayVolume(
  liters: number,
  fuelType: FuelType | null,
  volumeUnit: VolumeUnit,
): number {
  return usesGallons(fuelType, volumeUnit) ? liters * L_TO_GAL : liters;
}

export function toStoredVolume(
  displayed: number,
  fuelType: FuelType | null,
  volumeUnit: VolumeUnit,
): number {
  return usesGallons(fuelType, volumeUnit) ? displayed / L_TO_GAL : displayed;
}

// 배지·축 라벨에는 기호(L·gal·kWh)를 쓰지만, "리터당 단가" 같은 문장에는 기호보다
// 풀어쓴 이름이 자연스러워서 번역 키를 따로 돌려준다.
export function fuelVolumeNameKey(
  fuelType: FuelType | null,
  volumeUnit: VolumeUnit,
): "volumeNameKwh" | "volumeNameGallon" | "volumeNameLiter" {
  if (fuelType === "ELECTRIC") return "volumeNameKwh";
  return volumeUnit === "gal" ? "volumeNameGallon" : "volumeNameLiter";
}

export function efficiencyUnitLabels(
  fuelType: FuelType | null,
  distanceUnit: DistanceUnit = "km",
  volumeUnit: VolumeUnit = "L",
): { perUnit: string; per100: string } {
  const distance = distanceUnit === "mi" ? "mi" : "km";
  const volume = fuelVolumeUnit(fuelType, volumeUnit);
  // 마일+갤런 조합만은 "mi/gal"보다 관용 표기인 mpg가 훨씬 잘 읽힌다.
  const perUnit = distance === "mi" && volume === "gal" ? "mpg" : `${distance}/${volume}`;
  return { perUnit, per100: `${volume}/100${distance}` };
}

// 연비(거리÷부피)는 거리 환산을 곱하고 부피 환산을 나눈다. 소모율(부피÷거리)은 그 반대다.
function distanceFactor(distanceUnit: DistanceUnit): number {
  return distanceUnit === "mi" ? KM_TO_MI : 1;
}

export function toDisplayEfficiency(
  kmPerLiter: number,
  fuelType: FuelType | null,
  distanceUnit: DistanceUnit,
  volumeUnit: VolumeUnit,
): number {
  const volume = usesGallons(fuelType, volumeUnit) ? L_TO_GAL : 1;
  return (kmPerLiter * distanceFactor(distanceUnit)) / volume;
}

export function toDisplayConsumption(
  litersPer100Km: number,
  fuelType: FuelType | null,
  distanceUnit: DistanceUnit,
  volumeUnit: VolumeUnit,
): number {
  const volume = usesGallons(fuelType, volumeUnit) ? L_TO_GAL : 1;
  return (litersPer100Km * volume) / distanceFactor(distanceUnit);
}
