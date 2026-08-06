import type { FastifyBaseLogger } from "fastify";
import { OPINET_PROD_DISPLAY_ORDER } from "@garage/shared";
import { prisma } from "./prisma.js";
import {
  CHEONAN_CARD,
  fetchKonaMerchants,
  fuelTypeToProdCd,
  isCheonanCardEnabled,
  isPriceCacheStale,
  merchantStableKey,
  merchantTtlExpired,
  resolveOpinetId,
  sleep,
  THROTTLE_MS,
  brandLabelOf,
} from "./cheonanCard.js";
import { fetchStationPrices } from "./opinet.js";
import { haversineKm } from "./geo.js";

const SYNC_STALE_GUARD_MS = 10 * 60 * 1000;

let merchantInFlight: Promise<void> | null = null;
let priceInFlight: Promise<void> | null = null;

async function getOrCreateSyncState() {
  return prisma.cheonanCardSyncState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

function startedRecently(startedAt: Date | null | undefined): boolean {
  if (!startedAt) return false;
  return Date.now() - startedAt.getTime() < SYNC_STALE_GUARD_MS;
}

async function runMerchantSync(log?: FastifyBaseLogger): Promise<void> {
  const now = new Date();
  await prisma.cheonanCardSyncState.upsert({
    where: { id: 1 },
    update: { merchantSyncStartedAt: now },
    create: { id: 1, merchantSyncStartedAt: now },
  });

  try {
    const merchants = await fetchKonaMerchants();
    const existingRows = await prisma.cheonanCardMerchant.findMany();
    const bySeq = new Map(existingRows.map((r) => [r.konaSeq, r]));
    // seq 재발급 시 opinetId를 이어받기 위한 안정 키 인덱스 (D2)
    const byStableKey = new Map(
      existingRows.map((r) => [merchantStableKey(r.name, r.address), r]),
    );

    const seenSeqs = new Set<number>();

    for (const m of merchants) {
      seenSeqs.add(m.seq);
      const existing = bySeq.get(m.seq);
      const priorByKey = byStableKey.get(merchantStableKey(m.simpleNm, m.addr));

      let match = existing?.opinetId
        ? {
            opinetId: existing.opinetId,
            matchMethod: existing.matchMethod,
            opinetName: existing.opinetName,
            brand: existing.brand,
            roadAddress: existing.roadAddress,
            opinetLat: existing.opinetLat,
            opinetLon: existing.opinetLon,
            lpgYn: existing.lpgYn,
          }
        : priorByKey?.opinetId && priorByKey.konaSeq !== m.seq
          ? {
              // seq가 바뀌었지만 상호+주소가 같으면 기존 매핑 재사용
              opinetId: priorByKey.opinetId,
              matchMethod: priorByKey.matchMethod ?? "name",
              opinetName: priorByKey.opinetName,
              brand: priorByKey.brand,
              roadAddress: priorByKey.roadAddress,
              opinetLat: priorByKey.opinetLat,
              opinetLon: priorByKey.opinetLon,
              lpgYn: priorByKey.lpgYn,
            }
          : null;

      if (!match?.opinetId) {
        const resolved = await resolveOpinetId({
          name: m.simpleNm,
          lat: m.latitude,
          lon: m.longitude,
          bizType: m.bizType,
        });
        if (resolved) {
          match = resolved;
          if (
            (m.bizType === "5608" && resolved.lpgYn === "Y") ||
            (m.bizType === "5609" && resolved.lpgYn === "N")
          ) {
            log?.warn(
              { konaSeq: m.seq, name: m.simpleNm, bizType: m.bizType, lpgYn: resolved.lpgYn },
              "cheonan card LPG_YN mismatch with kona bizType",
            );
          }
        } else {
          log?.warn({ konaSeq: m.seq, name: m.simpleNm }, "cheonan card opinet match failed");
        }
        await sleep(THROTTLE_MS);
      }

      await prisma.cheonanCardMerchant.upsert({
        where: { konaSeq: m.seq },
        create: {
          konaSeq: m.seq,
          name: m.simpleNm,
          address: m.addr,
          tel: m.telNo,
          bizType: m.bizType,
          lat: m.latitude,
          lon: m.longitude,
          opinetId: match?.opinetId ?? null,
          matchMethod: match?.matchMethod ?? null,
          opinetName: match?.opinetName ?? null,
          brand: match?.brand ?? null,
          roadAddress: match?.roadAddress ?? null,
          opinetLat: match?.opinetLat ?? null,
          opinetLon: match?.opinetLon ?? null,
          lpgYn: match?.lpgYn ?? null,
          syncedAt: now,
        },
        update: {
          name: m.simpleNm,
          address: m.addr,
          tel: m.telNo,
          bizType: m.bizType,
          lat: m.latitude,
          lon: m.longitude,
          opinetId: match?.opinetId ?? null,
          matchMethod: match?.matchMethod ?? null,
          opinetName: match?.opinetName ?? null,
          brand: match?.brand ?? null,
          roadAddress: match?.roadAddress ?? null,
          opinetLat: match?.opinetLat ?? null,
          opinetLon: match?.opinetLon ?? null,
          lpgYn: match?.lpgYn ?? null,
          syncedAt: now,
        },
      });
    }

    // D2: 부분 응답·seq 재발급으로 오인 삭제되지 않게 sanity check
    const cachedCount = existingRows.length;
    const incomingCount = merchants.length;
    const skipDeletes =
      cachedCount > 0 && incomingCount < cachedCount * 0.5;

    if (skipDeletes) {
      log?.warn(
        { cachedCount, incomingCount },
        "cheonan card merchant sync: skip deletes (incoming < 50% of cache)",
      );
    } else {
      const removed = await prisma.cheonanCardMerchant.findMany({
        where: { konaSeq: { notIn: [...seenSeqs] } },
        select: { opinetId: true },
      });
      const orphanOpinetIds = [
        ...new Set(removed.map((r) => r.opinetId).filter((id): id is string => !!id)),
      ];
      await prisma.cheonanCardMerchant.deleteMany({
        where: { konaSeq: { notIn: [...seenSeqs] } },
      });
      if (orphanOpinetIds.length > 0) {
        const stillUsed = await prisma.cheonanCardMerchant.findMany({
          where: { opinetId: { in: orphanOpinetIds } },
          select: { opinetId: true },
        });
        const stillUsedSet = new Set(stillUsed.map((r) => r.opinetId));
        const toDelete = orphanOpinetIds.filter((id) => !stillUsedSet.has(id));
        if (toDelete.length > 0) {
          await prisma.cheonanCardStationPrice.deleteMany({
            where: { opinetId: { in: toDelete } },
          });
        }
      }
    }

    await prisma.cheonanCardSyncState.upsert({
      where: { id: 1 },
      update: { merchantSyncedAt: now, lastError: null },
      create: { id: 1, merchantSyncedAt: now },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.error({ err }, "cheonan card merchant sync failed");
    await prisma.cheonanCardSyncState.upsert({
      where: { id: 1 },
      update: { lastError: message },
      create: { id: 1, lastError: message },
    });
  }
}

async function runPriceSync(log?: FastifyBaseLogger): Promise<void> {
  const startedAt = new Date();
  await prisma.cheonanCardSyncState.upsert({
    where: { id: 1 },
    update: { priceSyncStartedAt: startedAt },
    create: { id: 1, priceSyncStartedAt: startedAt },
  });

  try {
    const rows = await prisma.cheonanCardMerchant.findMany({
      where: { opinetId: { not: null } },
      select: { opinetId: true },
    });
    const ids = [...new Set(rows.map((r) => r.opinetId!).filter(Boolean))];
    if (ids.length === 0) {
      // 가맹점 매핑이 아직 없으면 성공으로 치지 않는다 — 다음 조회에서 재시도.
      return;
    }

    let anySuccess = false;
    for (const opinetId of ids) {
      const prices = await fetchStationPrices(opinetId);
      await sleep(THROTTLE_MS);
      if (!prices) continue;
      anySuccess = true;

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

    if (anySuccess) {
      await prisma.cheonanCardSyncState.update({
        where: { id: 1 },
        data: { pricesSyncedAt: new Date(), lastError: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.error({ err }, "cheonan card price sync failed");
    await prisma.cheonanCardSyncState.update({
      where: { id: 1 },
      data: { lastError: message },
    }).catch(() => {});
  }
}

/** 필요 시 백그라운드로 가맹점 동기화를 시작하고 즉시 반환한다. */
export function ensureFreshMerchants(log?: FastifyBaseLogger): void {
  void (async () => {
    if (!(await isCheonanCardEnabled())) return;
    const state = await getOrCreateSyncState();
    if (!merchantTtlExpired(state.merchantSyncedAt)) return;
    if (merchantInFlight) return;
    // A4: 프로세스 재시작/다중 진입 시 DB 가드로 이중 실행 방지
    if (startedRecently(state.merchantSyncStartedAt)) return;
    merchantInFlight = runMerchantSync(log).finally(() => {
      merchantInFlight = null;
    });
  })();
}

/** 가맹점 동기화 완료 후(필요 시) 가격 동기화를 백그라운드로 시작한다. */
export function ensureFreshPrices(log?: FastifyBaseLogger): void {
  void (async () => {
    if (!(await isCheonanCardEnabled())) return;
    const state = await getOrCreateSyncState();
    if (!isPriceCacheStale(state.pricesSyncedAt)) return;

    if (priceInFlight) return;
    if (startedRecently(state.priceSyncStartedAt) && !merchantInFlight) return;

    priceInFlight = (async () => {
      if (merchantInFlight) await merchantInFlight;
      else if (merchantTtlExpired((await getOrCreateSyncState()).merchantSyncedAt)) {
        const latest = await getOrCreateSyncState();
        if (!merchantInFlight && !startedRecently(latest.merchantSyncStartedAt)) {
          merchantInFlight = runMerchantSync(log).finally(() => {
            merchantInFlight = null;
          });
        }
        if (merchantInFlight) await merchantInFlight;
      }
      await runPriceSync(log);
    })().finally(() => {
      priceInFlight = null;
    });
  })();
}

/** 설정 토글 직후 워밍업용 — 응답을 블로킹하지 않는다. */
export function triggerCheonanCardWarmup(log?: FastifyBaseLogger): void {
  void (async () => {
    if (!(await isCheonanCardEnabled())) return;
    ensureFreshMerchants(log);
    ensureFreshPrices(log);
  })();
}

export type StationsQuery = {
  fuelType: string;
  lat?: number;
  lon?: number;
  sort?: "price" | "distance";
  maxKm?: number;
};

export async function buildStationsResponse(query: StationsQuery) {
  const primaryProdCd = fuelTypeToProdCd(query.fuelType);
  const state = await getOrCreateSyncState();
  const merchantCount = await prisma.cheonanCardMerchant.count();

  // D5: pricesSyncedAt이 있어야(가격 동기화 성공 이력) fresh/refreshing.
  // 가맹점만 있고 가격 sync가 전멸·미완이면 preparing — 빈 가격을 "최신"으로 보이게 하지 않는다.
  let status: "preparing" | "refreshing" | "fresh";
  if (merchantCount === 0 || !state.pricesSyncedAt) {
    status = "preparing";
  } else if (isPriceCacheStale(state.pricesSyncedAt)) {
    status = "refreshing";
  } else {
    status = "fresh";
  }

  const allMerchants = await prisma.cheonanCardMerchant.findMany();
  const prices = await prisma.cheonanCardStationPrice.findMany();
  const pricesById = new Map<string, typeof prices>();
  for (const p of prices) {
    const list = pricesById.get(p.opinetId) ?? [];
    list.push(p);
    pricesById.set(p.opinetId, list);
  }

  const isLpgQuery = query.fuelType === "LPG";

  function matchesFuelFilter(m: (typeof allMerchants)[number]): boolean {
    if (isLpgQuery) {
      return m.bizType === "5609" || m.lpgYn === "C";
    }
    return m.bizType === "5608" || m.lpgYn === "C";
  }

  const unmatched = allMerchants
    .filter((m) => !m.opinetId && matchesFuelFilter(m))
    .map((m) => {
      const lat = m.opinetLat ?? m.lat;
      const lon = m.opinetLon ?? m.lon;
      let distanceM: number | null = null;
      if (query.lat != null && query.lon != null && lat != null && lon != null) {
        distanceM = Math.round(haversineKm(query.lat, query.lon, lat, lon) * 1000);
      }
      return {
        konaSeq: m.konaSeq,
        name: m.name,
        address: m.address,
        tel: m.tel,
        lat,
        lon,
        distanceM,
      };
    });

  let stations = allMerchants
    .filter((m) => m.opinetId && matchesFuelFilter(m))
    .map((m) => {
      const lat = m.opinetLat ?? m.lat;
      const lon = m.opinetLon ?? m.lon;
      let distanceM: number | null = null;
      if (query.lat != null && query.lon != null && lat != null && lon != null) {
        distanceM = Math.round(haversineKm(query.lat, query.lon, lat, lon) * 1000);
      }

      const rawPrices = pricesById.get(m.opinetId!) ?? [];
      const ordered = [...rawPrices].sort((a, b) => {
        const ai = OPINET_PROD_DISPLAY_ORDER.indexOf(a.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
        const bi = OPINET_PROD_DISPLAY_ORDER.indexOf(b.prodCd as (typeof OPINET_PROD_DISPLAY_ORDER)[number]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      const primary = ordered.find((p) => p.prodCd === primaryProdCd);

      return {
        id: m.opinetId!,
        konaSeq: m.konaSeq,
        name: m.opinetName ?? m.name,
        brand: m.brand,
        brandLabel: m.brand ? brandLabelOf(m.brand) : null,
        address: m.roadAddress ?? m.address,
        tel: m.tel,
        lat,
        lon,
        distanceM,
        prices: ordered.map((p) => ({
          prodCd: p.prodCd,
          price: p.price,
          tradeAt: p.tradeAt.toISOString(),
        })),
        primaryPrice: primary?.price ?? null,
        isLpgStation: m.bizType === "5609",
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
    merchantSyncedAt: state.merchantSyncedAt?.toISOString() ?? null,
    pricesSyncedAt: state.pricesSyncedAt?.toISOString() ?? null,
  };
}

export async function getConfigResponse() {
  const enabled = await isCheonanCardEnabled();
  const state = await getOrCreateSyncState();
  const merchantCount = enabled ? await prisma.cheonanCardMerchant.count() : 0;
  return {
    enabled,
    label: CHEONAN_CARD.label,
    merchantCount,
    merchantSyncedAt: state.merchantSyncedAt?.toISOString() ?? null,
  };
}

/** 테스트용 — in-flight 상태 초기화 */
export function __resetCheonanCardSyncForTests(): void {
  merchantInFlight = null;
  priceInFlight = null;
}
