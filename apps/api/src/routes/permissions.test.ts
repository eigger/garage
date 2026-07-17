import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 가족 구성원별 차량 접근권한이 이 앱의 핵심 보안 경계다. 과거 리마인더 "확인함"
// 라우트에 canAccessVehicle 체크가 통째로 빠져 있던 적이 있었는데(다른 사용자
// 차량의 리마인더도 id만 알면 처리 가능했음), 그 회귀를 다시 잡을 수 있도록
// 권한 경계 자체를 라우트 레벨에서 검증한다.
describe("vehicle access permission boundaries", () => {
  let app: FastifyInstance;
  const password = "test-password-123";
  let adminId: string;
  let ownerId: string;
  let outsiderId: string;
  let vehicleId: string;
  let reminderId: string;
  let adminToken: string;
  let ownerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    app = await buildApp();

    const passwordHash = await bcrypt.hash(password, 10);
    const suffix = randomUUID();

    const admin = await prisma.user.create({
      data: { name: "Test Admin", email: `test-admin-${suffix}@example.com`, passwordHash, role: "ADMIN" },
    });
    adminId = admin.id;

    const owner = await prisma.user.create({
      data: { name: "Test Owner", email: `test-owner-${suffix}@example.com`, passwordHash, role: "GENERAL" },
    });
    ownerId = owner.id;

    const outsider = await prisma.user.create({
      data: { name: "Test Outsider", email: `test-outsider-${suffix}@example.com`, passwordHash, role: "GENERAL" },
    });
    outsiderId = outsider.id;

    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID() },
    });
    vehicleId = vehicle.id;

    await prisma.userVehicleAccess.create({
      data: { userId: ownerId, vehicleId, canViewLocation: false },
    });

    const reminder = await prisma.reminder.create({
      data: {
        vehicleId,
        type: "engineOilFilter",
        dueOdometer: 0,
        status: "PENDING",
      },
    });
    reminderId = reminder.id;

    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN" });
    ownerToken = app.jwt.sign({ sub: ownerId, role: "GENERAL" });
    outsiderToken = app.jwt.sign({ sub: outsiderId, role: "GENERAL" });
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId] } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects requests with no token", async () => {
    const res = await app.inject({ method: "GET", url: `/api/vehicles/${vehicleId}` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with a garbage token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lets the vehicle owner read their own vehicle", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(vehicleId);
  });

  it("blocks a general user with no access from reading the vehicle", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets admins read any vehicle without an explicit access grant", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("blocks a general user with no access from creating a fuel log on the vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/fuel-logs`,
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 10000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets the vehicle owner create a fuel log on their vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/vehicles/${vehicleId}/fuel-logs`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { date: new Date().toISOString(), odometer: 1000, liters: 10, cost: 10000 },
    });
    expect(res.statusCode).toBe(201);
    await prisma.fuelLog.delete({ where: { id: res.json().id } });
  });

  it("blocks dismissing a reminder for a vehicle the user cannot access (regression: dismiss previously had no access check)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/reminders/${reminderId}/dismiss`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);

    const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
    expect(reminder?.status).toBe("PENDING");
  });

  it("lets the vehicle owner dismiss a reminder for their own vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/reminders/${reminderId}/dismiss`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("DISMISSED");
  });

  it("blocks non-admins from creating a vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/vehicles",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "Should Not Be Created" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("blocks non-admins from deleting a vehicle", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/vehicles/${vehicleId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("blocks non-admins from creating other user accounts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/users",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: "New User", email: `should-not-be-created-${randomUUID()}@example.com`, password: "whatever123", role: "GENERAL" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets admins log in via the real login route and receive a working token", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("ADMIN");
  });

  it("rejects login with the wrong password", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: admin.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });
});
