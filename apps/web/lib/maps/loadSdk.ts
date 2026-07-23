// id별로 진행 중인 로드의 Promise를 공유한다 — 여러 트립 카드가 동시에 지오코딩을 요청하면
// (history 페이지에서 트립마다 await 없이 loadKakaoMaps를 호출) 스크립트 태그가 막 추가된
// 직후(아직 로드는 안 끝난) 상태를 "이미 존재하니 로드 완료"로 착각해 즉시 통과시키는 문제가
// 있었다 — 그러면 window.kakao가 아직 없어 뒤이은 호출들이 에러를 던지고, 그 에러를 삼키는
// 호출부(reverseGeocode 사용처) 때문에 해당 트립의 주소가 세션 내내 영영 안 나왔다.
const scriptLoadPromises = new Map<string, Promise<void>>();

export function loadScript(src: string, id: string): Promise<void> {
  const existing = scriptLoadPromises.get(id);
  if (existing) return existing;

  if (document.getElementById(id)) {
    const resolved = Promise.resolve();
    scriptLoadPromises.set(id, resolved);
    return resolved;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromises.delete(id);
      script.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
  scriptLoadPromises.set(id, promise);
  return promise;
}

export async function loadKakaoMaps(appKey: string): Promise<void> {
  const id = "kakao-maps-sdk";
  if (!(window as KakaoWindow).kakao?.maps) {
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`, id);
  }
  const kakao = (window as KakaoWindow).kakao;
  if (!kakao?.maps) throw new Error("Kakao maps SDK unavailable");
  await new Promise<void>((resolve) => kakao.maps.load(() => resolve()));
}

export async function loadNaverMaps(clientId: string): Promise<void> {
  const id = "naver-maps-sdk";
  if (!(window as NaverWindow).naver?.maps) {
    await loadScript(
      `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}&submodules=geocoder`,
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
