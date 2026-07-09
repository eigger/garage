export function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadKakaoMaps(appKey: string): Promise<void> {
  const id = "kakao-maps-sdk";
  if (!(window as KakaoWindow).kakao?.maps) {
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`, id);
  }
  const kakao = (window as KakaoWindow).kakao;
  if (!kakao?.maps) throw new Error("Kakao maps SDK unavailable");
  await new Promise<void>((resolve) => kakao.maps.load(() => resolve()));
}

export async function loadNaverMaps(clientId: string): Promise<void> {
  const id = "naver-maps-sdk";
  if (!(window as NaverWindow).naver?.maps) {
    await loadScript(
      `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`,
      id,
    );
  }
  if (!(window as NaverWindow).naver?.maps) {
    throw new Error("Naver maps SDK unavailable");
  }
}

export async function loadTmapSdk(appKey: string): Promise<void> {
  const id = "tmap-sdk";
  if (!(window as { Tmapv2?: unknown }).Tmapv2) {
    await loadScript(`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${appKey}`, id);
  }
  if (!(window as { Tmapv2?: unknown }).Tmapv2) {
    throw new Error("Tmap SDK unavailable");
  }
}

type KakaoWindow = Window & {
  kakao?: {
    maps: {
      load: (cb: () => void) => void;
      Map: new (el: HTMLElement, opts: object) => KakaoMap;
      LatLng: new (lat: number, lon: number) => object;
      LatLngBounds: new () => { extend: (ll: object) => void };
      Polyline: new (opts: object) => { setMap: (map: KakaoMap) => void };
    };
  };
};

type KakaoMap = { setBounds: (bounds: object) => void };

type NaverWindow = Window & {
  naver?: {
    maps: {
      Map: new (el: HTMLElement, opts: object) => NaverMap;
      LatLng: new (lat: number, lon: number) => object;
      LatLngBounds: new (a: object, b: object) => object;
      Polyline: new (opts: object) => NaverPolyline;
    };
  };
};

type NaverMap = { fitBounds: (bounds: object) => void };
type NaverPolyline = object;
