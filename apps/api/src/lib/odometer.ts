import { prisma } from "./prisma.js";

// 이제 차량(Vehicle) 모델에 저장된 누적 주행거리(odometer) 값을 현재 주행거리로 간주한다.
export async function getLatestOdometer(vehicleId: string): Promise<number> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { odometer: true },
  });
  return vehicle?.odometer ?? 0;
}

// OBD/브리지가 비정상 값을 한 번 보내면(예: 999999) 차량 주행거리가 영구히 올라가 km 기준 정비 항목이
// 전부 기한 초과가 되고 푸시가 나간다. 내려가는 경로는 수동 수정뿐이라, 이 이상 뛰는 값은 반영하지 않는다
// (원시 텔레메트리에는 그대로 남는다).
export const MAX_ODOMETER_JUMP_KM = 5000;

/**
 * 차량 주행거리(current)를 새 값(odometer)으로 올려도 되는지 판단한다.
 * - 아직 주행거리를 모르는(0) 차량의 첫 값은 받는다.
 * - 직전 값보다 MAX_ODOMETER_JUMP_KM 이내로 늘었으면 받는다.
 * - 차량 값이 실제보다 많이 낮게 입력된 경우(등록 때 대충 입력 등)에는 기준이 영영 못 따라잡으므로,
 *   직전 "원시 텔레메트리" 값과 이어지는(같거나 조금 큰) 값이면 두 번째 근거로 받아 스스로 회복한다.
 *   한 번짜리 튀는 값은 직전 원시값과 이어지지 않아 걸러진다.
 */
export function isPlausibleOdometerBump(
  currentOdometer: number,
  odometer: number,
  previousRawOdometer?: number | null,
): boolean {
  if (odometer <= currentOdometer) return false;
  if (currentOdometer === 0 || odometer - currentOdometer <= MAX_ODOMETER_JUMP_KM) return true;
  return (
    previousRawOdometer !== undefined &&
    previousRawOdometer !== null &&
    // 엄격 증가여야 한다 — 읽기 실패 때 반복되는 고정 센티넬 값(999999 등)이 두 번째에 통과하지 못한다.
    odometer > previousRawOdometer &&
    odometer - previousRawOdometer <= MAX_ODOMETER_JUMP_KM
  );
}
