import { randomUUID } from "crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { UPLOAD_DIR } from "../lib/uploads.js";

// 기록·차량을 지우면 첨부 행은 cascade로 사라지지만 디스크 파일이 남던 문제.
describe("deleting records removes their attachment files", () => {
  let app: FastifyInstance;
  let userId: string;
  let token: string;
  const created: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await mkdir(UPLOAD_DIR, { recursive: true });
    userId = (
      await prisma.user.create({
        data: { name: "Owner", email: `att-${randomUUID()}@example.com`, passwordHash: "x", role: "ADMIN" },
      })
    ).id;
    token = app.jwt.sign({ sub: userId, role: "ADMIN" });
  });

  afterAll(async () => {
    await Promise.all(created.map((f) => rm(path.join(UPLOAD_DIR, f), { force: true })));
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  async function stored(): Promise<string> {
    const name = `${randomUUID()}.jpg`;
    await writeFile(path.join(UPLOAD_DIR, name), "x");
    created.push(name);
    return name;
  }
  const onDisk = (name: string) => existsSync(path.join(UPLOAD_DIR, name));
  const del = (url: string) =>
    app.inject({ method: "DELETE", url, headers: { authorization: `Bearer ${token}` } });

  it("removes files for a deleted fuel log and maintenance record", async () => {
    const v = await prisma.vehicle.create({ data: { name: `Att ${randomUUID()}`, apiToken: randomUUID() } });
    try {
      const log = await prisma.fuelLog.create({
        data: { vehicleId: v.id, date: new Date(), odometer: 1, liters: 1, cost: 1, fullTank: true },
      });
      const rec = await prisma.maintenanceRecord.create({
        data: { vehicleId: v.id, date: new Date(), odometer: 1, type: "엔진오일" },
      });
      const f1 = await stored();
      const f2 = await stored();
      await prisma.attachment.create({ data: { filePath: f1, mimeType: "image/jpeg", fuelLogId: log.id } });
      await prisma.attachment.create({ data: { filePath: f2, mimeType: "image/jpeg", maintenanceRecordId: rec.id } });

      expect((await del(`/api/vehicles/${v.id}/fuel-logs/${log.id}`)).statusCode).toBe(204);
      expect(onDisk(f1)).toBe(false);
      expect(onDisk(f2)).toBe(true);

      expect((await del(`/api/vehicles/${v.id}/maintenance-records/${rec.id}`)).statusCode).toBe(204);
      expect(onDisk(f2)).toBe(false);
    } finally {
      await prisma.vehicle.delete({ where: { id: v.id } }).catch(() => {});
    }
  });

  it("removes every file tied to a deleted vehicle (own, fuel log, maintenance record)", async () => {
    const v = await prisma.vehicle.create({ data: { name: `Att ${randomUUID()}`, apiToken: randomUUID() } });
    const log = await prisma.fuelLog.create({
      data: { vehicleId: v.id, date: new Date(), odometer: 1, liters: 1, cost: 1, fullTank: true },
    });
    const rec = await prisma.maintenanceRecord.create({
      data: { vehicleId: v.id, date: new Date(), odometer: 1, type: "엔진오일" },
    });
    const files = [await stored(), await stored(), await stored()];
    await prisma.attachment.create({ data: { filePath: files[0], mimeType: "image/jpeg", vehicleId: v.id } });
    await prisma.attachment.create({ data: { filePath: files[1], mimeType: "image/jpeg", fuelLogId: log.id } });
    await prisma.attachment.create({ data: { filePath: files[2], mimeType: "image/jpeg", maintenanceRecordId: rec.id } });

    expect((await del(`/api/vehicles/${v.id}`)).statusCode).toBe(204);
    for (const f of files) expect(onDisk(f)).toBe(false);
  });
});
