import polyline from "@mapbox/polyline";

export type LatLon = { lat: number; lon: number };

export function decodeRoute(encoded: string): LatLon[] {
  if (!encoded) return [];
  return polyline.decode(encoded).map(([lat, lon]) => ({ lat, lon }));
}
