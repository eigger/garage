import { describe, expect, it } from "vitest";
import { computeFuelEfficiencyPoints } from "./fuelEfficiency";
import type { FuelLog } from "./types";

function log(overrides: Partial<FuelLog> & { id: string; odometer: number; liters: number }): FuelLog {
  return {
    vehicleId: "v1",
    userId: null,
    date: "2026-01-01T00:00:00.000Z",
    cost: 0,
    fullTank: true,
    location: null,
    latitude: null,
    longitude: null,
    address: null,
    opinetStationId: null,
    attachments: [],
    ...overrides,
  };
}

describe("computeFuelEfficiencyPoints", () => {
  it("sums liters from partial fills between two full tanks into the km/L denominator", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 10_000, liters: 40, fullTank: true }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 10_300, liters: 20, fullTank: false }),
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 10_600, liters: 30, fullTank: true }),
    ];

    const points = computeFuelEfficiencyPoints(logs);

    expect(points).toHaveLength(1);
    expect(points[0].logId).toBe("c");
    expect(points[0].distanceKm).toBe(600);
    // 600km / (20L partial + 30L full) = 12 km/L — not 600/30 = 20 km/L.
    expect(points[0].kmPerLiter).toBeCloseTo(12);
    expect(points[0].litersPer100Km).toBeCloseTo(50 / 6);
  });

  it("sums liters across multiple partial fills in one segment", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 0, liters: 10, fullTank: true }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 100, liters: 5, fullTank: false }),
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 200, liters: 5, fullTank: false }),
      log({ id: "d", date: "2026-01-04T00:00:00.000Z", odometer: 300, liters: 10, fullTank: true }),
    ];

    const points = computeFuelEfficiencyPoints(logs);

    expect(points).toHaveLength(1);
    expect(points[0].distanceKm).toBe(300);
    expect(points[0].kmPerLiter).toBeCloseTo(15); // 300 / (5+5+10)
  });

  it("produces no point for the first full tank (no prior baseline)", () => {
    const logs = [log({ id: "a", odometer: 10_000, liters: 40, fullTank: true })];
    expect(computeFuelEfficiencyPoints(logs)).toHaveLength(0);
  });

  it("resets the accumulator after each full tank so segments don't leak into each other", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 0, liters: 40, fullTank: true }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 400, liters: 40, fullTank: true }),
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 100, liters: 10, fullTank: false }), // out of order odometer, ignored below
      log({ id: "d", date: "2026-01-04T00:00:00.000Z", odometer: 800, liters: 40, fullTank: true }),
    ];

    const points = computeFuelEfficiencyPoints(logs);

    expect(points.map((p) => p.logId)).toEqual(["b", "d"]);
    expect(points[0].kmPerLiter).toBeCloseTo(10); // 400 / 40, unaffected by log "a"'s own liters
  });

  it("skips a full tank whose odometer did not advance, without breaking later segments", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 1000, liters: 40, fullTank: true }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 1000, liters: 5, fullTank: true }), // same odometer, likely a data-entry mistake
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 1300, liters: 25, fullTank: true }),
    ];

    const points = computeFuelEfficiencyPoints(logs);

    expect(points.map((p) => p.logId)).toEqual(["c"]);
    expect(points[0].distanceKm).toBe(300);
    expect(points[0].kmPerLiter).toBeCloseTo(12); // 300 / 25, "b"'s liters dropped along with the invalid segment
  });
});
