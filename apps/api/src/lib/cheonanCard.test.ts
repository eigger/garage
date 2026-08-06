import { describe, it, expect } from "vitest";
import {
  normalizeStationName,
  lastPublishBoundary,
  isPriceCacheStale,
  fuelTypeToProdCd,
  CHEONAN_CARD_PRICE_BOUNDARIES,
} from "./cheonanCardPure.js";

describe("normalizeStationName", () => {
  it("strips corporate suffixes and whitespace", () => {
    expect(normalizeStationName("(주)광명주유소")).toBe("광명주유소");
    expect(normalizeStationName("주식회사 화이너지")).toBe("화이너지");
    expect(normalizeStationName("태조산 셀프 주유소")).toBe("태조산주유소");
    expect(normalizeStationName("SK Self Station")).toBe("skstation");
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

describe("lastPublishBoundary / isPriceCacheStale", () => {
  // 2026-08-06 10:30 KST = 2026-08-06 01:30 UTC
  const kst1030 = new Date("2026-08-06T01:30:00.000Z");
  // 2026-08-06 00:30 KST = 2026-08-05 15:30 UTC (after midnight, before 1am boundary)
  const kst0030 = new Date("2026-08-05T15:30:00.000Z");
  // 2026-08-06 19:00 KST exactly
  const kst1900 = new Date("2026-08-06T10:00:00.000Z");

  it("picks the latest boundary at or before now (KST)", () => {
    const boundary = lastPublishBoundary(kst1030, CHEONAN_CARD_PRICE_BOUNDARIES);
    // 09:00 KST = 00:00 UTC
    expect(boundary.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("wraps to previous day's last boundary before 1am KST", () => {
    const boundary = lastPublishBoundary(kst0030, CHEONAN_CARD_PRICE_BOUNDARIES);
    // 19:00 KST previous calendar day = 2026-08-05 10:00 UTC
    expect(boundary.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("treats exact boundary hour as that boundary", () => {
    const boundary = lastPublishBoundary(kst1900, CHEONAN_CARD_PRICE_BOUNDARIES);
    expect(boundary.toISOString()).toBe("2026-08-06T10:00:00.000Z");
  });

  it("marks cache stale when synced before the last boundary", () => {
    const syncedBefore9 = new Date("2026-08-05T23:00:00.000Z"); // 08:00 KST
    expect(isPriceCacheStale(syncedBefore9, kst1030)).toBe(true);
  });

  it("marks cache fresh when synced after the last boundary", () => {
    const syncedAfter9 = new Date("2026-08-06T00:30:00.000Z"); // 09:30 KST
    expect(isPriceCacheStale(syncedAfter9, kst1030)).toBe(false);
  });

  it("treats null syncedAt as stale", () => {
    expect(isPriceCacheStale(null, kst1030)).toBe(true);
  });
});
