import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 예전에는 소모품 완료 처리(성과)와 "가득 채움" 주유의 효율 개선에만 XP가 붙어서, 매일
// 운행/주유를 성실히 기록해도 XP가 평생 0에 머무를 수 있었다. 주유·정비 "기록 자체"에
// 소액 기본 XP를 추가한 변경 — 성과 보너스와 겹치거나 중복 지급되지 않는지 실제 라우트를
// 통해 검증한다.
describe("baseline logging XP", () => {
  let app: FastifyInstance;
  let vehicleId: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const suffix = randomUUID();

    const admin = await prisma.user.create({
      data: { name: "Test Admin", email: `test-admin-${suffix}@example.com`, passwordHash: "x", role: "ADMIN" },
    });
    adminToken = app.jwt.sign({ sub: admin.id, role: "ADMIN" });

    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID() },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  it("awards baseline XP for a partial-tank fuel log (no efficiency bonus applies)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/fuel-logs`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 15000, fullTank: false },
    });
    expect(res.statusCode).toBe(201);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.xp).toBe(5);

    const events = await prisma.xpEvent.findMany({ where: { vehicleId } });
    expect(events.map((e) => e.type)).toEqual(["FUEL_LOG"]);
  });

  it("awards baseline XP for a maintenance record log, on top of the fuel log XP", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/maintenance-records`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, type: "engineOilFilter" },
    });
    expect(res.statusCode).toBe(201);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.xp).toBe(10); // 5 (fuel log, previous test) + 5 (maintenance log)

    const types = (await prisma.xpEvent.findMany({ where: { vehicleId }, orderBy: { createdAt: "asc" } })).map(
      (e) => e.type,
    );
    expect(types).toEqual(["FUEL_LOG", "MAINTENANCE_LOG"]);
  });

  it("adds a DETAIL_LOG bonus to a fuel log that records where it happened", async () => {
    const vehicle = await prisma.vehicle.create({ data: { name: `Detail Fuel ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/fuel-logs`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          date: new Date().toISOString(),
          odometer: 1000,
          liters: 10,
          cost: 15000,
          fullTank: false,
          address: "서울시 강남구 테헤란로 1",
        },
      });
      expect(res.statusCode).toBe(201);

      const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
      expect(updated.xp).toBe(10); // 5 FUEL_LOG + 5 DETAIL_LOG
      const types = (await prisma.xpEvent.findMany({ where: { vehicleId: vehicle.id } })).map((e) => e.type).sort();
      expect(types).toEqual(["DETAIL_LOG", "FUEL_LOG"]);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("does not add a DETAIL_LOG bonus to a bare fuel log with no location", async () => {
    const vehicle = await prisma.vehicle.create({ data: { name: `Bare Fuel ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/fuel-logs`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 15000, fullTank: false },
      });
      expect(res.statusCode).toBe(201);

      const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
      expect(updated.xp).toBe(5);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("adds a DETAIL_LOG bonus to a maintenance record with 2+ optional fields filled", async () => {
    const vehicle = await prisma.vehicle.create({ data: { name: `Detail Maint ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/maintenance-records`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          date: new Date().toISOString(),
          odometer: 1000,
          type: "engineOilFilter",
          cost: 50000,
          shop: "동네 정비소",
        },
      });
      expect(res.statusCode).toBe(201);

      const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
      expect(updated.xp).toBe(10); // 5 MAINTENANCE_LOG + 5 DETAIL_LOG
      const types = (await prisma.xpEvent.findMany({ where: { vehicleId: vehicle.id } })).map((e) => e.type).sort();
      expect(types).toEqual(["DETAIL_LOG", "MAINTENANCE_LOG"]);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("does not add a DETAIL_LOG bonus to a maintenance record with only 1 optional field filled", async () => {
    const vehicle = await prisma.vehicle.create({ data: { name: `Sparse Maint ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/maintenance-records`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { date: new Date().toISOString(), odometer: 1000, type: "engineOilFilter", cost: 50000 },
      });
      expect(res.statusCode).toBe(201);

      const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
      expect(updated.xp).toBe(5);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });
});
