import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 업로드 쿼리의 부모 id 검증. 파일 파트를 읽기 전에 거부되므로 multipart 본문 없이도 확인할 수 있다.
describe("POST /api/attachments — parent validation", () => {
  let app: FastifyInstance;
  let adminId: string;
  let memberId: string;
  let vehicleA: string;
  let vehicleB: string;
  let fuelLogA: string;
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const suffix = randomUUID();
    adminId = (
      await prisma.user.create({
        data: { name: "Admin", email: `att-admin-${suffix}@example.com`, passwordHash: "x", role: "ADMIN" },
      })
    ).id;
    memberId = (
      await prisma.user.create({
        data: { name: "Member", email: `att-member-${suffix}@example.com`, passwordHash: "x", role: "GENERAL" },
      })
    ).id;
    vehicleA = (await prisma.vehicle.create({ data: { name: `A ${suffix}`, apiToken: randomUUID(), createdByUserId: adminId } })).id;
    vehicleB = (await prisma.vehicle.create({ data: { name: `B ${suffix}`, apiToken: randomUUID(), createdByUserId: adminId } })).id;
    // 구성원은 A 차량에만 접근 권한이 있고, 등록자(관리 권한)는 아니다.
    await prisma.userVehicleAccess.create({ data: { userId: memberId, vehicleId: vehicleA, canViewLocation: false } });
    fuelLogA = (
      await prisma.fuelLog.create({
        data: { vehicleId: vehicleA, date: new Date(), odometer: 1, liters: 1, cost: 1, fullTank: true },
      })
    ).id;
    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN" });
    memberToken = app.jwt.sign({ sub: memberId, role: "GENERAL" });
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleA, vehicleB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  const post = (token: string, qs: string) =>
    app.inject({ method: "POST", url: `/api/attachments?${qs}`, headers: { authorization: `Bearer ${token}` } });

  it("rejects requests that name more than one parent (or none)", async () => {
    expect((await post(memberToken, `fuelLogId=${fuelLogA}&vehicleId=${vehicleB}`)).statusCode).toBe(400);
    expect((await post(memberToken, "")).statusCode).toBe(400);
  });

  it("requires manage rights and an existing vehicle for vehicle-level attachments", async () => {
    expect((await post(memberToken, `vehicleId=${vehicleA}`)).statusCode).toBe(403);
    expect((await post(memberToken, `vehicleId=${vehicleB}`)).statusCode).toBe(403);
    expect((await post(adminToken, `vehicleId=${randomUUID()}`)).statusCode).toBe(404);
  });
});
