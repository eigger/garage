import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchStationPrices = vi.fn();
const priceUpsert = vi.fn();
const priceDeleteMany = vi.fn();
const priceFindMany = vi.fn();
const syncUpsert = vi.fn();
const syncUpdate = vi.fn();

vi.mock("./opinet.js", () => ({
  fetchStationPrices: (...args: unknown[]) => fetchStationPrices(...args),
  brandLabelOf: (code: string) => code,
}));

vi.mock("./settings.js", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  prisma: {
    cheonanCardPriceSyncState: {
      upsert: (...args: unknown[]) => syncUpsert(...args),
      update: (...args: unknown[]) => syncUpdate(...args),
    },
    cheonanCardStationPrice: {
      upsert: (...args: unknown[]) => priceUpsert(...args),
      deleteMany: (...args: unknown[]) => priceDeleteMany(...args),
      findMany: (...args: unknown[]) => priceFindMany(...args),
    },
  },
}));

import { getSetting } from "./settings.js";
import { __setCheonanCardSeedForTests } from "./cheonanCard.js";
import {
  ensureFreshPrices,
  getConfigResponse,
  buildStationsResponse,
  __resetCheonanCardPricesForTests,
} from "./cheonanCardPrices.js";

function enableFeature(on: boolean) {
  vi.mocked(getSetting).mockImplementation(async (key: string) => {
    if (key === "CHEONAN_CARD_ENABLED") return on ? "true" : "false";
    if (key === "OPINET_API_KEY") return on ? "test-key" : null;
    return null;
  });
}

const twoStationSeed = {
  generatedAt: "2026-08-06T00:00:00.000Z",
  source: { konaId: 34, totalMerchants: 2, matched: 2 },
  stations: [
    {
      opinetId: "A1",
      name: "주유소A",
      brand: "HDO",
      address: "addr-a",
      roadAddress: null as string | null,
      lat: 36.8,
      lon: 127.1,
      lpgYn: "N",
      kona: [{ seq: 1, name: "A", bizType: "5608" }],
      match: "name_coord" as const,
    },
    {
      opinetId: "A2",
      name: "충전소B",
      brand: null as string | null,
      address: "addr-b",
      roadAddress: null as string | null,
      lat: 36.81,
      lon: 127.11,
      lpgYn: "C",
      kona: [{ seq: 2, name: "B", bizType: "5609" }],
      match: "coord" as const,
    },
  ],
  unmatched: [{ seq: 9, name: "미매칭", address: "somewhere", tel: null, bizType: "5608" }],
};

describe("ensureFreshPrices gating & concurrency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetCheonanCardPricesForTests();
    __setCheonanCardSeedForTests(twoStationSeed);
    fetchStationPrices.mockReset();
    priceUpsert.mockReset().mockResolvedValue({});
    priceDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    priceFindMany.mockReset().mockResolvedValue([]);
    syncUpsert.mockReset().mockResolvedValue({
      id: 1,
      pricesSyncedAt: null,
      startedAt: null,
      lastError: null,
    });
    syncUpdate.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetCheonanCardPricesForTests();
    __setCheonanCardSeedForTests(null);
  });

  it("does not call fetch when feature is disabled", async () => {
    enableFeature(false);
    ensureFreshPrices();
    await vi.runAllTimersAsync();
    expect(fetchStationPrices).not.toHaveBeenCalled();
  });

  it("runs only one sync when ensureFreshPrices is called concurrently", async () => {
    enableFeature(true);
    fetchStationPrices.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve([{ prodCd: "B027", price: 1600, tradeAt: new Date() }]),
            50,
          );
        }),
    );

    ensureFreshPrices();
    ensureFreshPrices();
    ensureFreshPrices();

    await vi.runAllTimersAsync();

    // 2 stations × 1 sync = 2 calls (not 6)
    expect(fetchStationPrices).toHaveBeenCalledTimes(2);
  });

  it("does not update pricesSyncedAt when target stations are 0", async () => {
    enableFeature(true);
    __setCheonanCardSeedForTests({
      ...twoStationSeed,
      stations: [],
      source: { konaId: 34, totalMerchants: 0, matched: 0 },
    });
    ensureFreshPrices();
    await vi.runAllTimersAsync();
    expect(fetchStationPrices).not.toHaveBeenCalled();
    expect(syncUpdate).not.toHaveBeenCalled();
  });
});

