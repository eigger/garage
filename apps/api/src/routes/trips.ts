import type { FastifyInstance } from "fastify";
import { tripUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";

export async function tripRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId, limit, offset } = request.query as {
      vehicleId?: string;
      limit?: string;
      offset?: string;
    };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    return prisma.trip.findMany({
      where: { vehicleId },
      orderBy: { startTime: "desc" },
      take: parsedLimit,
      skip: parsedOffset,
    });
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

  // 업무용/개인용 태깅. 가족 구성원 유류비 정산 리포트의 기준이 된다.
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = tripUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.trip.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "trip not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const trip = await prisma.trip.update({ where: { id }, data: parsed.data });
    return trip;
  });
}
