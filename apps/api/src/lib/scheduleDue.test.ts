import { describe, expect, it } from "vitest";
import { addMonthsClamped, computeDueBaseline } from "@garage/shared";

describe("addMonthsClamped", () => {
  it("clamps to the last day of a shorter month instead of overflowing", () => {
    expect(addMonthsClamped(new Date("2026-08-31T00:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(addMonthsClamped(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonthsClamped(new Date("2023-12-31T00:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2024-02-29");
  });

  it("keeps ordinary dates and crosses years", () => {
    expect(addMonthsClamped(new Date("2026-03-15T00:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(addMonthsClamped(new Date("2026-11-30T00:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});

describe("computeDueBaseline", () => {
  it("uses the clamped date for month-based intervals", () => {
    const { dueDate, dueOdometer } = computeDueBaseline({
      installedDate: "2026-08-31T00:00:00.000Z",
      installedOdometer: 1000,
      expectedLifeKm: null,
      expectedLifeMonths: 6,
    });
    expect(dueDate?.toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(dueOdometer).toBeNull();
  });
});