describe("ensureFreshPrices success threshold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetCheonanCardPricesForTests();
    fetchStationPrices.mockReset();
    priceUpsert.mockReset().mockResolvedValue({});
    priceDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    syncUpsert.mockReset().mockResolvedValue({
      id: 1,
      pricesSyncedAt: null,
      startedAt: null,
      lastError: null,
    });
    syncUpdate.mockReset().mockResolvedValue({});
    enableFeature(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetCheonanCardPricesForTests();
    __setCheonanCardSeedForTests(null);
  });

  it("skips pricesSyncedAt when fewer than half succeed", async () => {
    __setCheonanCardSeedForTests({
      generatedAt: "t",
      source: { konaId: 34, totalMerchants: 3, matched: 3 },
      stations: [
        { ...twoStationSeed.stations[0], opinetId: "X1" },
        { ...twoStationSeed.stations[0], opinetId: "X2", name: "b" },
        { ...twoStationSeed.stations[0], opinetId: "X3", name: "c" },
      ],
      unmatched: [],
    });
    fetchStationPrices
      .mockResolvedValueOnce([{ prodCd: "B027", price: 1, tradeAt: new Date() }])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    ensureFreshPrices();
    await vi.runAllTimersAsync();

    expect(fetchStationPrices).toHaveBeenCalledTimes(3);
    const syncedCalls = syncUpdate.mock.calls.filter(
      (c) => c[0]?.data && "pricesSyncedAt" in c[0].data,
    );
    expect(syncedCalls).toHaveLength(0);
  });
});

describe("getConfigResponse", () => {
  afterEach(() => {
    __setCheonanCardSeedForTests(null);
  });

  it("does not require seed when disabled", async () => {
    enableFeature(false);
    __setCheonanCardSeedForTests(null);
    const cfg = await getConfigResponse();
    expect(cfg).toEqual({
      enabled: false,
      label: "천안사랑카드",
      stationCount: 0,
      seedGeneratedAt: "",
    });
  });
});

describe("buildStationsResponse", () => {
  beforeEach(() => {
    __setCheonanCardSeedForTests(twoStationSeed);
    priceFindMany.mockResolvedValue([
      { opinetId: "A1", prodCd: "B027", price: 1598, tradeAt: new Date("2026-08-06T00:00:00Z") },
      { opinetId: "A1", prodCd: "D047", price: 1489, tradeAt: new Date("2026-08-06T00:00:00Z") },
      { opinetId: "A2", prodCd: "K015", price: 1012, tradeAt: new Date("2026-08-06T00:00:00Z") },
    ]);
    syncUpsert.mockResolvedValue({
      id: 1,
      pricesSyncedAt: new Date("2026-08-06T01:00:00Z"),
      startedAt: null,
      lastError: null,
    });
  });

  afterEach(() => {
    __setCheonanCardSeedForTests(null);
  });

  it("maps HYBRID to B027, filters LPG, and marks combo stations as LPG", async () => {
    const gas = await buildStationsResponse({ fuelType: "HYBRID" });
    expect(gas.primaryProdCd).toBe("B027");
    expect(gas.stations.map((s) => s.id).sort()).toEqual(["A1", "A2"]); // C included
    expect(gas.stations.find((s) => s.id === "A2")?.isLpgStation).toBe(true);

    const lpg = await buildStationsResponse({ fuelType: "LPG" });
    expect(lpg.stations.map((s) => s.id)).toEqual(["A2"]);

    const electric = await buildStationsResponse({ fuelType: "ELECTRIC" });
    // route short-circuits ELECTRIC; build still filters by lpgYn N/C → both for non-LPG
    expect(electric.primaryProdCd).toBe("B027");
  });

  it("puts null primaryPrice rows last and ignores maxKm without coords", async () => {
    const res = await buildStationsResponse({ fuelType: "GASOLINE", sort: "price", maxKm: 1 });
    expect(res.stations).toHaveLength(2);
    // A1 has B027, A2 only K015 → A2 primary null → last
    expect(res.stations.map((s) => s.id)).toEqual(["A1", "A2"]);
    expect(res.stations[1].primaryPrice).toBeNull();
  });

  it("falls back sort=distance to price without coords", async () => {
    const res = await buildStationsResponse({ fuelType: "GASOLINE", sort: "distance" });
    expect(res.stations[0].id).toBe("A1");
  });

  it("reports preparing when pricesSyncedAt is null but still returns stations", async () => {
    syncUpsert.mockResolvedValue({
      id: 1,
      pricesSyncedAt: null,
      startedAt: null,
      lastError: null,
    });
    priceFindMany.mockResolvedValue([]);
    const res = await buildStationsResponse({ fuelType: "GASOLINE" });
    expect(res.status).toBe("preparing");
    expect(res.stations.length).toBeGreaterThan(0);
    expect(res.unmatched).toHaveLength(1);
  });
});
