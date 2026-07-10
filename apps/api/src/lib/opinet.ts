import { katecToWgs84, wgs84ToKatec } from "./geo.js";
import { getSetting } from "./settings.js";

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

const FUEL_CODE_MAP: Record<string, string> = {
  GASOLINE: "B027",
  DIESEL: "D047",
  LPG: "K015",
  HYBRID: "B027",
};

export type OpinetStationSummary = {
  id: string;
  name: string;
  brand: string;
  brandLabel: string;
  distance: number;
  price: number;
};

export type OpinetStationDetail = OpinetStationSummary & {
  address: string | null;
  roadAddress: string | null;
  lat: number | null;
  lon: number | null;
  tel: string | null;
};

function parseOpinetJson(text: string): unknown {
  return JSON.parse(text.replace(/[\r\n\t]/g, ""));
}

function brandLabel(code: string): string {
  return BRANDS[code.trim().toUpperCase()] ?? "자가상표";
}

export async function fetchNearbyStations(
  lat: number,
  lon: number,
  fuelType: string,
): Promise<OpinetStationSummary[]> {
  if (fuelType === "ELECTRIC") return [];

  const apiKey = await getSetting("OPINET_API_KEY");
  if (!apiKey) return mockStations(fuelType);

  try {
    const { x, y } = wgs84ToKatec(lon, lat);
    const prodcd = FUEL_CODE_MAP[fuelType] ?? "B027";
    // 오피넷 API의 sort 파라미터는 1=가격순, 2=거리순이다 (실제 API 응답으로 확인됨,
    // 공식 문서에 적힌 것과 반대라 헷갈리기 쉬움).
    const url = `https://www.opinet.co.kr/api/aroundAll.do?code=${apiKey}&out=json&x=${x}&y=${y}&radius=5000&prodcd=${prodcd}&sort=2`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opinet API responded with status ${res.status}`);

    const data = parseOpinetJson(await res.text()) as {
      RESULT?: { OIL?: Array<Record<string, unknown>> };
    };
    if (!data.RESULT || !Array.isArray(data.RESULT.OIL)) return [];

    return data.RESULT.OIL.map((s) => {
      const brandCode = String(s.POLL_DIV_CO || s.POLL_DIV_CD || "ETC").trim().toUpperCase();
      return {
        id: String(s.UNI_ID),
        name: String(s.OS_NM),
        brand: brandCode,
        brandLabel: brandLabel(brandCode),
        distance: Number(s.DISTANCE),
        price: Number(s.PRICE),
      };
    });
  } catch {
    return mockStations(fuelType);
  }
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
    const katecX = Number(row.GIS_X_COOR);
    const katecY = Number(row.GIS_Y_COOR);
    const coords =
      Number.isFinite(katecX) && Number.isFinite(katecY) ? katecToWgs84(katecX, katecY) : null;

    const oilPrice = Array.isArray(row.OIL_PRICE) ? row.OIL_PRICE[0] : row.OIL_PRICE;
    const price = oilPrice ? Number((oilPrice as Record<string, unknown>).PRICE) : NaN;

    return {
      id: String(row.UNI_ID),
      name: String(row.OS_NM),
      brand: brandCode,
      brandLabel: brandLabel(brandCode),
      distance: 0,
      price: Number.isFinite(price) ? price : 0,
      address: row.VAN_ADR ? String(row.VAN_ADR) : null,
      roadAddress: row.NEW_ADR ? String(row.NEW_ADR) : null,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      tel: row.TEL ? String(row.TEL) : null,
    };
  } catch {
    return null;
  }
}

function mockStations(fuelType: string): OpinetStationSummary[] {
  const basePrice = fuelType === "DIESEL" ? 1430 : fuelType === "LPG" ? 1010 : 1650;
  return [
    { id: "MOCK_SKE", name: "하늘길 SK에너지 주유소", brand: "SKE", brandLabel: "SK에너지", distance: 240, price: basePrice - 5 },
    { id: "MOCK_GSC", name: "동행 GS칼텍스 주유소", brand: "GSC", brandLabel: "GS칼텍스", distance: 450, price: basePrice + 12 },
    { id: "MOCK_SOL", name: "믿음 가득 S-OIL 주유소", brand: "SOL", brandLabel: "S-OIL", distance: 820, price: basePrice - 10 },
    { id: "MOCK_HDO", name: "오션 현대오일뱅크 주유소", brand: "HDO", brandLabel: "현대오일뱅크", distance: 1100, price: basePrice + 5 },
  ];
}
