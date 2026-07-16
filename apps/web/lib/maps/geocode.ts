import { loadKakaoMaps, loadNaverMaps } from "./loadSdk";
import type { MapProvidersConfig } from "./types";

export type GeocodeResult = { lat: number; lon: number };

export async function geocodeAddress(
  mapConfig: MapProvidersConfig,
  address: string,
): Promise<GeocodeResult | null> {
  if (!address.trim()) return null;

  if (mapConfig.kakaoAppKey) {
    await loadKakaoMaps(mapConfig.kakaoAppKey);
    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services) return null;
    return new Promise((resolve) => {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.addressSearch(address, (result: any[], status: any) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          resolve({ lat: Number(result[0].y), lon: Number(result[0].x) });
        } else {
          resolve(null);
        }
      });
    });
  }

  if (mapConfig.naverClientId) {
    await loadNaverMaps(mapConfig.naverClientId);
    const naver = (window as any).naver;
    if (!naver?.maps?.Service) return null;
    return new Promise((resolve) => {
      naver.maps.Service.geocode({ query: address }, (status: any, response: any) => {
        const items = response?.v2?.addresses;
        if (status === naver.maps.Service.Status.ERROR || !items || items.length === 0) {
          resolve(null);
          return;
        }
        resolve({ lat: Number(items[0].y), lon: Number(items[0].x) });
      });
    });
  }

  return null;
}

export async function reverseGeocode(
  mapConfig: MapProvidersConfig,
  lat: number,
  lon: number,
): Promise<string | null> {
  if (mapConfig.kakaoAppKey) {
    await loadKakaoMaps(mapConfig.kakaoAppKey);
    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services) return null;
    return new Promise((resolve) => {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.coord2Address(lon, lat, (result: any[], status: any) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const roadAddress = result[0].road_address?.address_name;
          const jibunAddress = result[0].address?.address_name;
          resolve(roadAddress || jibunAddress || null);
        } else {
          resolve(null);
        }
      });
    });
  }

  if (mapConfig.naverClientId) {
    await loadNaverMaps(mapConfig.naverClientId);
    const naver = (window as any).naver;
    if (!naver?.maps?.Service) return null;
    return new Promise((resolve) => {
      naver.maps.Service.reverseGeocode(
        {
          coords: new naver.maps.LatLng(lat, lon),
          orders: [naver.maps.Service.OrderType.ROAD_ADDR, naver.maps.Service.OrderType.ADDR].join(","),
        },
        (status: any, response: any) => {
          const items = response?.v2?.results;
          if (status === naver.maps.Service.Status.ERROR || !items || items.length === 0) {
            resolve(null);
            return;
          }
          const region = items[0].region;
          const land = items[0].land;
          const parts = [region?.area1?.name, region?.area2?.name, region?.area3?.name, land?.name, land?.number1]
            .filter(Boolean);
          resolve(parts.length > 0 ? parts.join(" ") : null);
        },
      );
    });
  }

  return null;
}
