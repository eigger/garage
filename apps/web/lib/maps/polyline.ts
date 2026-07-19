import polyline from "@mapbox/polyline";

export type LatLon = { lat: number; lon: number };
export type SpeedPoint = LatLon & { speed: number | null };

export function decodeRoute(encoded: string): LatLon[] {
  if (!encoded) return [];
  return polyline.decode(encoded).map(([lat, lon]) => ({ lat, lon }));
}

// km/h 구간별 색상 — 정체/저속(빨강), 보통(주황), 원활/고속(초록). 속도 데이터가 없으면
// 기본 색상(경로 단색 표시와 동일)으로 폴백한다.
export function speedColor(kmh: number | null): string {
  if (kmh === null) return "#18523f";
  if (kmh < 20) return "#ef4444";
  if (kmh < 60) return "#f59e0b";
  return "#10b981";
}

// 연속된 구간을 속도 색상별로 묶어서, 색이 바뀌는 지점마다 폴리라인을 새로 그리지 않고
// 최소 개수의 세그먼트로 병합한다 (경계에서 끊기지 않도록 마지막 점을 다음 세그먼트와 공유).
export function buildSpeedSegments(points: SpeedPoint[]): { color: string; path: LatLon[] }[] {
  if (points.length < 2) return [];

  const segmentColors: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s1 = points[i].speed;
    const s2 = points[i + 1].speed;
    const avg = s1 !== null && s2 !== null ? (s1 + s2) / 2 : s1 ?? s2 ?? null;
    segmentColors.push(speedColor(avg));
  }

  const result: { color: string; path: LatLon[] }[] = [];
  let currentColor = segmentColors[0];
  let currentPath: LatLon[] = [points[0], points[1]];
  for (let i = 1; i < segmentColors.length; i++) {
    if (segmentColors[i] === currentColor) {
      currentPath.push(points[i + 1]);
    } else {
      result.push({ color: currentColor, path: currentPath });
      currentColor = segmentColors[i];
      currentPath = [points[i], points[i + 1]];
    }
  }
  result.push({ color: currentColor, path: currentPath });
  return result;
}

// a에서 b를 바라보는 방위각(도, 0=북쪽 기준 시계방향) — 경로에 진행 방향 화살표를 표시하기 위함.
export function bearingDeg(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// 카카오/네이버/티맵 SDK는 각자 다른 마커 아이콘 API를 쓰지만 전부 이미지 URL(또는 data URI)은
// 받아들이므로, 출발/도착 지점을 색상으로 구분하는 원형 아이콘을 공용으로 생성한다.
export function circleMarkerDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

// 지도 마커와 리스트 항목을 같은 번호로 매칭시켜 보여주기 위한 원형 숫자 마커 —
// provider마다 클릭 이벤트 API가 달라 상호 강조(hover/click highlight) 대신
// 이 방식으로 "어떤 게 어떤 마커인지"를 알 수 있게 한다.
export function numberedMarkerDataUri(num: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="#fff" stroke-width="2"/><text x="12" y="16.5" font-family="sans-serif" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${num}</text></svg>`;
  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

// 작은 트립 지도 카드(240px)에 너무 많으면 지저분해지고, 포인트가 시간 간격 기준이라
// 정체 구간에 몰릴 수도 있어서 4개로 제한한다 — 4개 provider(OSM/카카오/네이버/T맵) 공용.
export const ROUTE_ARROW_COUNT = 4;

// 정차 중에는 GPS 좌표가 튀면서 방위각이 엉뚱하게 나오는 경우가 많다 — 이 속도 이하는
// "정차"로 보고 화살표 계산에서 아예 제외한다(표시용 임계값일 뿐, 정체 구간 색상 표시와는 무관).
const STOPPED_SPEED_KMH = 2;

// 포인트가 너무 많으면 화살표가 겹치므로, 경로를 대략 균등한 간격의 N개 지점으로 샘플링한다.
export function sampleForArrows(points: SpeedPoint[], maxArrows: number): { point: LatLon; bearing: number }[] {
  const moving = points.filter((p) => (p.speed ?? 0) > STOPPED_SPEED_KMH);
  if (moving.length < 2) return [];
  const step = Math.max(1, Math.ceil(moving.length / maxArrows));
  const result: { point: LatLon; bearing: number }[] = [];
  for (let i = step; i < moving.length; i += step) {
    result.push({ point: moving[i], bearing: bearingDeg(moving[i - 1], moving[i]) });
  }
  return result;
}

// 카카오/네이버/티맵은 마커 아이콘에 CSS 회전을 못 걸어서(리플렛의 divIcon과 다름),
// 방위각만큼 이미 회전된 화살표를 SVG 자체에 그려서 이미지로 내려준다.
export function arrowMarkerDataUri(bearing: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><polygon points="10,3 16,15 10,11 4,15" fill="${color}" stroke="#fff" stroke-width="1" transform="rotate(${bearing} 10 10)"/></svg>`;
  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : Buffer.from(svg).toString("base64")}`;
}
