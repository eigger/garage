import { randomUUID } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 현대 측이 계정 삭제/차량 삭제/동의 철회를 통지하면 개인정보보호법상 즉시 데이터를
// 지워야 한다 — 이 웹훅이 그 요구를 실제로 지키는지 검증한다. 인증 헤더 없이도
// 호출 가능해야 하므로(규격서에 인증 방식이 없음) JWT 없이 호출한다.
describe("hyundai data-unavailable webhook", () => {
  let app: FastifyInstance;
  let userId: string;
  let vehicleId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    const suffix = randomUUID();

    const user = await prisma.user.create({
      data: { name: "Test User", email: `test-hyundai-${suffix}@example.com`, passwordHash: "x", role: "GENERAL" },
    });
    userId = user.id;

    const vehicle = await prisma.vehicle.create({ data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID() } });
    vehicleId = vehicle.id;

    const accountLink = await prisma.hyundaiAccountLink.create({
      data: {
        userId,
        hyundaiUserId: `hyundai-user-${suffix}`,
        accessToken: "at",
        refreshToken: "rt",
        redirectUri: "https://example.com/callback",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    await prisma.hyundaiVehicleLink.create({
      data: { vehicleId, accountLinkId: accountLink.id, hyundaiCarId: `car-${suffix}` },
    });
  });

  afterEach(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("deletes the account link (and cascaded vehicle link) on account delete", async () => {
    const link = await prisma.hyundaiAccountLink.findUniqueOrThrow({ where: { userId } });

    const res = await app.inject({
      method: "POST",
      url: "/api/hyundai/webhook",
      payload: { type: "account", action: "delete", userId: link.hyundaiUserId },
    });
    expect(res.statusCode).toBe(200);

    expect(await prisma.hyundaiAccountLink.findUnique({ where: { userId } })).toBeNull();
    expect(await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } })).toBeNull();
  });

  it("deletes only the vehicle link on vehicle delete, leaving the account link intact", async () => {
    const link = await prisma.hyundaiVehicleLink.findUniqueOrThrow({ where: { vehicleId } });

    const res = await app.inject({
      method: "POST",
      url: "/api/hyundai/webhook",
      payload: { type: "vehicle", action: "delete", carId: link.hyundaiCarId },
    });
    expect(res.statusCode).toBe(200);

    expect(await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } })).toBeNull();
    expect(await prisma.hyundaiAccountLink.findUnique({ where: { userId } })).not.toBeNull();
  });

  it("deletes the vehicle link on a third-party-agreement rejection", async () => {
    const link = await prisma.hyundaiVehicleLink.findUniqueOrThrow({ where: { vehicleId } });

    const res = await app.inject({
      method: "POST",
      url: "/api/hyundai/webhook",
      payload: { type: "agreement", action: "reject", carId: link.hyundaiCarId },
    });
    expect(res.statusCode).toBe(200);

    expect(await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } })).toBeNull();
  });

  it("ignores unrecognized payloads without erroring", async () => {
    const res = await app.inject({ method: "POST", url: "/api/hyundai/webhook", payload: { type: "unknown" } });
    expect(res.statusCode).toBe(200);
  });
});
