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
  return "osm";
}
