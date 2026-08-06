import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import {
  normalizeStationName,
  lastPublishBoundary,
  isPriceCacheStale,
  fuelTypeToProdCd,
  shouldMarkPricesSynced,
  CHEONAN_CARD_PRICE_BOUNDARIES,
} from "./cheonanCardPure.js";

vi.mock("./settings.js", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "./settings.js";
import {
  __setCheonanCardSeedForTests,
  loadCheonanCardSeed,
  isCheonanCardEnabled,
  EMPTY_CHEONAN_CARD_SEED,
} from "./cheonanCard.js";

describe("normalizeStationName", () => {
  it("strips corporate suffixes and whitespace without lowercasing", () => {
    expect(normalizeStationName("(주)광명주유소")).toBe("광명주유소");
    expect(normalizeStationName("주식회사 화이너지")).toBe("화이너지");
    expect(normalizeStationName("태조산 셀프 주유소")).toBe("태조산주유소");
    // 오피넷은 대소문자 구분 — GS/IC 케이스를 유지해야 한다
    expect(normalizeStationName("GS 4공단주유소")).toBe("GS4공단주유소");
    expect(normalizeStationName("목천IC충전소")).toBe("목천IC충전소");
    expect(normalizeStationName("SK Self Station")).toBe("SKStation");
  });

  it("removes parenthetical content", () => {
    expect(normalizeStationName("주식회사 화이너지(원성깨비주유소)")).toBe("화이너지");
  });

  it("may become shorter than 2 chars after cleanup", () => {
    expect(normalizeStationName("(주)")).toBe("");
    expect(normalizeStationName("셀프")).toBe("");
  });
});

describe("fuelTypeToProdCd", () => {
  it("maps fuel types including HYBRID", () => {
    expect(fuelTypeToProdCd("GASOLINE")).toBe("B027");
    expect(fuelTypeToProdCd("HYBRID")).toBe("B027");
    expect(fuelTypeToProdCd("DIESEL")).toBe("D047");
    expect(fuelTypeToProdCd("LPG")).toBe("K015");
  });
});

describe("shouldMarkPricesSynced", () => {
  it("requires at least half success and rejects zero totals", () => {
    expect(shouldMarkPricesSynced(0, 68)).toBe(false);
    expect(shouldMarkPricesSynced(1, 68)).toBe(false);
    expect(shouldMarkPricesSynced(34, 68)).toBe(true);
    expect(shouldMarkPricesSynced(33, 68)).toBe(false);
    expect(shouldMarkPricesSynced(0, 0)).toBe(false);
  });
});

describe("lastPublishBoundary / isPriceCacheStale", () => {
  const kst1030 = new Date("2026-08-06T01:30:00.000Z");
  const kst0030 = new Date("2026-08-05T15:30:00.000Z");
  const kst1900 = new Date("2026-08-06T10:00:00.000Z");

  it("picks the latest boundary at or before now (KST)", () => {
    const boundary = lastPublishBoundary(kst1030, CHEONAN_CARD_PRICE_BOUNDARIES);
    expect(boundary.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("wraps to previous day's last boundary before 1am KST", () => {
    const boundary = lastPublishBoundary(kst0030, CHEONAN_CARD_PRICE_BOUNDARIES);
    expect(boundary.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("treats exact boundary hour as that boundary", () => {
    const boundary = lastPublishBoundary(kst1900, CHEONAN_CARD_PRICE_BOUNDARIES);
    expect(boundary.toISOString()).toBe("2026-08-06T10:00:00.000Z");
  });

  it("marks cache stale when synced before the last boundary", () => {
    const syncedBefore9 = new Date("2026-08-05T23:00:00.000Z");
    expect(isPriceCacheStale(syncedBefore9, kst1030)).toBe(true);
  });

  it("marks cache fresh when synced after the last boundary", () => {
    const syncedAfter9 = new Date("2026-08-06T00:30:00.000Z");
    expect(isPriceCacheStale(syncedAfter9, kst1030)).toBe(false);
  });

  it("treats null syncedAt as stale", () => {
    expect(isPriceCacheStale(null, kst1030)).toBe(true);
  });
});

describe("isCheonanCardEnabled", () => {
  beforeEach(() => {
    vi.mocked(getSetting).mockReset();
  });

  it("requires CHEONAN_CARD_ENABLED=true AND OPINET_API_KEY", async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string) => {
      if (key === "CHEONAN_CARD_ENABLED") return "true";
      if (key === "OPINET_API_KEY") return "FKEY";
      return null;
    });
    expect(await isCheonanCardEnabled()).toBe(true);
  });

  it("is false when disabled, unset, or missing opinet key", async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string) => {
      if (key === "CHEONAN_CARD_ENABLED") return "false";
      if (key === "OPINET_API_KEY") return "FKEY";
      return null;
    });
    expect(await isCheonanCardEnabled()).toBe(false);

    vi.mocked(getSetting).mockImplementation(async (key: string) => {
      if (key === "CHEONAN_CARD_ENABLED") return "true";
      return null;
    });
    expect(await isCheonanCardEnabled()).toBe(false);

    vi.mocked(getSetting).mockResolvedValue(null);
    expect(await isCheonanCardEnabled()).toBe(false);
  });
});

describe("loadCheonanCardSeed", () => {
  afterEach(() => {
    __setCheonanCardSeedForTests(null);
  });

  it("dedupes opinetIds instead of throwing", () => {
    __setCheonanCardSeedForTests({
      generatedAt: "2026-08-06T00:00:00.000Z",
      source: { konaId: 34, totalMerchants: 2, matched: 2 },
      stations: [
        {
          opinetId: "DUP",
          name: "a",
          brand: null,
          address: "",
          roadAddress: null,
          lat: 0,
          lon: 0,
          lpgYn: "N",
          kona: [],
          match: "manual",
        },
        {
          opinetId: "DUP",
          name: "b",
          brand: null,
          address: "",
          roadAddress: null,
          lat: 0,
          lon: 0,
          lpgYn: "N",
          kona: [],
          match: "manual",
        },
      ],
      unmatched: [],
    });
    expect(loadCheonanCardSeed().stations).toHaveLength(1);
  });

  it("exposes EMPTY_CHEONAN_CARD_SEED for disabled/fail paths", () => {
    expect(EMPTY_CHEONAN_CARD_SEED.stations).toEqual([]);
  });
});
