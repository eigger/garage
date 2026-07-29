import polyline from "@mapbox/polyline";
import proj4 from "proj4";

const EARTH_RADIUS_KM = 6371;

const KATEC_PROJ =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("KATEC", KATEC_PROJ);

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

export function wgs84ToKatec(lon: number, lat: number): { x: number; y: number } {
  const [x, y] = proj4("EPSG:4326", "KATEC", [lon, lat]);
  return { x: Math.round(x), y: Math.round(y) };
}

export function katecToWgs84(x: number, y: number): { lat: number; lon: number } {
  const [lon, lat] = proj4("KATEC", "EPSG:4326", [x, y]);
  return { lat, lon };
}

// 지도 표시용으로 좌표 배열을 구글 폴리라인 형식 문자열로 압축한다.
export function encodeRoute(points: Array<{ lat: number; lon: number }>): string {
  return polyline.encode(points.map((p) => [p.lat, p.lon]));
}

interface LatLon {
  lat: number;
  lon: number;
}

const METERS_PER_DEGREE_LAT = 111_320;

// 위경도를 lineStart 기준 로컬 평면(미터)으로 근사 투영한다. 트립 하나의 반경(수십km 이내)에서는
// 구면 삼각법 없이도 점-선분 수직거리 계산에 충분히 정확하다.
function perpendicularDistanceMeters(point: LatLon, lineStart: LatLon, lineEnd: LatLon): number {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(lineStart.lat));
  const toXY = (p: LatLon) => ({ x: p.lon * metersPerDegreeLon, y: p.lat * METERS_PER_DEGREE_LAT });

  const p = toXY(point);
  const a = toXY(lineStart);
  const b = toXY(lineEnd);

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const closestX = a.x + clampedT * dx;
  const closestY = a.y + clampedT * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

// Douglas-Peucker — 재귀 대신 명시적 스택을 써서 포인트가 아주 많은(몇 시간짜리) 트립에서도
// 콜스택 깊이 걱정 없이 동작한다.
function douglasPeucker<T extends LatLon>(points: T[], toleranceMeters: number): T[] {
  if (points.length < 3) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop()!;
    if (endIdx - startIdx < 2) continue;

    const first = points[startIdx];
    const last = points[endIdx];

    let maxDistance = 0;
    let maxIndex = startIdx;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const distance = perpendicularDistanceMeters(points[i], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > toleranceMeters) {
      keep[maxIndex] = true;
      stack.push([startIdx, maxIndex]);
      stack.push([maxIndex, endIdx]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

// 트립 경로를 지도에 그릴 때만 쓰는 표시용 단순화 — 저장된 원본 TelemetryRaw는 건드리지
// 않는다. 포인트 수가 임계값 이하인(대부분의 출퇴근용) 트립은 그대로 반환해서 짧은
// 트립에는 아무 영향이 없고, 장거리·장시간 주행처럼 포인트가 많이 쌓인 경우에만 적용된다.
export function simplifyRouteForDisplay<T extends LatLon>(
  points: T[],
  { minPointsToSimplify = 500, toleranceMeters = 3 }: { minPointsToSimplify?: number; toleranceMeters?: number } = {},
): T[] {
  if (points.length <= minPointsToSimplify) return points;
  return douglasPeucker(points, toleranceMeters);
}
