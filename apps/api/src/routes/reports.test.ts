import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

describe("GET /api/vehicles/:id/reports/export", () => {
  let app: FastifyInstance;
  let vehicleId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    const suffix = randomUUID();
    vehicleId = (await prisma.vehicle.create({ data: { name: `Report ${suffix}`, apiToken: randomUUID() } })).id;
    userId = (
      await prisma.user.create({
        data: { name: "Owner", email: `report-${suffix}@example.com`, passwordHash: "x", role: "ADMIN" },
      })
    ).id;
    token = app.jwt.sign({ sub: userId, role: "ADMIN" });
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  const get = (qs: string) =>
    app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}/reports/export?${qs}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("prints trip times in KST, not the container's UTC", async () => {
    await prisma.trip.create({
      data: { vehicleId, startTime: new Date("2026-08-03T00:30:00Z"), endTime: new Date("2026-08-03T01:10:00Z"), distanceKm: 12 },
    });
    const res = await get("category=trips&period=all");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("2026-08-03 09:30:00");
    expect(res.body).toContain("2026-08-03 10:10:00");
  });

  it("sums partial fills between full tanks, matching the web calculation", async () => {
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    await prisma.fuelLog.createMany({
      data: [
        { vehicleId, date: day("2026-01-01"), odometer: 1000, liters: 40, cost: 60000, fullTank: true },
        { vehicleId, date: day("2026-01-10"), odometer: 1300, liters: 20, cost: 30000, fullTank: false },
        { vehicleId, date: day("2026-01-20"), odometer: 1500, liters: 30, cost: 45000, fullTank: true },
      ],
    });
    const res = await get("category=fuel&period=all");
    expect(res.statusCode).toBe(200);
    // 500km / (20 + 30)L = 10.00 — 마지막 주유량(30L)만 쓰면 16.67이 된다.
    expect(res.body).toContain("10.00");
    expect(res.body).not.toContain("16.67");
  });
});
