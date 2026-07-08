import polyline from "@mapbox/polyline";

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// 두 좌표 간 거리(km). 연속된 GPS 포인트 사이 거리를 누적해서 트립 총 거리를 구하는 데 쓴다.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// 지도 표시용으로 좌표 배열을 구글 폴리라인 형식 문자열로 압축한다.
export function encodeRoute(points: Array<{ lat: number; lon: number }>): string {
  return polyline.encode(points.map((p) => [p.lat, p.lon]));
}
