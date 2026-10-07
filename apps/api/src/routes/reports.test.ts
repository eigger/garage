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

  const daysAgo = (n: number) => {
    const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    return new Date(d.toISOString().slice(0, 10) + "T00:00:00Z");
  };

  it("uses earlier logs outside the period for efficiency and prints date-only values without a time", async () => {
    await prisma.fuelLog.createMany({
      data: [
        { vehicleId, date: daysAgo(60), odometer: 1000, liters: 40, cost: 60000, fullTank: true },
        { vehicleId, date: daysAgo(40), odometer: 1300, liters: 20, cost: 30000, fullTank: false },
        { vehicleId, date: daysAgo(5), odometer: 1500, liters: 30, cost: 45000, fullTank: true },
      ],
    });
    const res = await get("category=fuel&period=1m");
    expect(res.statusCode).toBe(200);
    const rows = res.body.split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
    // 기간(최근 30일) 안의 행은 하나뿐이고, 그 연비는 기간 밖 기록까지 합쳐 계산된다:
    // 500km / (20 + 30)L = 10.00 (마지막 주유량 30L만 쓰면 16.67).
    expect(rows).toHaveLength(1);
    const cols = rows[0].split(",");
    expect(cols[0]).toBe(daysAgo(5).toISOString().slice(0, 10));
    expect(cols[6]).toBe("10.00");
  });

  it("orders same-day fills by odometer so efficiency does not depend on entry order", async () => {
    const v2 = await prisma.vehicle.create({ data: { name: `Report2 ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const day = daysAgo(3);
      // 입력 순서: 가득(1310km)을 먼저, 부분(1300km)을 나중에 넣어도 주행거리 순으로 계산돼야 한다.
      await prisma.fuelLog.createMany({
        data: [
          { vehicleId: v2.id, date: daysAgo(10), odometer: 1000, liters: 40, cost: 1, fullTank: true },
          { vehicleId: v2.id, date: day, odometer: 1310, liters: 10, cost: 1, fullTank: true },
          { vehicleId: v2.id, date: day, odometer: 1300, liters: 20, cost: 1, fullTank: false },
        ],
      });
      const res = await app.inject({
        method: "GET",
        url: `/api/vehicles/${v2.id}/reports/export?category=fuel&period=all`,
        headers: { authorization: `Bearer ${token}` },
      });
      const rows = res.body.split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
      // 1000 -> (부분 1300, 20L) -> 가득 1310, 10L: 310km / 30L = 10.33
      const full = rows.find((r) => r.split(",")[1] === "1310")!;
      expect(full.split(",")[6]).toBe("10.33");
    } finally {
      await prisma.vehicle.delete({ where: { id: v2.id } }).catch(() => {});
    }
  });
});
