import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSetting } from "./settings.js";
import { CHEONAN_CARD } from "./cheonanCardPure.js";

export {
  CHEONAN_CARD,
  CHEONAN_CARD_PRICE_BOUNDARIES,
  fuelTypeToProdCd,
  getKstHour,
  isPriceCacheStale,
  lastPublishBoundary,
  normalizeStationName,
  shouldMarkPricesSynced,
  PRICE_SYNC_SUCCESS_RATIO,
  THROTTLE_MS,
  COORD_MATCH_MAX_M,
  sleep,
} from "./cheonanCardPure.js";
export { brandLabelOf } from "./opinet.js";
export type { KstBoundaryHour } from "./cheonanCardPure.js";

export type CheonanCardSeedKona = {
  seq: number;
  name: string;
  bizType: string;
};

export type CheonanCardSeedStation = {
  opinetId: string;
  name: string;
  brand: string | null;
  address: string;
  roadAddress: string | null;
  lat: number;
  lon: number;
  lpgYn: string;
  kona: CheonanCardSeedKona[];
  match: "name_coord" | "coord" | "name_only" | "manual";
};

export type CheonanCardSeedUnmatched = {
  seq: number;
  name: string;
  address: string;
  tel: string | null;
  bizType: string;
};

export type CheonanCardSeed = {
  generatedAt: string;
  source: { konaId: number; totalMerchants: number; matched: number };
  stations: CheonanCardSeedStation[];
  unmatched: CheonanCardSeedUnmatched[];
};

export const EMPTY_CHEONAN_CARD_SEED: CheonanCardSeed = {
  generatedAt: "",
  source: { konaId: CHEONAN_CARD.konaId, totalMerchants: 0, matched: 0 },
  stations: [],
  unmatched: [],
};

let cachedSeed: CheonanCardSeed | null = null;

function seedFilePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../data/cheonan-card-stations.json");
}

/** 중복 opinetId는 건너뛴다(런타임 throw 금지 — 검증은 seed 빌드 스크립트 책임). */
function sanitizeSeed(raw: CheonanCardSeed): CheonanCardSeed {
  const ids = new Set<string>();
  const stations: CheonanCardSeedStation[] = [];
  for (const s of raw.stations ?? []) {
    if (!s?.opinetId || ids.has(s.opinetId)) continue;
    ids.add(s.opinetId);
    stations.push(s);
  }
  return {
    generatedAt: raw.generatedAt ?? "",
    source: raw.source ?? EMPTY_CHEONAN_CARD_SEED.source,
    stations,
    unmatched: Array.isArray(raw.unmatched) ? raw.unmatched : [],
  };
}

export function loadCheonanCardSeed(): CheonanCardSeed {
  if (cachedSeed) return cachedSeed;
  try {
    const raw = JSON.parse(readFileSync(seedFilePath(), "utf8")) as CheonanCardSeed;
    cachedSeed = sanitizeSeed(raw);
  } catch (err) {
    console.error("[cheonan-card] failed to load seed; using empty seed", err);
    cachedSeed = EMPTY_CHEONAN_CARD_SEED;
  }
  return cachedSeed;
}

/** 테스트용 */
export function __setCheonanCardSeedForTests(seed: CheonanCardSeed | null): void {
  cachedSeed = seed ? sanitizeSeed(seed) : null;
}

export async function isCheonanCardEnabled(): Promise<boolean> {
  const enabled = await getSetting("CHEONAN_CARD_ENABLED");
  if (enabled !== "true") return false;
  const apiKey = await getSetting("OPINET_API_KEY");
  return !!apiKey;
}
