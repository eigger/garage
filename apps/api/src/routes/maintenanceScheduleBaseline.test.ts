import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 과거 정비/행정 기록을 수정해도, 같은 항목에 더 최신 기록이 있으면
// ConsumablePart(스케줄 기준)가 과거 날짜로 역행하지 않아야 한다.
describe("maintenance record schedule baseline", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const admin = await prisma.user.create({
      data: {
        name: "Schedule Baseline Admin",
        email: `schedule-baseline-${randomUUID()}@example.com`,
        passwordHash: "x",
        role: "ADMIN",
      },
    });
    adminToken = app.jwt.sign({ sub: admin.id, role: "ADMIN" });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function seedVehicleWithPart(
    partType: string,
    category: "MAINTENANCE" | "ADMINISTRATIVE" = "ADMINISTRATIVE",
  ) {
    const vehicle = await prisma.vehicle.create({
      data: { name: `Schedule Baseline ${randomUUID()}`, apiToken: randomUUID(), odometer: 20_000 },
    });
    await prisma.consumablePart.create({
      data: {
        vehicleId: vehicle.id,
        partType,
        category,
        installedDate: new Date("2024-01-01T00:00:00.000Z"),
        installedOdometer: 10_000,
        expectedLifeMonths: 12,
      },
    });
    return vehicle;
  }

  it("does not move the schedule baseline when an older administrative record is edited", async () => {
    const vehicle = await seedVehicleWithPart("autoInsuranceRenewal");
    try {
      const older = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2024-06-01T00:00:00.000Z"),
          odometer: 12_000,
        },
      });
      const newer = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2025-06-01T00:00:00.000Z"),
          odometer: 18_000,
        },
      });
      await prisma.consumablePart.updateMany({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
        data: { installedDate: newer.date, installedOdometer: newer.odometer },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/vehicles/${vehicle.id}/maintenance-records/${older.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { date: "2024-07-15T00:00:00.000Z", odometer: 12_500 },
      });
      expect(res.statusCode).toBe(200);

      const part = await prisma.consumablePart.findFirstOrThrow({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
      });
      expect(part.installedDate.toISOString()).toBe(newer.date.toISOString());
      expect(part.installedOdometer).toBe(newer.odometer);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("keeps the newest baseline when older/newer records use mixed catalog key and legacy labels", async () => {
    // 실제 DB에는 partType=autoInsuranceRenewal 인데 최신 기록만 legacy 한글
    // ("자동차보험 갱신")로 남아 있는 경우가 있다. exact type 매칭만 하면
    // 과거 키 기록이 "최신"으로 잘못 잡혀 스케줄이 한 단계 뒤로 밀린다.
    const vehicle = await seedVehicleWithPart("autoInsuranceRenewal");
    try {
      const olderKey = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2024-06-01T00:00:00.000Z"),
          odometer: 12_000,
        },
      });
      const newerLegacy = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "자동차보험 갱신",
          category: "ADMINISTRATIVE",
          date: new Date("2025-06-01T00:00:00.000Z"),
          odometer: 18_000,
        },
      });
      await prisma.consumablePart.updateMany({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
        data: { installedDate: newerLegacy.date, installedOdometer: newerLegacy.odometer },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/vehicles/${vehicle.id}/maintenance-records/${olderKey.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { date: "2024-07-15T00:00:00.000Z", notes: "메모만 수정" },
      });
      expect(res.statusCode).toBe(200);

      const part = await prisma.consumablePart.findFirstOrThrow({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
      });
      expect(part.installedDate.toISOString()).toBe(newerLegacy.date.toISOString());
      expect(part.installedOdometer).toBe(newerLegacy.odometer);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("updates the schedule baseline when the newest record is edited", async () => {
    const vehicle = await seedVehicleWithPart("autoInsuranceRenewal");
    try {
      await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2024-06-01T00:00:00.000Z"),
          odometer: 12_000,
        },
      });
      const newer = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2025-06-01T00:00:00.000Z"),
          odometer: 18_000,
        },
      });
      await prisma.consumablePart.updateMany({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
        data: { installedDate: newer.date, installedOdometer: newer.odometer },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/vehicles/${vehicle.id}/maintenance-records/${newer.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { date: "2025-07-01T00:00:00.000Z", odometer: 18_500 },
      });
      expect(res.statusCode).toBe(200);

      const part = await prisma.consumablePart.findFirstOrThrow({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
      });
      expect(part.installedDate.toISOString()).toBe("2025-07-01T00:00:00.000Z");
      expect(part.installedOdometer).toBe(18_500);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("does not move the schedule baseline when creating a backdated record", async () => {
    const vehicle = await seedVehicleWithPart("engineOilFilter", "MAINTENANCE");
    try {
      const createNewer = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/maintenance-records`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          date: "2025-06-01T00:00:00.000Z",
          odometer: 18_000,
          type: "engineOilFilter",
          category: "MAINTENANCE",
        },
      });
      expect(createNewer.statusCode).toBe(201);

      const createOlder = await app.inject({
        method: "POST",
        url: `/api/vehicles/${vehicle.id}/maintenance-records`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          date: "2024-06-01T00:00:00.000Z",
          odometer: 12_000,
          type: "engineOilFilter",
          category: "MAINTENANCE",
        },
      });
      expect(createOlder.statusCode).toBe(201);

      const part = await prisma.consumablePart.findFirstOrThrow({
        where: { vehicleId: vehicle.id, partType: "engineOilFilter" },
      });
      expect(part.installedDate.toISOString()).toBe("2025-06-01T00:00:00.000Z");
      expect(part.installedOdometer).toBe(18_000);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });

  it("falls back to the previous record when the newest record is deleted", async () => {
    const vehicle = await seedVehicleWithPart("autoInsuranceRenewal");
    try {
      const older = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2024-06-01T00:00:00.000Z"),
          odometer: 12_000,
        },
      });
      const newer = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          type: "autoInsuranceRenewal",
          category: "ADMINISTRATIVE",
          date: new Date("2025-06-01T00:00:00.000Z"),
          odometer: 18_000,
        },
      });
      await prisma.consumablePart.updateMany({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
        data: { installedDate: newer.date, installedOdometer: newer.odometer },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/vehicles/${vehicle.id}/maintenance-records/${newer.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(204);

      const part = await prisma.consumablePart.findFirstOrThrow({
        where: { vehicleId: vehicle.id, partType: "autoInsuranceRenewal" },
      });
      expect(part.installedDate.toISOString()).toBe(older.date.toISOString());
      expect(part.installedOdometer).toBe(older.odometer);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });
});
