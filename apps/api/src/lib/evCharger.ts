import { haversineKm } from "./geo.js";
import { getSetting } from "./settings.js";

// 환경부 전기차 충전소 정보 API(data.go.kr, B552584/EvCharger)는 오피넷과 달리
// 위경도+반경 검색을 지원하지 않고 zcode(시도 코드)로만 필터링할 수 있다.
// 그래서 프론트에서 카카오 역지오코딩으로 얻은 주소 문자열의 첫 토큰(시도명)을
// 이 표로 zcode로 변환한 뒤 해당 시도 전체를 조회하고, 결과를 haversine 거리로
// 재정렬해 오피넷과 동일한 "가까운 순" 경험을 흉내낸다.
const ZCODE_BY_SIDO: Record<string, string> = {
  "서울특별시": "11",
  "부산광역시": "26",
  "대구광역시": "27",
  "인천광역시": "28",
  "광주광역시": "29",
  "대전광역시": "30",
  "울산광역시": "31",
  "세종특별자치시": "36",
  "경기도": "41",
  "충청북도": "43",
  "충청남도": "44",
  "전라남도": "46",
  "경상북도": "47",
  "경상남도": "48",
  "제주특별자치도": "50",
  "강원특별자치도": "51",
  "강원도": "51", // 2023년 개편 이전 명칭 대응
  "전북특별자치도": "52",
  "전라북도": "52", // 2024년 개편 이전 명칭 대응
};

const STAT_LABEL: Record<string, string> = {
  "0": "알수없음",
  "1": "통신이상",
  "2": "충전대기",
  "3": "충전중",
  "4": "운영중지",
  "5": "점검중",
  "6": "예약중",
  "9": "상태미확인",
};

export type ChargerStatus = "AVAILABLE" | "CHARGING" | "RESERVED" | "OUT_OF_SERVICE" | "UNKNOWN";

const STATUS_BY_STAT: Record<string, ChargerStatus> = {
  "2": "AVAILABLE",
  "3": "CHARGING",
  "6": "RESERVED",
  "4": "OUT_OF_SERVICE",
  "5": "OUT_OF_SERVICE",
};

const CHGER_TYPE_LABEL: Record<string, string> = {
  "01": "DC차데모",
  "02": "AC완속",
  "03": "DC차데모+AC3상",
  "04": "DC콤보",
  "05": "DC차데모+DC콤보",
  "06": "DC차데모+AC3상+DC콤보",
  "07": "AC3상",
  "08": "DC콤보(완속)",
  "09": "NACS",
  "10": "DC콤보+NACS",
  "11": "DC콤보2(버스전용)",
};

export type EvConnector = {
  chgerId: string;
  type: string;
  typeLabel: string;
  status: ChargerStatus;
  statusLabel: string;
  output: number | null;
};

export type EvChargerSummary = {
  id: string; // statId
  name: string;
  operator: string;
  distance: number; // meters (오피넷 station summary와 단위 통일)
  lat: number;
  lon: number;
  address: string | null;
  parkingFree: boolean;
  connectors: EvConnector[];
};

function resolveZcode(address?: string | null): string | undefined {
  if (!address) return undefined;
  const sido = address.trim().split(/\s+/)[0];
  return ZCODE_BY_SIDO[sido];
}

function parseEvJson(text: string): unknown {
  return JSON.parse(text.replace(/[\r\n\t]/g, ""));
}

