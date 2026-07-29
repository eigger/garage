import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// /api/ingest/reminders는 HA 등 외부 서비스가 "지금 이 차가 정비가 필요한지"를
// 폴링하는 용도다. 대시보드(정비 스케줄 화면·하단 배지)는 ConsumablePart에서 매번
// 직접 계산해서 "확인함(dismiss)" 여부와 무관하게 실제로 기한이 지났으면 보여주는데,
// 예전에는 이 라우트가 Reminder.status === "PENDING"만 필터링해서, 누군가 확인함을
// 누른 항목은 실제로 정비를 안 했어도 HA에서는 사라져 버렸다(대시보드=2건, HA=1건
// 처럼 어긋남). 확인함 여부와 무관하게 항상 대시보드와 같은 건수가 나와야 한다.
describe("GET /api/ingest/reminders", () => {
  let app: FastifyInstance;
  let vehicleId: string;
  let apiToken: string;
  let dismissedPartId: string;
  let normalPartId: string;

  beforeAll(async () => {
    app = await buildApp();

    const suffix = randomUUID();
    apiToken = randomUUID();

    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken, odometer: 50000 },
    });
    vehicleId = vehicle.id;

    // 실제로 기한이 지난(overdue) 소모품 — 예전 사용자가 확인함을 눌러서
    // Reminder.status가 DISMISSED로 남아있는 상태를 재현한다.
    const dismissedPart = await prisma.consumablePart.create({
      data: {
        vehicleId,
        partType: "underCoating",
        installedDate: new Date("2020-01-01"),
        installedOdometer: 10000,
        expectedLifeKm: 20000, // dueOdometer = 30000 < 현재 50000 → 지남
      },
    });
    dismissedPartId = dismissedPart.id;

    await prisma.reminder.create({
      data: {
        vehicleId,
        consumablePartId: dismissedPart.id,
        type: "underCoating",
        dueOdometer: 30000,
        status: "DISMISSED",
        pushNotifiedAt: new Date(),
      },
    });

    // 대조군: PENDING 상태의 일반 항목(지남).
    const normalPart = await prisma.consumablePart.create({
      data: {
        vehicleId,
        partType: "engineOilFilter",
        installedDate: new Date("2020-01-01"),
        installedOdometer: 10000,
        expectedLifeKm: 20000,
      },
    });
    normalPartId = normalPart.id;

    await prisma.reminder.create({
      data: {
        vehicleId,
        consumablePartId: normalPart.id,
        type: "engineOilFilter",
        dueOdometer: 30000,
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects requests without a valid token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/ingest/reminders?token=not-a-real-token" });
    expect(res.statusCode).toBe(401);
  });

  it("still reports a dismissed reminder as due when the underlying part is genuinely overdue", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/ingest/reminders?token=${apiToken}`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as Array<{ id: string; isDue: boolean; isUpcoming: boolean }>;
    const dismissedEntry = body.find((r) => r.id === dismissedPartId);
    expect(dismissedEntry).toBeTruthy();
    expect(dismissedEntry?.isDue).toBe(true);

    const normalEntry = body.find((r) => r.id === normalPartId);
    expect(normalEntry).toBeTruthy();
    expect(normalEntry?.isDue).toBe(true);
  });
});
