import { haversineKm } from "./geo.js";

export const RPM_ACTIVE_THRESHOLD = 400;
export const OBD_SPEED_THRESHOLD_KMH = 8;
export const GPS_SPEED_THRESHOLD_KMH = 18;
export const GPS_MIN_DISPLACEMENT_KM = 0.08;

export type TripDetectionPoint = {
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
    point.odometer > prev.odometer
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