export async function fetchNearbyChargers(
  lat: number,
  lon: number,
  address?: string | null,
): Promise<EvChargerSummary[]> {
  const apiKey = await getSetting("EV_CHARGER_API_KEY");
  if (!apiKey) return mockChargers(lat, lon);

  try {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      dataType: "JSON",
      numOfRows: "1000",
      pageNo: "1",
    });
    const zcode = resolveZcode(address);
    if (zcode) params.set("zcode", zcode);

    const url = `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EvCharger API responded with status ${res.status}`);

    const data = parseEvJson(await res.text()) as {
      resultCode?: string;
      items?: { item?: Array<Record<string, unknown>> | Record<string, unknown> };
    };
    if (data.resultCode !== "00") throw new Error(`EvCharger API error: ${data.resultCode}`);

    const rawItems = data.items?.item;
    const rows = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const byStation = new Map<string, EvChargerSummary>();
    for (const row of rows) {
      const statId = String(row.statId ?? "");
      const itemLat = Number(row.lat);
      const itemLon = Number(row.lng);
      if (!statId || !Number.isFinite(itemLat) || !Number.isFinite(itemLon)) continue;

      const stat = String(row.stat ?? "9");
      const chgerType = String(row.chgerType ?? "");
      const output = Number(row.output);

      const connector: EvConnector = {
        chgerId: String(row.chgerId ?? ""),
        type: chgerType,
        typeLabel: CHGER_TYPE_LABEL[chgerType] ?? "충전기",
        status: STATUS_BY_STAT[stat] ?? "UNKNOWN",
        statusLabel: STAT_LABEL[stat] ?? "상태미확인",
        output: Number.isFinite(output) ? output : null,
      };

      const existing = byStation.get(statId);
      if (existing) {
        existing.connectors.push(connector);
        continue;
      }

      byStation.set(statId, {
        id: statId,
        name: String(row.statNm ?? "이름없음"),
        operator: String(row.busiNm ?? ""),
        distance: Math.round(haversineKm(lat, lon, itemLat, itemLon) * 1000),
        lat: itemLat,
        lon: itemLon,
        address: row.addr ? String(row.addr) : null,
        parkingFree: row.parkingFree === "Y",
        connectors: [connector],
      });
    }

    return Array.from(byStation.values())
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 30);
  } catch {
    return mockChargers(lat, lon);
  }
}

function mockChargers(lat: number, lon: number): EvChargerSummary[] {
  const offset = (dLat: number, dLon: number) => ({ lat: lat + dLat, lon: lon + dLon });
  const templates: Array<{
    name: string;
    operator: string;
    distance: number;
    d: { lat: number; lon: number };
    connectors: EvConnector[];
    address: string;
  }> = [
    {
      name: "행복 공영주차장 충전소",
      operator: "환경부",
      distance: 320,
      d: offset(0.002, 0.001),
      address: "예시동 123-4 공영주차장",
      connectors: [
        { chgerId: "01", type: "04", typeLabel: CHGER_TYPE_LABEL["04"], status: "AVAILABLE", statusLabel: STAT_LABEL["2"], output: 100 },
      ],
    },
    {
      name: "그린 스퀘어 충전소",
      operator: "한국전력공사",
      distance: 540,
      d: offset(-0.003, 0.0025),
      address: "예시동 45-6",
      connectors: [
        { chgerId: "01", type: "02", typeLabel: CHGER_TYPE_LABEL["02"], status: "CHARGING", statusLabel: STAT_LABEL["3"], output: 7 },
        { chgerId: "02", type: "04", typeLabel: CHGER_TYPE_LABEL["04"], status: "AVAILABLE", statusLabel: STAT_LABEL["2"], output: 100 },
      ],
    },
    {
      name: "빌리지 아파트 충전소",
      operator: "환경친화적자동차충전인프라",
      distance: 810,
      d: offset(0.004, -0.003),
      address: "예시동 78-9 지하주차장",
      connectors: [
        { chgerId: "01", type: "04", typeLabel: CHGER_TYPE_LABEL["04"], status: "OUT_OF_SERVICE", statusLabel: STAT_LABEL["5"], output: 50 },
      ],
    },
    {
      name: "하늘길 휴게소 충전소",
      operator: "한국도로공사",
      distance: 1200,
      d: offset(-0.006, -0.004),
      address: "예시고속도로 하늘길휴게소",
      connectors: [
        { chgerId: "01", type: "04", typeLabel: CHGER_TYPE_LABEL["04"], status: "AVAILABLE", statusLabel: STAT_LABEL["2"], output: 100 },
        { chgerId: "02", type: "04", typeLabel: CHGER_TYPE_LABEL["04"], status: "AVAILABLE", statusLabel: STAT_LABEL["2"], output: 100 },
      ],
    },
  ];

  return templates.map((tpl, i) => ({
    id: `MOCK_EV_${i}`,
    name: tpl.name,
    operator: tpl.operator,
    distance: tpl.distance,
    lat: tpl.d.lat,
    lon: tpl.d.lon,
    address: tpl.address,
    parkingFree: true,
    connectors: tpl.connectors,
  }));
}
