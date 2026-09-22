import { describe, expect, it } from "vitest";
import { parseDayRange, parsePeriodRange, periodRangeFromQuery, todayDateOnly } from "./dateRange.js";

describe("parsePeriodRange", () => {
  it("parses a UTC year range", () => {
    expect(parsePeriodRange("2026")).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lt: new Date("2027-01-01T00:00:00.000Z"),
    });
  });

  it("parses a UTC month range", () => {
    expect(parsePeriodRange("2026-08")).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(parsePeriodRange("2026-12")).toEqual({
      gte: new Date("2026-12-01T00:00:00.000Z"),
      lt: new Date("2027-01-01T00:00:00.000Z"),
    });
  });

  it("parses a UTC day range", () => {
    expect(parsePeriodRange("2026-08-07")).toEqual({
      gte: new Date("2026-08-07T00:00:00.000Z"),
      lt: new Date("2026-08-08T00:00:00.000Z"),
    });
    expect(parseDayRange("2026-08-07")).toEqual(parsePeriodRange("2026-08-07"));
  });

  it("rejects malformed or impossible values", () => {
    expect(parsePeriodRange("")).toBeNull();
    expect(parsePeriodRange("2026/08/07")).toBeNull();
    expect(parsePeriodRange("2026-13")).toBeNull();
    expect(parsePeriodRange("2026-02-31")).toBeNull();
  });
});

describe("periodRangeFromQuery", () => {
  it("prefers period over legacy date", () => {
    expect(periodRangeFromQuery({ period: "2026", date: "2026-08-07" })).toEqual(
      parsePeriodRange("2026"),
    );
  });

  it("falls back to date", () => {
    expect(periodRangeFromQuery({ date: "2026-08-07" })).toEqual(parsePeriodRange("2026-08-07"));
  });
});

describe("todayDateOnly", () => {
  it("uses Asia/Seoul calendar date as UTC midnight", () => {
    // UTC 2026-09-22 23:00 = KST 2026-09-23 08:00 → KST "오늘"은 9/23
    expect(todayDateOnly(new Date("2026-09-22T23:00:00.000Z")).toISOString()).toBe(
      "2026-09-23T00:00:00.000Z",
    );
    // UTC 2026-09-22 14:00 = KST 2026-09-22 23:00 → 아직 9/22
    expect(todayDateOnly(new Date("2026-09-22T14:00:00.000Z")).toISOString()).toBe(
      "2026-09-22T00:00:00.000Z",
    );
  });
});
