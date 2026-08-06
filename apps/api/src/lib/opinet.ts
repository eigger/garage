import { OPINET_PROD_DISPLAY_ORDER } from "@garage/shared";
import { katecToWgs84, wgs84ToKatec, haversineKm } from "./geo.js";
import { getSetting } from "./settings.js";

// 오피넷 자체 시도 코드(EV충전소 zcode와는 체계가 다름) — lowTop10.do 등 지역별
// 조회에 쓰는 area 파라미터. 프론트에서 역지오코딩한 주소 문자열의 첫 토큰(시도명)으로
// 변환한다(evCharger.ts의 ZCODE_BY_SIDO와 동일한 패턴).
const OPINET_AREA_BY_SIDO: Record<string, string> = {
  "서울특별시": "01",
  "경기도": "02",
  "강원특별자치도": "03",
  "강원도": "03", // 2023년 개편 이전 명칭 대응
  "충청북도": "04",
  "충청남도": "05",
  "전북특별자치도": "06",
  "전라북도": "06", // 2024년 개편 이전 명칭 대응
  "전라남도": "07",
  "경상북도": "08",
  "경상남도": "09",
  "부산광역시": "10",
  "제주특별자치도": "11",
  "대구광역시": "14",
  "인천광역시": "15",
  "광주광역시": "16",
  "대전광역시": "17",
  "울산광역시": "18",
  "세종특별자치시": "19",
};

/**
 * lowTop10.do의 area. 시군 4자리를 넣으면 해당 시군으로 좁혀진다.
 * 천안시 = 0502 (검증 완료). 그 외는 시도 2자리.
 */
export function resolveOpinetArea(address?: string | null): string | undefined {
  if (!address) return undefined;
  const trimmed = address.trim();
  // "충남 천안시 …" / "천안시 …" 모두 대응
  if (/(?:^|\s)천안/.test(trimmed)) return "0502";
  const sido = trimmed.split(/\s+/)[0];
  return OPINET_AREA_BY_SIDO[sido];
}

const BRANDS: Record<string, string> = {
  SKE: "SK에너지",
  GSC: "GS칼텍스",
  HDO: "현대오일뱅크",
  SOL: "S-OIL",
  RTE: "자영알뜰",
  RTX: "고속도로알뜰",
  NHO: "농협알뜰",
  E1G: "E1",
  SKG: "SK가스",
  ETC: "자가상표",
};

export const FUEL_CODE_MAP: Record<string, string> = {
  GASOLINE: "B027",
  DIESEL: "D047",
  LPG: "K015",
  HYBRID: "B027",
};

export type OpinetStationFuelPrice = {
  prodCd: string;
  price: number;
};

export type OpinetStationSummary = {
  id: string;
  name: string;
  brand: string;
  brandLabel: string;
  distance: number;
  /** 차량 주유종 단가(정렬·이득순용). */
  price: number;
  primaryProdCd: string;
  prices: OpinetStationFuelPrice[];
  lat: number | null;
  lon: number | null;
};

export type OpinetStationDetail = OpinetStationSummary & {
  address: string | null;
  roadAddress: string | null;
  tel: string | null;
};

