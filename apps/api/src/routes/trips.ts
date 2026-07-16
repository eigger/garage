import type { FastifyInstance } from "fastify";
import polyline from "@mapbox/polyline";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";

const MAX_LIMIT = 100;

const tripUpdateSchema = z.object({
  notes: z.string().nullable().optional(),
});

export async function tripRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId, limit, offset, search, date } = request.query as {
      vehicleId?: string;
      limit?: string;
      offset?: string;
      search?: string;
      date?: string;
    };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : 20, MAX_LIMIT);
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    const whereClause: {
      vehicleId: string;
      notes?: { contains: string; mode: "insensitive" };
      startTime?: { gte: Date; lt: Date };
    } = { vehicleId };

    if (search) {
      whereClause.notes = { contains: search, mode: "insensitive" };
    }

    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      whereClause.startTime = { gte: dayStart, lt: dayEnd };
    }

    const trips = await prisma.trip.findMany({
      where: whereClause,
      orderBy: { startTime: "desc" },
      take: parsedLimit,
      skip: parsedOffset,
    });

    const tripsWithFuel = await Promise.all(
      trips.map(async (trip) => {
        const firstPoint = await prisma.telemetryRaw.findFirst({
          where: { tripId: trip.id, fuelLevel: { not: null } },
          orderBy: { time: "asc" },
          select: { fuelLevel: true },
        });
        const lastPoint = await prisma.telemetryRaw.findFirst({
          where: { tripId: trip.id, fuelLevel: { not: null } },
          orderBy: { time: "desc" },
          select: { fuelLevel: true },
        });

        let endLatitude: number | null = null;
        let endLongitude: number | null = null;
        const lastLocationPoint = await prisma.telemetryRaw.findFirst({
          where: { tripId: trip.id, lat: { not: null }, lon: { not: null } },
          orderBy: { time: "desc" },
          select: { lat: true, lon: true },
        });
        if (lastLocationPoint) {
          endLatitude = lastLocationPoint.lat;
          endLongitude = lastLocationPoint.lon;
        } else if (trip.routePolyline) {
          const decoded = polyline.decode(trip.routePolyline);
          const last = decoded[decoded.length - 1];
          if (last) {
            endLatitude = last[0];
            endLongitude = last[1];
          }
        }

        return {
          ...trip,
          startFuelLevel: firstPoint?.fuelLevel ?? null,
          endFuelLevel: lastPoint?.fuelLevel ?? null,
          endLatitude,
          endLongitude,
        };
      })
    );

    return tripsWithFuel;
  });

  // 기간별 주행 리포트: week(최근 7일) 또는 month(최근 30일) 기준 거리·시간·트립 수 집계.
  app.get("/summary", async (request, reply) => {
    const { vehicleId, period } = request.query as { vehicleId?: string; period?: string };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const days = period === "month" ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    type TripSummaryRow = { distanceKm: number | null; startTime: Date; endTime: Date | null };

    const trips: TripSummaryRow[] = await prisma.trip.findMany({
      where: { vehicleId, startTime: { gte: since } },
      select: { distanceKm: true, startTime: true, endTime: true },
    });

    const totalDistanceKm = trips.reduce(
      (sum: number, t: TripSummaryRow) => sum + (t.distanceKm ?? 0),
      0,
    );
    const totalDurationSec = trips.reduce((sum: number, t: TripSummaryRow) => {
      if (!t.endTime) return sum;
      return sum + (t.endTime.getTime() - t.startTime.getTime()) / 1000;
    }, 0);

    return {
      period: period === "month" ? "month" : "week",
      tripCount: trips.length,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalDurationSec: Math.round(totalDurationSec),
    };
  });

  // 경로에 속도별 색상을 입히기 위한 지점별 원시 텔레메트리(위경도+속도).
  // 텔레메트리는 보존 기간(1년)이 지나면 삭제되므로, 오래된 트립은 빈 배열이 반환될 수 있다 —
  // 프론트에서 routePolyline 기반 단색 표시로 폴백해야 한다.
  app.get("/:id/points", async (request, reply) => {
    const { id } = request.params as { id: string };
    const trip = await prisma.trip.findUnique({ where: { id }, select: { vehicleId: true } });
    if (!trip) return reply.code(404).send({ error: "trip not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, trip.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return prisma.telemetryRaw.findMany({
      where: { tripId: id, lat: { not: null }, lon: { not: null } },
      orderBy: { time: "asc" },
      select: { lat: true, lon: true, speed: true },
    });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = tripUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const trip = await prisma.trip.findUnique({ where: { id }, select: { vehicleId: true } });
    if (!trip) return reply.code(404).send({ error: "trip not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, trip.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return prisma.trip.update({ where: { id }, data: parsed.data });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const trip = await prisma.trip.findUnique({ where: { id }, select: { vehicleId: true } });
    if (!trip) return reply.code(404).send({ error: "trip not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, trip.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.trip.delete({ where: { id } });
    return reply.code(204).send();
  });
}
