import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn();

vi.mock("./prisma.js", () => ({
  prisma: {
    fuelLog: {
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

import { getVehicleFuelStats } from "./fuelStats.js";

describe("getVehicleFuelStats", () => {
  it("includes partial-fill liters in the km/L denominator between two full tanks", async () => {
    findMany.mockResolvedValue([
      { odometer: 10_000, liters: 40, fullTank: true },
      { odometer: 10_300, liters: 20, fullTank: false },
      { odometer: 10_600, liters: 30, fullTank: true },
    ]);

    const { kmPerLiter } = await getVehicleFuelStats("v1");

    // 600km / (20L partial + 30L full) = 12 km/L — not 600/30 = 20 km/L.
    expect(kmPerLiter).toBeCloseTo(12);
  });

  it("does not fetch fewer rows than the web calculation needs (no fullTank-only filter)", async () => {
    findMany.mockResolvedValue([]);
    await getVehicleFuelStats("v1");
    const [{ where }] = findMany.mock.calls[0];
    expect(where).toEqual({ vehicleId: "v1" });
  });

  it("still averages avgLiters over full-tank fills only", async () => {
    findMany.mockResolvedValue([
      { odometer: 0, liters: 40, fullTank: true },
      { odometer: 100, liters: 15, fullTank: false },
      { odometer: 200, liters: 30, fullTank: true },
    ]);

    const { avgLiters } = await getVehicleFuelStats("v1");

    expect(avgLiters).toBeCloseTo(35); // (40 + 30) / 2, 15L partial excluded
  });

  it("returns nulls when there are no fill-ups", async () => {
    findMany.mockResolvedValue([]);
    const stats = await getVehicleFuelStats("v1");
    expect(stats).toEqual({ kmPerLiter: null, avgLiters: null });
  });
});
