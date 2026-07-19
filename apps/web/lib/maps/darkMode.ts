// 카카오/네이버/티맵 SDK는 공식 다크 스킨을 제공하지 않아서, invert+hue-rotate 조합으로
// 다크모드를 흉내낸다. 이 조합은 채도가 있는 색은 색상(hue)을 대체로 그대로 유지하면서
// 밝기만 뒤집기 때문에(흰 배경→검정, 어두운 마커색→밝은 마커색) 별도로 마커 색상을
// 보정하지 않아도 자연스럽게 어울린다.
export const DARK_MAP_FILTER = "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)";

// OSM은 필터 대신 진짜 다크 타일(CARTO Dark Matter, 무료/키 불필요)을 쓴다 — 화질이 더 좋다.
export const OSM_TILE_LIGHT = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

export const OSM_TILE_DARK = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};
