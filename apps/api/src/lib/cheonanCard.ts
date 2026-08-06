import { getSetting } from "./settings.js";
import { haversineKm } from "./geo.js";
import {
  fetchAroundStations,
  fetchStationDetail,
  searchStationsByName,
} from "./opinet.js";
import {
  CHEONAN_CARD,
  COORD_MATCH_MAX_M,
  NAME_MATCH_MAX_M,
  normalizeStationName,
} from "./cheonanCardPure.js";

export {
  CHEONAN_CARD,
  CHEONAN_CARD_PRICE_BOUNDARIES,
  fuelTypeToProdCd,
  getKstHour,
  isPriceCacheStale,
  lastPublishBoundary,
  merchantStableKey,
  merchantTtlExpired,
  normalizeStationName,
  THROTTLE_MS,
  sleep,
  NAME_MATCH_MAX_M,
  COORD_MATCH_MAX_M,
} from "./cheonanCardPure.js";
export { brandLabelOf } from "./opinet.js";
export type { KstBoundaryHour } from "./cheonanCardPure.js";

export type KonaMerchant = {
  seq: number;
  simpleNm: string;
  addr: string;
  telNo: string | null;
  bizType: string;
  latitude: number | null;
  longitude: number | null;
};

export async function isCheonanCardEnabled(): Promise<boolean> {
  const enabled = await getSetting("CHEONAN_CARD_ENABLED");
  if (enabled !== "true") return false;
  const apiKey = await getSetting("OPINET_API_KEY");
  return !!apiKey;
}

export async function fetchKonaMerchants(): Promise<KonaMerchant[]> {
  const res = await fetch("https://search.konacard.co.kr/api/v1/payable-merchants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: CHEONAN_CARD.konaId,
      bizType: CHEONAN_CARD.bizType,
      merchantType: CHEONAN_CARD.merchantType,
      pageNum: 1,
      pageSize: 200,
      affiliateName: CHEONAN_CARD.affiliateName,
      searchKey: "",
    }),
  });
  if (!res.ok) throw new Error(`Kona Card API responded with status ${res.status}`);

  const data = (await res.json()) as {
    data?: {
      merchants?: Array<Record<string, unknown>>;
    };
  };
  const merchants = data.data?.merchants;
  if (!Array.isArray(merchants)) return [];

  return merchants.map((m) => {
    const lat = m.latitude != null ? Number(m.latitude) : null;
    const lon = m.longitude != null ? Number(m.longitude) : null;
    return {
      seq: Number(m.seq),
      simpleNm: String(m.simpleNm ?? ""),
      addr: String(m.addr ?? ""),
      telNo: m.telNo != null && String(m.telNo).trim() !== "" ? String(m.telNo) : null,
      bizType: String(m.bizType ?? ""),
      latitude: lat != null && Number.isFinite(lat) ? lat : null,
      longitude: lon != null && Number.isFinite(lon) ? lon : null,
    };
  });
}

function isCheonanCandidate(sigunCd: string | null, address: string | null, roadAddress: string | null): boolean {
  if (CHEONAN_CARD.opinetSigunCds.length > 0) {
    return !!sigunCd && (CHEONAN_CARD.opinetSigunCds as readonly string[]).includes(sigunCd);
  }
  // SIGUNCD 화이트리스트 미확정 시 주소에 "천안"이 있으면 1차 통과.
  // 단 resolveOpinetId에서 좌표 대조를 필수로 강제한다(A2).
  const addr = `${address ?? ""} ${roadAddress ?? ""}`;
  return addr.includes("천안");
}

export type OpinetMatch = {
  opinetId: string;
  matchMethod: "name" | "coord";
  opinetName: string;
  brand: string | null;
  roadAddress: string | null;
  opinetLat: number | null;
  opinetLon: number | null;
  lpgYn: string | null;
};

export async function resolveOpinetId(merchant: {
  name: string;
  lat: number | null;
  lon: number | null;
  bizType: string;
}): Promise<OpinetMatch | null> {
  // opinetSigunCds가 비어 있으면 동명 오매칭을 막기 위해 좌표 대조를 필수로 한다.
  const sigunCdsEmpty = CHEONAN_CARD.opinetSigunCds.length === 0;

  const normalized = normalizeStationName(merchant.name);
  if (normalized.length >= 2) {
    const hits = await searchStationsByName(normalized, CHEONAN_CARD.opinetSidoArea);
    const candidates = hits.filter((h) => isCheonanCandidate(h.sigunCd, h.address, h.roadAddress));

    let narrowed = candidates;
    if (sigunCdsEmpty) {
      // 화이트리스트 없음 → 좌표 없으면 name 매칭 확정 금지
      if (merchant.lat == null || merchant.lon == null) {
        narrowed = [];
      } else {
        narrowed = candidates.filter((h) => {
          if (h.lat == null || h.lon == null) return false;
          return haversineKm(merchant.lat!, merchant.lon!, h.lat, h.lon) * 1000 <= NAME_MATCH_MAX_M;
        });
      }
    } else if (merchant.lat != null && merchant.lon != null) {
      narrowed = candidates.filter((h) => {
        if (h.lat == null || h.lon == null) return false;
        return haversineKm(merchant.lat!, merchant.lon!, h.lat, h.lon) * 1000 <= NAME_MATCH_MAX_M;
      });
    }

    if (narrowed.length === 1) {
      const hit = narrowed[0];
      const detail = await fetchStationDetail(hit.id);
      return {
        opinetId: hit.id,
        matchMethod: "name",
        opinetName: hit.name,
        brand: detail?.brand ?? null,
        roadAddress: hit.roadAddress ?? detail?.roadAddress ?? null,
        opinetLat: hit.lat ?? detail?.lat ?? null,
        opinetLon: hit.lon ?? detail?.lon ?? null,
        lpgYn: hit.lpgYn,
      };
    }
  }

  if (merchant.lat == null || merchant.lon == null) return null;

  // A1: LPG 충전소(5609)는 aroundAll을 K015로 조회해야 결과에 잡힌다.
  const prodcd = merchant.bizType === "5609" ? "K015" : "B027";
  const nearby = await fetchAroundStations(merchant.lat, merchant.lon, 1000, prodcd);
  const within = nearby
    .filter((s) => s.distance <= COORD_MATCH_MAX_M)
    .sort((a, b) => a.distance - b.distance);
  if (within.length === 0) return null;

  const best = within[0];
  const detail = await fetchStationDetail(best.id);
  return {
    opinetId: best.id,
    matchMethod: "coord",
    opinetName: best.name,
    brand: detail?.brand ?? null,
    roadAddress: detail?.roadAddress ?? null,
    opinetLat: best.lat ?? detail?.lat ?? null,
    opinetLon: best.lon ?? detail?.lon ?? null,
    lpgYn: null,
  };
}
