import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// PR #40 prepended the last known parked position to the *stored* routePolyline,
// but the map actually renders /api/trips/:id/points, which only queries
// telemetryRaw scoped to the trip's own tripId — so the prepended point (which
// belongs to the previous trip) never showed up on screen. These tests hit the
// real route to prove the endpoint itself now returns the connecting point,
// not just the DB column.
describe("GET /api/trips/:id/points — last-known-location connect", () => {
  let app: FastifyInstance;
  let vehicleId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();

    const suffix = randomUUID();
    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID() },
    });
    vehicleId = vehicle.id;

    const user = await prisma.user.create({
      data: { name: "Test Owner", email: `test-owner-${suffix}@example.com`, passwordHash: "x", role: "ADMIN" },
    });
    userId = user.id;
    token = app.jwt.sign({ sub: userId, role: "ADMIN" });
  });

  afterAll(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  it("prepends the prior trip's last position when it's within the 5km cap", async () => {
    const priorTrip = await prisma.trip.create({
      data: { vehicleId, startTime: new Date("2026-07-22T09:10:00Z"), endTime: new Date("2026-07-22T10:13:00Z") },
    });
    // last recorded point of the previous trip — the "last parked location"
    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        tripId: priorTrip.id,
        time: new Date("2026-07-22T21:58:10Z"),
        source: "test",
        lat: 36.9978697,
        lon: 127.0824356,
        speed: 0,
      },
    });

    const thisTrip = await prisma.trip.create({
      data: { vehicleId, startTime: new Date("2026-07-22T21:58:13Z") },
    });
    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        tripId: thisTrip.id,
        time: new Date("2026-07-22T21:58:13Z"),
        source: "test",
        lat: 36.9969036,
        lon: 127.0816549,
        speed: 22,
      },
    });
    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        tripId: thisTrip.id,
        time: new Date("2026-07-22T22:08:08Z"),
        source: "test",
        lat: 36.9625112,
        lon: 127.1240202,
        speed: 24,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/trips/${thisTrip.id}/points`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const points = res.json();

    expect(points.length).toBe(3);
    expect(points[0].lat).toBeCloseTo(36.9978697, 5);
    expect(points[0].lon).toBeCloseTo(127.0824356, 5);
    expect(points[1].lat).toBeCloseTo(36.9969036, 5);
    expect(points[2].lat).toBeCloseTo(36.9625112, 5);
  });

  it("does not prepend when the prior point is beyond the 5km cap", async () => {
    const farVehicle = await prisma.vehicle.create({
      data: { name: `Far Vehicle ${randomUUID()}`, apiToken: randomUUID() },
    });
    try {
      const priorTrip = await prisma.trip.create({
        data: { vehicleId: farVehicle.id, startTime: new Date("2026-07-22T09:00:00Z"), endTime: new Date("2026-07-22T10:00:00Z") },
      });
      // ~30km away from where the next trip starts
      await prisma.telemetryRaw.create({
        data: {
          vehicleId: farVehicle.id,
          tripId: priorTrip.id,
          time: new Date("2026-07-22T10:00:00Z"),
          source: "test",
          lat: 36.83,
          lon: 127.11,
          speed: 0,
        },
      });

      const thisTrip = await prisma.trip.create({
        data: { vehicleId: farVehicle.id, startTime: new Date("2026-07-22T21:58:13Z") },
      });
      await prisma.telemetryRaw.create({
        data: {
          vehicleId: farVehicle.id,
          tripId: thisTrip.id,
          time: new Date("2026-07-22T21:58:13Z"),
          source: "test",
          lat: 36.9969036,
          lon: 127.0816549,
          speed: 22,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/trips/${thisTrip.id}/points`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const points = res.json();

      expect(points.length).toBe(1);
      expect(points[0].lat).toBeCloseTo(36.9969036, 5);
    } finally {
      await prisma.vehicle.delete({ where: { id: farVehicle.id } }).catch(() => {});
    }
  });
});
