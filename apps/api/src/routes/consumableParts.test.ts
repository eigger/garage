import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 스케줄 항목의 주기(km/개월)를 UI에서 비워 저장해도 예전에는 값이 그대로 남았다.
describe("PATCH /api/consumable-parts/:id — clearing intervals", () => {
  let app: FastifyInstance;
  let vehicleId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    const suffix = randomUUID();
    vehicleId = (await prisma.vehicle.create({ data: { name: `Parts ${suffix}`, apiToken: randomUUID() } })).id;
    userId = (
      await prisma.user.create({
        data: { name: "Owner", email: `parts-${suffix}@example.com`, passwordHash: "x", role: "ADMIN" },
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

  const patch = (id: string, body: object) =>
    app.inject({
      method: "PATCH",
      url: `/api/consumable-parts/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });

  it("clears one interval with null, keeps it on undefined, and drops the reminder once both are gone", async () => {
    const part = await prisma.consumablePart.create({
      data: {
        vehicleId,
        partType: "엔진오일",
        installedDate: new Date("2026-01-10T00:00:00Z"),
        installedOdometer: 1000,
        expectedLifeKm: 10000,
        expectedLifeMonths: 12,
      },
    });

    const keep = await patch(part.id, { installedOdometer: 1200 });
    expect(keep.statusCode).toBe(200);
    expect(keep.json()).toMatchObject({ expectedLifeKm: 10000, expectedLifeMonths: 12 });

    const clearKm = await patch(part.id, { expectedLifeKm: null });
    expect(clearKm.statusCode).toBe(200);
    expect(clearKm.json()).toMatchObject({ expectedLifeKm: null, expectedLifeMonths: 12 });
    expect(await prisma.reminder.count({ where: { consumablePartId: part.id } })).toBe(1);

    const clearBoth = await patch(part.id, { expectedLifeMonths: null });
    expect(clearBoth.statusCode).toBe(200);
    expect(clearBoth.json()).toMatchObject({ expectedLifeKm: null, expectedLifeMonths: null });
    expect(await prisma.reminder.count({ where: { consumablePartId: part.id } })).toBe(0);
  });

  it("still rejects non-positive intervals", async () => {
    const part = await prisma.consumablePart.create({
      data: { vehicleId, partType: "타이어", installedDate: new Date("2026-01-10T00:00:00Z"), installedOdometer: 0 },
    });
    expect((await patch(part.id, { expectedLifeKm: 0 })).statusCode).toBe(400);
  });
});
