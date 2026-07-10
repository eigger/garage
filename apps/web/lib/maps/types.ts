import type { MapProvider } from "@garage/shared";

export type MapProvidersConfig = {
  providers: MapProvider[];
  kakaoAppKey: string | null;
  naverClientId: string | null;
  tmapAppKey: string | null;
};

export const MAP_PROVIDER_STORAGE_KEY = "garage_map_provider";

export function isMapProvider(value: string): value is MapProvider {
  return value === "osm" || value === "kakao" || value === "naver" || value === "tmap";
}

export function pickDefaultProvider(config: MapProvidersConfig): MapProvider {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(MAP_PROVIDER_STORAGE_KEY) : null;
  if (saved && isMapProvider(saved) && config.providers.includes(saved)) {
    return saved;
  }
  // 사용자가 직접 고른 적이 없다면 osm으로 고정하지 말고, 연동된 지도 API(카카오/네이버/티맵)가
  // 있으면 그걸 우선 사용한다 — API 연동 상태가 실제 지도 표시에 반영되도록.
  const preferred = config.providers.find((p) => p !== "osm");
  return preferred ?? "osm";
}
