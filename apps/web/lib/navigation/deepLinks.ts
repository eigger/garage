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
      return `https://map.kakao.com/link/to/${name},${dest.lat},${dest.lon}`;
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
