import { describe, expect, it } from "vitest";
import { parseDayRange } from "./dateRange.js";

describe("parseDayRange", () => {
  it("returns a UTC half-open day range for YYYY-MM-DD", () => {
    expect(parseDayRange("2026-08-07")).toEqual({
      gte: new Date("2026-08-07T00:00:00.000Z"),
      lt: new Date("2026-08-08T00:00:00.000Z"),
    });
  });

  it("rejects malformed values", () => {
    expect(parseDayRange("2026-08")).toBeNull();
    expect(parseDayRange("2026/08/07")).toBeNull();
    expect(parseDayRange("")).toBeNull();
  });
});
