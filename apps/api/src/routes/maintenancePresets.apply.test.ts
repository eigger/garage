import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { ensureMaintenancePresets } from "../lib/seedPresets.js";

describe("maintenance preset apply-existing catalog variants", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await ensureMaintenancePresets();
    const admin = await prisma.user.create({
      data: {
        name: "Preset Apply Admin",
        email: `preset-apply-${randomUUID()}@example.com`,
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

  it("renames a legacy Korean schedule item instead of creating a duplicate catalog key", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        name: `Preset Apply ${randomUUID()}`,
        apiToken: randomUUID(),
        fuelType: "DIESEL",
        odometer: 72_918,
      },
    });

    try {
      await prisma.consumablePart.create({
        data: {
          vehicleId: vehicle.id,
          partType: "타이어 교체",
          category: "MAINTENANCE",
          installedDate: new Date("2026-06-07T00:00:00.000Z"),
          installedOdometer: 72_918,
          expectedLifeKm: null,
          expectedLifeMonths: null,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/maintenance-presets/apply-existing",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { fuelType: "DIESEL", category: "MAINTENANCE" },
      });
      expect(res.statusCode).toBe(200);

      const tireParts = await prisma.consumablePart.findMany({
        where: {
          vehicleId: vehicle.id,
          partType: { in: ["tireReplacement", "타이어 교체"] },
        },
      });
      expect(tireParts).toHaveLength(1);
      expect(tireParts[0].partType).toBe("tireReplacement");
      expect(tireParts[0].installedDate.toISOString()).toBe("2026-06-07T00:00:00.000Z");
      expect(tireParts[0].installedOdometer).toBe(72_918);
      expect(tireParts[0].expectedLifeKm).toBe(40_000);
      expect(tireParts[0].expectedLifeMonths).toBe(36);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
    }
  });
});