function orderFuelPrices(prices: OpinetStationFuelPrice[]): OpinetStationFuelPrice[] {
  return [...prices].sort((a, b) => {
    const ai = OPINET_PROD_DISPLAY_ORDER.indexOf(a.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
    const bi = OPINET_PROD_DISPLAY_ORDER.indexOf(b.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function withPrimaryPrice(
  station: Omit<OpinetStationSummary, "price" | "primaryProdCd" | "prices"> & {
    price: number;
  },
  primaryProdCd: string,
  prices: OpinetStationFuelPrice[],
): OpinetStationSummary {
  const ordered = orderFuelPrices(prices);
  const primary = ordered.find((p) => p.prodCd === primaryProdCd);
  return {
    ...station,
    primaryProdCd,
    price: primary?.price ?? station.price,
    prices: ordered.length > 0 ? ordered : [{ prodCd: primaryProdCd, price: station.price }],
  };
}

/** aroundAll 상위 N곳만 detailById로 다유종을 붙인다(오피넷 호출 절약). */
const ENRICH_PRICE_LIMIT = 10;

export async function attachAllFuelPrices(
  stations: OpinetStationSummary[],
  fuelType: string,
  limit = ENRICH_PRICE_LIMIT,
): Promise<OpinetStationSummary[]> {
  const primaryProdCd = FUEL_CODE_MAP[fuelType] ?? "B027";
  const head = stations.slice(0, limit);
  const rest = stations.slice(limit);

  const enrichedHead = await Promise.all(
    head.map(async (station) => {
      if (station.id.startsWith("MOCK_")) return station;
      const fetched = await fetchStationPrices(station.id);
      if (!fetched?.length) {
        return withPrimaryPrice(station, primaryProdCd, [{ prodCd: primaryProdCd, price: station.price }]);
      }
      return withPrimaryPrice(
        station,
        primaryProdCd,
        fetched.map((p) => ({ prodCd: p.prodCd, price: p.price })),
      );
    }),
  );

  return [
    ...enrichedHead,
    ...rest.map((s) => withPrimaryPrice(s, primaryProdCd, [{ prodCd: primaryProdCd, price: s.price }])),
  ];
}

export function brandLabelOf(code: string): string {
  return BRANDS[code.trim().toUpperCase()] ?? "자가상표";
}

export function parseOpinetJson(text: string): unknown {
  return JSON.parse(text.replace(/[\r\n\t]/g, ""));
}

function coordsFromKatec(row: Record<string, unknown>): { lat: number; lon: number } | null {
  const katecX = Number(row.GIS_X_COOR);
  const katecY = Number(row.GIS_Y_COOR);
  if (!Number.isFinite(katecX) || !Number.isFinite(katecY)) return null;
  return katecToWgs84(katecX, katecY);
}

export type StationSort = "distance" | "price";

export async function fetchNearbyStations(
  lat: number,
  lon: number,
  fuelType: string,
  sort: StationSort = "distance",
): Promise<OpinetStationSummary[]> {
  if (fuelType === "ELECTRIC") return [];

  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey) return sortMockStations(mockStations(fuelType), sort);

  try {
    const { x, y } = wgs84ToKatec(lon, lat);
    const primaryProdCd = FUEL_CODE_MAP[fuelType] ?? "B027";
    // 오피넷 API의 sort 파라미터는 1=가격순, 2=거리순이다 (실제 API 응답으로 확인됨,
    // 공식 문서에 적힌 것과 반대라 헷갈리기 쉬움).
    const opinetSort = sort === "price" ? 1 : 2;
    const url = `https://www.opinet.co.kr/api/aroundAll.do?code=${apiKey}&out=json&x=${x}&y=${y}&radius=5000&prodcd=${primaryProdCd}&sort=${opinetSort}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet API responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    if (!data.RESULT || !Array.isArray(data.RESULT.OIL)) return [];

    return data.RESULT.OIL.map((s) => {
      const brandCode = String(s.POLL_DIV_CO || s.POLL_DIV_CD || "ETC").trim().toUpperCase();
      const coords = coordsFromKatec(s);
      // 천안사랑 화면과 거리를 맞추기 위해, 좌표가 있으면 서버 haversine으로 통일한다(D6).
      const distance =
        coords != null
          ? Math.round(haversineKm(lat, lon, coords.lat, coords.lon) * 1000)
          : Number(s.DISTANCE);
      const price = Number(s.PRICE);
      return withPrimaryPrice(
        {
          id: String(s.UNI_ID),
          name: String(s.OS_NM),
          brand: brandCode,
          brandLabel: brandLabelOf(brandCode),
          distance,
          price,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
        },
        primaryProdCd,
        [{ prodCd: primaryProdCd, price }],
      );
    });
  } catch {
    return sortMockStations(mockStations(fuelType), sort);
  }
}

function sortMockStations(stations: OpinetStationSummary[], sort: StationSort): OpinetStationSummary[] {
  return [...stations].sort((a, b) => (sort === "price" ? a.price - b.price : a.distance - b.distance));
}

export type OpinetLowPriceCandidate = {
  id: string;
  name: string;
  brandLabel: string;
  price: number;
  address: string | null;
  roadAddress: string | null;
  lat: number | null;
  lon: number | null;
};

// "이득순"(value-picks)용 — 반경 제한 없이 시도 전체에서 최저가 주유소를 가져온다.
// 지역 코드를 못 구하면(주소 역지오코딩 실패 등) 빈 배열을 돌려주고, 상위 라우트가
// insufficientData 처리를 하도록 둔다.
export async function fetchLowPriceCandidates(
  address: string | null | undefined,
  fuelType: string,
  cnt = 10,
): Promise<OpinetLowPriceCandidate[]> {
  const apiKey = await getSetting("OPINET_API_KEY");
  const area = resolveOpinetArea(address);
  if (!apiKey || !area) return [];

  try {
    const prodcd = FUEL_CODE_MAP[fuelType] ?? "B027";
    const url = `https://www.opinet.co.kr/api/lowTop10.do?code=${apiKey}&out=json&prodcd=${prodcd}&area=${area}&cnt=${cnt}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet API responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    if (!data.RESULT || !Array.isArray(data.RESULT.OIL)) return [];

    return data.RESULT.OIL.map((s) => {
      const brandCode = String(s.POLL_DIV_CO || s.POLL_DIV_CD || "ETC").trim().toUpperCase();
      const coords = coordsFromKatec(s);
      return {
        id: String(s.UNI_ID),
        name: String(s.OS_NM),
        brandLabel: brandLabelOf(brandCode),
        price: Number(s.PRICE),
        address: s.VAN_ADR ? String(s.VAN_ADR) : null,
        roadAddress: s.NEW_ADR ? String(s.NEW_ADR) : null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
      };
    });
  } catch {
    return [];
  }
}

// 가까운 주유소(기준점) 대비 왕복 추가 거리에 드는 기름값을 빼고도 남는 순이득(원).
export function computeNetGain(params: {
  baselinePrice: number;
  candidatePrice: number;
  extraRoundTripKm: number;
  avgLiters: number;
  kmPerLiter: number;
}): number {
  const { baselinePrice, candidatePrice, extraRoundTripKm, avgLiters, kmPerLiter } = params;
  const savings = (baselinePrice - candidatePrice) * avgLiters;
  const detourCost = kmPerLiter > 0 ? (extraRoundTripKm / kmPerLiter) * candidatePrice : Infinity;
  return savings - detourCost;
}

export async function fetchStationDetail(uniId: string): Promise<OpinetStationDetail | null> {
  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey) return null;

  try {
    const url = `https://www.opinet.co.kr/api/detailById.do?code=${apiKey}&id=${uniId}&out=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet detail API responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    const row = data.RESULT?.OIL?.[0];
    if (!row) return null;

    const brandCode = String(row.POLL_DIV_CD || row.POLL_DIV_CO || "ETC").trim().toUpperCase();
    const coords = coordsFromKatec(row);

    const rawPrices = row.OIL_PRICE;
    const priceList = Array.isArray(rawPrices) ? rawPrices : rawPrices ? [rawPrices] : [];
    const prices: OpinetStationFuelPrice[] = [];
    for (const item of priceList) {
      const rec = item as Record<string, unknown>;
      const prodCd = String(rec.PRODCD ?? "").trim();
      const price = Number(rec.PRICE);
      if (!prodCd || !Number.isFinite(price)) continue;
      prices.push({ prodCd, price });
    }
    const primaryProdCd = prices[0]?.prodCd ?? "B027";
    const primaryPrice = prices[0]?.price ?? 0;

    return {
      ...withPrimaryPrice(
        {
          id: String(row.UNI_ID),
          name: String(row.OS_NM),
          brand: brandCode,
          brandLabel: brandLabelOf(brandCode),
          distance: 0,
          price: primaryPrice,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
        },
        primaryProdCd,
        prices,
      ),
      address: row.VAN_ADR ? String(row.VAN_ADR) : null,
      roadAddress: row.NEW_ADR ? String(row.NEW_ADR) : null,
      tel: row.TEL ? String(row.TEL) : null,
    };
  } catch {
    return null;
  }
}

export type OpinetNameSearchHit = {
  id: string;
  name: string;
  address: string | null;
  roadAddress: string | null;
  sigunCd: string | null;
  lpgYn: string | null;
  lat: number | null;
  lon: number | null;
};

// ⑪ searchByName.do — 상호로 UNI_ID를 직접 얻는다.
export async function searchStationsByName(osnm: string, area: string): Promise<OpinetNameSearchHit[]> {
  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey || osnm.trim().length < 2) return [];

  try {
    const url = `https://www.opinet.co.kr/api/searchByName.do?code=${apiKey}&out=json&osnm=${encodeURIComponent(osnm)}&area=${area}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet searchByName responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    if (!data.RESULT || !Array.isArray(data.RESULT.OIL)) return [];

    return data.RESULT.OIL.map((s) => {
      const coords = coordsFromKatec(s);
      return {
        id: String(s.UNI_ID),
        name: String(s.OS_NM),
        address: s.VAN_ADR ? String(s.VAN_ADR) : null,
        roadAddress: s.NEW_ADR ? String(s.NEW_ADR) : null,
        sigunCd: s.SIGUNCD ? String(s.SIGUNCD).trim() : null,
        lpgYn: s.LPG_YN ? String(s.LPG_YN).trim() : null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
      };
    });
  } catch {
    return [];
  }
}

export type OpinetFuelPrice = {
  prodCd: string;
  price: number;
  tradeAt: Date;
};

function parseTradeAt(tradeDt: unknown, tradeTm: unknown): Date | null {
  const dt = String(tradeDt ?? "").replace(/\D/g, "");
  const tm = String(tradeTm ?? "").replace(/\D/g, "").padStart(6, "0");
  if (dt.length !== 8) return null;
  const y = Number(dt.slice(0, 4));
  const mo = Number(dt.slice(4, 6));
  const d = Number(dt.slice(6, 8));
  const h = Number(tm.slice(0, 2));
  const mi = Number(tm.slice(2, 4));
  const s = Number(tm.slice(4, 6));
  // 오피넷 TRADE_* 는 KST 벽시계이므로 UTC 오프셋(+9)으로 저장한다.
  const ms = Date.UTC(y, mo - 1, d, h - 9, mi, s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

// detailById의 OIL_PRICE[] 전체를 반환 — 천안사랑카드 가격 캐시용.
export async function fetchStationPrices(uniId: string): Promise<OpinetFuelPrice[] | null> {
  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey) return null;

  try {
    const url = `https://www.opinet.co.kr/api/detailById.do?code=${apiKey}&id=${uniId}&out=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet detail API responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    const row = data.RESULT?.OIL?.[0];
    if (!row) return null;

    const raw = row.OIL_PRICE;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const prices: OpinetFuelPrice[] = [];
    for (const item of list) {
      const rec = item as Record<string, unknown>;
      const prodCd = String(rec.PRODCD ?? "").trim();
      const price = Number(rec.PRICE);
      const tradeAt = parseTradeAt(rec.TRADE_DT, rec.TRADE_TM);
      if (!prodCd || !Number.isFinite(price) || !tradeAt) continue;
      prices.push({ prodCd, price, tradeAt });
    }
    return prices;
  } catch {
    return null;
  }
}

// aroundAll 좌표 폴백 매칭용. prodcd는 필수 — LPG 전용 충전소는 K015로 조회해야 한다.
export async function fetchAroundStations(
  lat: number,
  lon: number,
  radiusM: number,
  prodcd = "B027",
): Promise<Array<{ id: string; name: string; lat: number | null; lon: number | null; distance: number }>> {
  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey) return [];

  try {
    const { x, y } = wgs84ToKatec(lon, lat);
    const radius = Math.min(Math.max(1, Math.round(radiusM)), 5000);
    const url = `https://www.opinet.co.kr/api/aroundAll.do?code=${apiKey}&out=json&x=${x}&y=${y}&radius=${radius}&prodcd=${prodcd}&sort=2`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet aroundAll responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    if (!data.RESULT || !Array.isArray(data.RESULT.OIL)) return [];

    return data.RESULT.OIL.map((s) => {
      const coords = coordsFromKatec(s);
      return {
        id: String(s.UNI_ID),
        name: String(s.OS_NM),
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        distance: Number(s.DISTANCE),
      };
    });
  } catch {
    return [];
  }
}

function mockStations(fuelType: string): OpinetStationSummary[] {
  // 목 데이터도 좌표를 넣어 네비/지도 경로가 깨지지 않게 한다(서울시청 인근).
  const primaryProdCd = FUEL_CODE_MAP[fuelType] ?? "B027";
  const gasoline = 1650;
  const diesel = 1430;
  const lpg = 1010;
  const primary =
    fuelType === "DIESEL" ? diesel : fuelType === "LPG" ? lpg : gasoline;

  const rows = [
    { id: "MOCK_SKE", name: "하늘길 SK에너지 주유소", brand: "SKE", brandLabel: "SK에너지", distance: 240, delta: -5, lat: 37.5675, lon: 126.9785 },
    { id: "MOCK_GSC", name: "동행 GS칼텍스 주유소", brand: "GSC", brandLabel: "GS칼텍스", distance: 450, delta: 12, lat: 37.5655, lon: 126.98 },
    { id: "MOCK_SOL", name: "믿음 가득 S-OIL 주유소", brand: "SOL", brandLabel: "S-OIL", distance: 820, delta: -10, lat: 37.564, lon: 126.975 },
    { id: "MOCK_HDO", name: "오션 현대오일뱅크 주유소", brand: "HDO", brandLabel: "현대오일뱅크", distance: 1100, delta: 5, lat: 37.57, lon: 126.982 },
  ];

  return rows.map((r) =>
    withPrimaryPrice(
      {
        id: r.id,
        name: r.name,
        brand: r.brand,
        brandLabel: r.brandLabel,
        distance: r.distance,
        price: primary + r.delta,
        lat: r.lat,
        lon: r.lon,
      },
      primaryProdCd,
      [
        { prodCd: "B027", price: gasoline + r.delta },
        { prodCd: "D047", price: diesel + r.delta },
        { prodCd: "K015", price: lpg + Math.round(r.delta / 2) },
      ],
    ),
  );
}
