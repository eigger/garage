import type { FastifyBaseLogger } from "fastify";
import { OPINET_PROD_DISPLAY_ORDER } from "@garage/shared";
import { prisma } from "./prisma.js";
import {
  CHEONAN_CARD,
  fuelTypeToProdCd,
  isCheonanCardEnabled,
  isPriceCacheStale,
  loadCheonanCardSeed,
  shouldMarkPricesSynced,
  sleep,
  THROTTLE_MS,
  brandLabelOf,
} from "./cheonanCard.js";
import { fetchStationPrices } from "./opinet.js";
import { haversineKm } from "./geo.js";

const PRICE_SYNC_STALE_GUARD_MS = 10 * 60 * 1000;

let priceInFlight: Promise<void> | null = null;

async function getOrCreateSyncState() {
  return prisma.cheonanCardPriceSyncState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

function startedRecently(startedAt: Date | null | undefined): boolean {
  if (!startedAt) return false;
  return Date.now() - startedAt.getTime() < PRICE_SYNC_STALE_GUARD_MS;
}

async function runPriceSync(log?: FastifyBaseLogger): Promise<void> {
  const startedAt = new Date();
  await prisma.cheonanCardPriceSyncState.upsert({
    where: { id: 1 },
    update: { startedAt },
    create: { id: 1, startedAt },
  });

  try {
    const seed = loadCheonanCardSeed();
    const ids = seed.stations.map((s) => s.opinetId);
    if (ids.length === 0) {
      // 대상 0건이면 pricesSyncedAt을 찍지 않는다 — 다음 조회에서 재시도.
      return;
    }

    let successCount = 0;
    const seedIdSet = new Set(ids);

    for (const opinetId of ids) {
      const prices = await fetchStationPrices(opinetId);
      await sleep(THROTTLE_MS);
      if (!prices) continue;
      successCount += 1;

      const seen = new Set<string>();
      for (const p of prices) {
        seen.add(p.prodCd);
        await prisma.cheonanCardStationPrice.upsert({
          where: { opinetId_prodCd: { opinetId, prodCd: p.prodCd } },
          create: { opinetId, prodCd: p.prodCd, price: p.price, tradeAt: p.tradeAt },
          update: { price: p.price, tradeAt: p.tradeAt },
        });
      }
      await prisma.cheonanCardStationPrice.deleteMany({
        where: { opinetId, prodCd: { notIn: [...seen] } },
      });
    }

    // seed에 없는 opinetId orphan 가격 행 정리
    await prisma.cheonanCardStationPrice.deleteMany({
      where: { opinetId: { notIn: [...seedIdSet] } },
    });

    if (shouldMarkPricesSynced(successCount, ids.length)) {
      await prisma.cheonanCardPriceSyncState.update({
        where: { id: 1 },
        data: { pricesSyncedAt: new Date(), lastError: null },
      });
    } else if (successCount > 0) {
      log?.warn(
        { successCount, total: ids.length },
        "cheonan card price sync: below success threshold; pricesSyncedAt not updated",
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.error({ err }, "cheonan card price sync failed");
    await prisma.cheonanCardPriceSyncState
      .update({
        where: { id: 1 },
        data: { lastError: message },
      })
      .catch(() => {});
  }
}

/**
 * 캐시가 낡았을 때만 백그라운드 갱신을 시작한다.
 * in-flight 검사는 동기 구간에서 먼저 한다(§6-3) — await 뒤에 두면 가드가 뚫린다.
 */
export function ensureFreshPrices(log?: FastifyBaseLogger): void {
  if (priceInFlight) return;

  priceInFlight = (async () => {
    // 게이팅·상태 조회 단계에서 DB가 죽어 있으면 여기서 던진다. 호출부가 await하지
    // 않으므로(의도된 fire-and-forget) 삼키지 않으면 unhandledRejection이 된다.
    try {
      if (!(await isCheonanCardEnabled())) return;
      const state = await getOrCreateSyncState();
      if (!isPriceCacheStale(state.pricesSyncedAt)) return;
      if (startedRecently(state.startedAt)) return;
      await runPriceSync(log);
    } catch (err) {
      log?.error({ err }, "cheonan card price refresh could not start");
    }
  })().finally(() => {
    priceInFlight = null;
  });
}

/** 설정 토글 직후 워밍업 — 응답을 블로킹하지 않는다. */
export function triggerCheonanCardWarmup(log?: FastifyBaseLogger): void {
  ensureFreshPrices(log);
}

export type StationsQuery = {
  fuelType: string;
  lat?: number;
  lon?: number;
  sort?: "price" | "distance";
  maxKm?: number;
};

function matchesLpgFilter(lpgYn: string, isLpgQuery: boolean): boolean {
  if (isLpgQuery) return lpgYn === "Y" || lpgYn === "C";
  return lpgYn === "N" || lpgYn === "C";
}

export async function buildStationsResponse(query: StationsQuery) {
  const primaryProdCd = fuelTypeToProdCd(query.fuelType);
  const seed = loadCheonanCardSeed();
  const state = await getOrCreateSyncState();

  // preparing = 가격 캐시 없음. 주유소 목록(seed)은 항상 반환한다.
  let status: "preparing" | "refreshing" | "fresh";
  if (!state.pricesSyncedAt) {
    status = "preparing";
  } else if (isPriceCacheStale(state.pricesSyncedAt)) {
    status = "refreshing";
  } else {
    status = "fresh";
  }

  const prices = await prisma.cheonanCardStationPrice.findMany();
  const pricesById = new Map<string, typeof prices>();
  for (const p of prices) {
    const list = pricesById.get(p.opinetId) ?? [];
    list.push(p);
    pricesById.set(p.opinetId, list);
  }

  const isLpgQuery = query.fuelType === "LPG";

  const unmatched = seed.unmatched.map((m) => ({
    seq: m.seq,
    name: m.name,
    address: m.address,
    tel: m.tel,
    bizType: m.bizType,
  }));

  let stations = seed.stations
    .filter((s) => matchesLpgFilter(s.lpgYn, isLpgQuery))
    .map((s) => {
      let distanceM: number | null = null;
      if (query.lat != null && query.lon != null) {
        distanceM = Math.round(haversineKm(query.lat, query.lon, s.lat, s.lon) * 1000);
      }

      const rawPrices = pricesById.get(s.opinetId) ?? [];
      const ordered = [...rawPrices].sort((a, b) => {
        const ai = OPINET_PROD_DISPLAY_ORDER.indexOf(a.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
        const bi = OPINET_PROD_DISPLAY_ORDER.indexOf(b.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      const primary = ordered.find((p) => p.prodCd === primaryProdCd);

      return {
        id: s.opinetId,
        name: s.name,
        brand: s.brand,
        brandLabel: s.brand ? brandLabelOf(s.brand) : null,
        address: s.address,
        roadAddress: s.roadAddress,
        lat: s.lat,
        lon: s.lon,
        distanceM,
        prices: ordered.map((p) => ({
          prodCd: p.prodCd,
          price: p.price,
          tradeAt: p.tradeAt.toISOString(),
        })),
        primaryPrice: primary?.price ?? null,
        isLpgStation: s.lpgYn === "Y" || s.lpgYn === "C",
      };
    });

  if (query.maxKm != null && query.lat != null && query.lon != null) {
    const maxM = query.maxKm * 1000;
    stations = stations.filter((s) => s.distanceM == null || s.distanceM <= maxM);
  }

  let sort = query.sort ?? "price";
  if (sort === "distance" && (query.lat == null || query.lon == null)) {
    sort = "price";
  }

  stations.sort((a, b) => {
    if (sort === "distance") {
      const da = a.distanceM ?? Number.POSITIVE_INFINITY;
      const db = b.distanceM ?? Number.POSITIVE_INFINITY;
      return da - db;
    }
    const pa = a.primaryPrice;
    const pb = b.primaryPrice;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });

  return {
    label: CHEONAN_CARD.label,
    status,
    primaryProdCd,
    stations,
    unmatched,
    pricesSyncedAt: state.pricesSyncedAt?.toISOString() ?? null,
    seedGeneratedAt: seed.generatedAt,
  };
}

export async function getConfigResponse() {
  const enabled = await isCheonanCardEnabled();
  if (!enabled) {
    return {
      enabled: false,
      label: CHEONAN_CARD.label,
      stationCount: 0,
      seedGeneratedAt: "",
    };
  }
  const seed = loadCheonanCardSeed();
  return {
    enabled: true,
    label: CHEONAN_CARD.label,
    stationCount: seed.stations.length,
    seedGeneratedAt: seed.generatedAt,
  };
}

/** 테스트용 — in-flight 상태 초기화 */
export function __resetCheonanCardPricesForTests(): void {
  priceInFlight = null;
}
