import { haversineKm } from "./geo.js";

export const RPM_ACTIVE_THRESHOLD = 400;
export const OBD_SPEED_THRESHOLD_KMH = 8;
export const GPS_SPEED_THRESHOLD_KMH = 18;
export const GPS_MIN_DISPLACEMENT_KM = 0.08;
// 오도미터 증가 규칙은 "바로 직전 측정값 대비 늘었다"일 때만 이 포인트의 주행을 뜻한다.
// 직전 포인트가 한참 전이면(연결 끊김, 이미 트립으로 닫혀 조회에서 빠진 구간 등) 그 사이
// 증가분을 이 포인트의 주행으로 볼 수 없다 — 주차 중인 포인트가 "주행 중"으로 잘못
// 판정되어 0km 트립이 생기는 원인이었다.
export const ODOMETER_RULE_MAX_GAP_MINUTES = 10;

export type TripDetectionPoint = {
  time: Date;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  rpm: number | null;
  odometer: number | null;
  source: string;
  inVehicle: boolean | null;
};

// inVehicle이 명시되면 그 값을 신뢰하고, 없으면 OBD/GPS 신호로 서버가 추론한다.
// 트립 경로 계산을 위해 lat/lon이 있는 포인트에서만 호출한다.
export function isActivePoint(point: TripDetectionPoint, prev: TripDetectionPoint | null): boolean {
  if (point.inVehicle !== null && point.inVehicle !== undefined) {
    return point.inVehicle;
  }

  if (
    prev &&
    point.odometer !== null &&
    prev.odometer !== null &&
    point.odometer > prev.odometer &&
    point.time.getTime() - prev.time.getTime() <= ODOMETER_RULE_MAX_GAP_MINUTES * 60 * 1000
  ) {
    return true;
  }

  if (point.rpm !== null && point.rpm >= RPM_ACTIVE_THRESHOLD) {
    return true;
  }

  if (
    point.source === "obd_app_get" &&
    point.speed !== null &&
    point.speed >= OBD_SPEED_THRESHOLD_KMH
  ) {
    return true;
  }

  if (
    point.speed !== null &&
    point.speed >= GPS_SPEED_THRESHOLD_KMH &&
    prev &&
    prev.lat !== null &&
    prev.lon !== null &&
    point.lat !== null &&
    point.lon !== null &&
    haversineKm(prev.lat, prev.lon, point.lat, point.lon) >= GPS_MIN_DISPLACEMENT_KM
  ) {
    return true;
  }

  return false;
}
