import type { FastifyInstance } from "fastify";
import polyline from "@mapbox/polyline";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle, getVehicleAccess } from "../lib/access.js";
import { haversineKm, simplifyRouteForDisplay } from "../lib/geo.js";
import { ROUTE_START_MAX_GAP_KM } from "../jobs/trips.js";
import { parseDayRange } from "../lib/dateRange.js";

const MAX_LIMIT = 1000;

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
    const access = await getVehicleAccess(sub, role, vehicleId);
    if (!access.canAccess) {
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
      const range = parseDayRange(date);
      if (range) whereClause.startTime = range;
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

    // 위치 열람이 허용되지 않은 사용자에게는 거리·시간 같은 주행 요약은 그대로 두되
    // 좌표와 경로는 지운다 — 트립 목록의 도착지 좌표와 폴리라인만으로도 어디를 다녔는지가
    // 그대로 드러나기 때문에, 차량 상세의 좌표만 가려서는 의미가 없다.
    if (!access.canViewLocation) {
      return tripsWithFuel.map((trip) => ({
        ...trip,
        routePolyline: null,
        endLatitude: null,
        endLongitude: null,
      }));
    }

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
    const trip = await prisma.trip.findUnique({ where: { id }, select: { vehicleId: true, startTime: true } });
    if (!trip) return reply.code(404).send({ error: "trip not found" });

    const { sub, role } = request.user;
    const access = await getVehicleAccess(sub, role, trip.vehicleId);
    if (!access.canAccess) {
      return reply.code(403).send({ error: "forbidden" });
    }
    // 경로 좌표는 위치 정보 그 자체다 — 열람이 허용되지 않았으면 빈 경로로 응답한다
    // (403으로 막으면 지도 컴포넌트가 에러를 내므로, 프론트가 이미 처리하고 있는
    // "포인트 없음" 경로로 흘려보낸다).
    if (!access.canViewLocation) return [];

    const points = await prisma.telemetryRaw.findMany({
      where: { tripId: id, lat: { not: null }, lon: { not: null } },
      orderBy: { time: "asc" },
      select: { lat: true, lon: true, speed: true },
    });

    // routePolyline과 동일한 규칙(마지막 주차 위치, 5km 이내)으로 앞점을 붙인다 — 이 포인트는
    // 이전 트립(또는 트립 미배정) 소속이라 위 tripId 조회에는 절대 걸리지 않기 때문에 별도로 붙여야 한다.
    const first = points[0];
    if (first && first.lat !== null && first.lon !== null) {
      const priorPoint = await prisma.telemetryRaw.findFirst({
        where: { vehicleId: trip.vehicleId, time: { lt: trip.startTime }, lat: { not: null }, lon: { not: null } },
        orderBy: { time: "desc" },
        select: { lat: true, lon: true, speed: true },
      });
      if (
        priorPoint &&
        priorPoint.lat !== null &&
        priorPoint.lon !== null &&
        haversineKm(priorPoint.lat, priorPoint.lon, first.lat, first.lon) <= ROUTE_START_MAX_GAP_KM
      ) {
        points.unshift({ lat: priorPoint.lat, lon: priorPoint.lon, speed: priorPoint.speed });
      }
    }

    // 장거리·장시간 주행처럼 포인트가 많이 쌓인 트립만 지도 표시용으로 단순화한다 —
    // 저장된 원본은 그대로 두고, 여기서 응답할 때만 줄인다. 위 쿼리의 lat/lon not-null
    // 조건과 priorPoint의 명시적 null 체크로 이미 걸러졌으므로 단언이 안전하다.
    return simplifyRouteForDisplay(points as Array<{ lat: number; lon: number; speed: number | null }>);
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
