export type NavProvider = "kakao" | "naver" | "tmap";

export type NavDestination = {
  lat: number;
  lon: number;
  name: string;
};

export function buildNavUrl(provider: NavProvider, dest: NavDestination): string {
  const name = encodeURIComponent(dest.name);
  switch (provider) {
    case "kakao":
      // map.kakao.com/link/to/... 는 웹 링크라 폰에서 앱으로 넘어가지 않고 웹 지도만 뜬다
      // — 목적지가 안 잡힌다. 네이버(nmap://)·티맵(tmap://)처럼 앱 스킴을 쓴다.
      // sp를 비우면 현재 위치가 출발지다.
      return `kakaomap://route?ep=${dest.lat},${dest.lon}&by=CAR`;
    case "naver":
      return `nmap://route/car?dlat=${dest.lat}&dlng=${dest.lon}&dname=${name}&appname=garage`;
    case "tmap":
      return `tmap://route?goalname=${name}&goaly=${dest.lat}&goalx=${dest.lon}`;
  }
}

export function buildNavWebFallback(provider: NavProvider, dest: NavDestination): string {
  const name = encodeURIComponent(dest.name);
  switch (provider) {
    case "kakao":
      return `https://map.kakao.com/link/to/${name},${dest.lat},${dest.lon}`;
    case "naver":
      return `https://map.naver.com/v5/search/${name}`;
    case "tmap":
      return `https://tmapapi.tmapmobility.com/main.html`;
  }
}
