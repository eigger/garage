import { describe, expect, it } from "vitest";
import {
  computeFuelCostPerDistancePoints,
  computeFuelEfficiencyPoints,
  efficiencyUnitLabels,
  fuelVolumeUnit,
  toDisplayConsumption,
  toDisplayEfficiency,
  toDisplayVolume,
  toStoredVolume,
} from "./fuelEfficiency";
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

describe("computeFuelCostPerDistancePoints", () => {
  it("produces a point for every fill-up, full tank or not", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 10_000, liters: 40, cost: 60_000, fullTank: true }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 10_300, liters: 20, cost: 30_000, fullTank: false }),
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 10_600, liters: 30, cost: 45_000, fullTank: false }),
    ];

    const points = computeFuelCostPerDistancePoints(logs);

    // 연비는 같은 데이터로 점이 0개(가득이 한 번뿐)지만, 거리당 비용은 2개가 나온다.
    expect(computeFuelEfficiencyPoints(logs)).toHaveLength(0);
    expect(points.map((p) => p.logId)).toEqual(["b", "c"]);
    expect(points[0].costPerKm).toBeCloseTo(100); // 30,000원 / 300km
    expect(points[1].costPerKm).toBeCloseTo(150); // 45,000원 / 300km
  });

  it("produces no point for the first fill-up (no prior odometer baseline)", () => {
    const logs = [log({ id: "a", odometer: 10_000, liters: 40, cost: 60_000 })];
    expect(computeFuelCostPerDistancePoints(logs)).toHaveLength(0);
  });

  it("keeps the baseline on the last sane log when an odometer goes backwards", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 1000, liters: 40, cost: 60_000 }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 1300, liters: 20, cost: 30_000 }),
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 200, liters: 10, cost: 15_000 }), // 오타로 자릿수가 빠진 입력
      log({ id: "d", date: "2026-01-04T00:00:00.000Z", odometer: 1600, liters: 20, cost: 30_000 }),
    ];

    const points = computeFuelCostPerDistancePoints(logs);

    // "c"를 기준점으로 삼았다면 d의 거리가 1400km로 부풀려졌을 것 — 기준점은 "b"에 남아야 한다.
    expect(points.map((p) => p.logId)).toEqual(["b", "d"]);
    expect(points[1].distanceKm).toBe(300);
    expect(points[1].costPerKm).toBeCloseTo(100);
  });

  it("skips a zero-cost fill for the point but still advances the distance baseline", () => {
    const logs = [
      log({ id: "a", date: "2026-01-01T00:00:00.000Z", odometer: 0, liters: 40, cost: 60_000 }),
      log({ id: "b", date: "2026-01-02T00:00:00.000Z", odometer: 200, liters: 20, cost: 0 }), // 금액 미입력
      log({ id: "c", date: "2026-01-03T00:00:00.000Z", odometer: 500, liters: 30, cost: 45_000 }),
    ];

    const points = computeFuelCostPerDistancePoints(logs);

    expect(points.map((p) => p.logId)).toEqual(["c"]);
    // 기준점이 "b"로 넘어가므로 500km가 아니라 300km — "b" 이전 주행은 이미 지나간 구간이다.
    expect(points[0].distanceKm).toBe(300);
    expect(points[0].costPerKm).toBeCloseTo(150);
  });
});

describe("unit conversion", () => {
  it("labels the mile+gallon combination as mpg, other combinations literally", () => {
    expect(efficiencyUnitLabels("GASOLINE", "km", "L")).toEqual({ perUnit: "km/L", per100: "L/100km" });
    expect(efficiencyUnitLabels("GASOLINE", "mi", "L")).toEqual({ perUnit: "mi/L", per100: "L/100mi" });
    expect(efficiencyUnitLabels("GASOLINE", "km", "gal")).toEqual({ perUnit: "km/gal", per100: "gal/100km" });
    expect(efficiencyUnitLabels("GASOLINE", "mi", "gal")).toEqual({ perUnit: "mpg", per100: "gal/100mi" });
  });

  it("never converts an EV's kWh to gallons", () => {
    expect(fuelVolumeUnit("ELECTRIC", "gal")).toBe("kWh");
    expect(toDisplayVolume(50, "ELECTRIC", "gal")).toBe(50);
    expect(efficiencyUnitLabels("ELECTRIC", "mi", "gal")).toEqual({
      perUnit: "mi/kWh",
      per100: "kWh/100mi",
    });
  });

  it("converts km/L to mpg and L/100km to gal/100mi", () => {
    expect(toDisplayEfficiency(14.6, "GASOLINE", "mi", "gal")).toBeCloseTo(34.34, 1);
    expect(toDisplayConsumption(6.8, "GASOLINE", "mi", "gal")).toBeCloseTo(2.89, 1);
    // 단위를 안 바꾼 사용자에게는 값이 그대로여야 한다.
    expect(toDisplayEfficiency(14.6, "GASOLINE", "km", "L")).toBeCloseTo(14.6);
    expect(toDisplayConsumption(6.8, "GASOLINE", "km", "L")).toBeCloseTo(6.8);
  });

  it("round-trips a volume through display and storage without drift", () => {
    const stored = 25;
    const shown = toDisplayVolume(stored, "GASOLINE", "gal");
    expect(shown).toBeCloseTo(6.6, 1);
    expect(toStoredVolume(shown, "GASOLINE", "gal")).toBeCloseTo(stored);
  });
});

describe("unit conversion guards", () => {
  it("treats an unknown fuel type as unconvertible so kWh is never scaled", () => {
    // 차량 조회 전/실패 시 fuelType은 null이다. 이때 갤런 환산이 걸리면 전기차 충전량이
    // 3.8배로 저장되므로, 호출부는 연료 타입을 알기 전까지 "L"을 넘겨 환산을 막는다.
    expect(toStoredVolume(40, null, "L")).toBe(40);
    expect(fuelVolumeUnit(null, "L")).toBe("L");
    // 환산을 걸면 실제로 3.8배가 된다는 것 — 위 가드가 막는 값이다.
    expect(toStoredVolume(40, null, "gal")).toBeCloseTo(151.4, 1);
  });

  it("does not drift a liter value that survives a 2-decimal gallon round trip", () => {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const shown = round2(toDisplayVolume(25, "GASOLINE", "gal"));
    // 표시값을 그대로 되돌리면 25L가 아니라 24.98L이 된다 — 그래서 화면단은 입력이
    // 그대로면 원본 리터를 보낸다.
    expect(toStoredVolume(shown, "GASOLINE", "gal")).not.toBeCloseTo(25, 3);
    expect(toStoredVolume(shown, "GASOLINE", "gal")).toBeCloseTo(24.98, 1);
  });
});
