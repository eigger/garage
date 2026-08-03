import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTripsForVehicle } from "./trips.js";
import { prisma } from "../lib/prisma.js";

// 실제 버그: 트립을 닫을 때 "활성" 포인트에만 tripId를 붙였기 때문에, 신호 대기(rpm 0)나
// 도착 후 시동 끈 꼬리 포인트는 영원히 미배정으로 남았다. 다음 실행에서 그 잔여 포인트들만
// 조회되면서 서로가 서로의 prev가 되고, 한참 전 포인트와 비교된 오도미터가 "증가"한 것으로
// 보여 주차 중인 포인트가 활성으로 판정 → 도착 직후 "0km 0분" 트립이 계속 생겼다.
// 잡을 여러 번 돌리는 게 재현의 핵심이라 실제 DB로 검증한다.
describe("closeTripsForVehicle — no phantom 0km trips after a real trip", () => {
  let vehicleId: string;

  beforeEach(async () => {
    const vehicle = await prisma.vehicle.create({
      data: { name: `Trip Test ${randomUUID()}`, apiToken: randomUUID() },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedCommuteWithIdleAndTailPoints() {
    // 07:21~08:00 주행(30초 간격) + 도착 후 시동 끈 상태의 꼬리 포인트 2개.
    // 중간에 신호 대기로 rpm이 0으로 떨어지고 위치/오도미터가 그대로인 포인트를 섞는다.
    const rows: Array<{
      vehicleId: string;
      time: Date;
      source: string;
      lat: number;
      lon: number;
      speed: number;
      rpm: number;
      odometer: number;
    }> = [];

    let odometer = 74970;
    let lat = 36.99;
    const start = new Date("2026-08-03T07:21:00.000Z");

    for (let i = 0; i < 78; i++) {
      const stoppedAtLight = i === 20 || i === 45;
      if (!stoppedAtLight) {
        odometer += 1;
        lat += 0.003;
      }
      rows.push({
        vehicleId,
        time: new Date(start.getTime() + i * 30_000),
        source: "rest_api_post",
        lat,
        lon: 127.1,
        speed: stoppedAtLight ? 0 : 40,
        rpm: stoppedAtLight ? 0 : 1500,
        odometer,
      });
    }

    // 도착 후: 엔진 off, 위치·오도미터 고정
    const parkedAt = new Date("2026-08-03T08:01:14.000Z");
    for (let i = 0; i < 2; i++) {
      rows.push({
        vehicleId,
        time: new Date(parkedAt.getTime() + i * 30_000),
        source: "rest_api_post",
        lat,
        lon: 127.1,
        speed: 0,
        rpm: 0,
        odometer,
      });
    }

    await prisma.telemetryRaw.createMany({ data: rows });
  }

  it("creates exactly one trip and no zero-distance trips across repeated job runs", async () => {
    await seedCommuteWithIdleAndTailPoints();

    // 잡은 5분마다 돌기 때문에, 같은 데이터로 여러 번 실행돼도 결과가 같아야 한다.
    await closeTripsForVehicle(vehicleId);
    await closeTripsForVehicle(vehicleId);
    await closeTripsForVehicle(vehicleId);

    const trips = await prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: "asc" },
    });

    expect(trips).toHaveLength(1);
    expect(trips[0].distanceKm).toBeGreaterThan(0);

    const zeroDistanceTrips = trips.filter((t) => (t.distanceKm ?? 0) === 0);
    expect(zeroDistanceTrips).toHaveLength(0);
  });

  it("leaves no unassigned points behind inside the closed trip's time range", async () => {
    await seedCommuteWithIdleAndTailPoints();

    await closeTripsForVehicle(vehicleId);
    await closeTripsForVehicle(vehicleId);

    const trip = await prisma.trip.findFirstOrThrow({ where: { vehicleId } });

    // 트립 구간 안의 비활성 포인트(신호 대기 등)까지 전부 배정돼야 잔여 포인트가 누적되지
    // 않는다 — 누적되면 다음 실행에서 다시 가짜 트립의 재료가 된다.
    const orphansInRange = await prisma.telemetryRaw.count({
      where: {
        vehicleId,
        tripId: null,
        time: { gte: trip.startTime, lte: trip.endTime! },
      },
    });
    expect(orphansInRange).toBe(0);
  });
});
