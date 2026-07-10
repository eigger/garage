import polyline from "@mapbox/polyline";

export type LatLon = { lat: number; lon: number };

export function decodeRoute(encoded: string): LatLon[] {
  if (!encoded) return [];
  return polyline.decode(encoded).map(([lat, lon]) => ({ lat, lon }));
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

// 포인트가 너무 많으면 화살표가 겹치므로, 경로를 대략 균등한 간격의 N개 지점으로 샘플링한다.
export function sampleForArrows(points: LatLon[], maxArrows: number): { point: LatLon; bearing: number }[] {
  if (points.length < 2) return [];
  const step = Math.max(1, Math.ceil(points.length / maxArrows));
  const result: { point: LatLon; bearing: number }[] = [];
  for (let i = step; i < points.length; i += step) {
    result.push({ point: points[i], bearing: bearingDeg(points[i - 1], points[i]) });
  }
  return result;
}
