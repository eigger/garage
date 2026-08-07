import { describe, expect, it } from "vitest";
import { parseDayRange, parsePeriodRange, periodRangeFromQuery } from "./dateRange.js";

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
