import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { haversineKm, encodeRoute } from "../lib/geo.js";
import { isActivePoint, type TripDetectionPoint } from "../lib/tripDetection.js";

// 이 간격보다 다음 포인트까지의 시간이 더 벌어지면 새 트립으로 간주한다.
// 같은 값을 "이 세그먼트가 끝났다고 확정해도 되는가"의 기준으로도 쓴다 —
// 마지막 포인트로부터 이만큼 지나야 더 이상 데이터가 이어질 걱정 없이 트립을 닫는다.
const TRIP_GAP_MINUTES = 10;
const IDLE_SPEED_THRESHOLD_KMH = 3;
// 시동을 켜도 기기가 와이파이/데이터에 실제로 붙기까지 시간이 걸려서, 트립의 첫
// 텔레메트리 포인트가 이미 주행 중인 지점부터 잡히는 경우가 흔하다. 지도 경로만
// 직전에 기록된 위치(보통 마지막 주차 지점)에서 이어지도록 보정하되, 그 지점이
// 너무 멀면(비정상 데이터/차량 이동 등) 오히려 이상한 직선이 그어지므로 상한을 둔다.
const ROUTE_START_MAX_GAP_KM = 5;

type Point = {
  id: bigint;
  time: Date;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  odometer: number | null;
};

export async function closeTrips(): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true } });
  for (const vehicle of vehicles) {
    await closeTripsForVehicle(vehicle.id);
  }
}

async function closeTripsForVehicle(vehicleId: string): Promise<void> {
  const points = await prisma.telemetryRaw.findMany({
    where: { vehicleId, tripId: null, lat: { not: null }, lon: { not: null } },
    orderBy: { time: "asc" },
    select: {
      id: true,
      time: true,
      lat: true,
      lon: true,
      speed: true,
      odometer: true,
      rpm: true,
      source: true,
      inVehicle: true,
    },
  });
  if (points.length === 0) return;

  const activePoints: Point[] = [];
  let prev: TripDetectionPoint | null = null;
  for (const p of points) {
    const detection: TripDetectionPoint = {
      lat: p.lat,
      lon: p.lon,
      speed: p.speed,
      rpm: p.rpm,
      odometer: p.odometer,
      source: p.source,
      inVehicle: p.inVehicle,
    };
    if (isActivePoint(detection, prev)) {
      activePoints.push(p);
    }
    prev = detection;
  }

  if (activePoints.length === 0) return;

  const gapMs = TRIP_GAP_MINUTES * 60 * 1000;
  const now = Date.now();

  const segments: Point[][] = [];
  let current: Point[] = [activePoints[0]];
  for (let i = 1; i < activePoints.length; i++) {
    const gap = activePoints[i].time.getTime() - activePoints[i - 1].time.getTime();
    if (gap > gapMs) {
      segments.push(current);
      current = [activePoints[i]];
    } else {
      current.push(activePoints[i]);
    }
  }
  segments.push(current);

  for (const segment of segments) {
    const last = segment[segment.length - 1];
    const isStale = now - last.time.getTime() > gapMs;
    // 아직 새 포인트가 이어질 수 있는 마지막 세그먼트는 다음 실행 때 다시 판단한다.
    if (!isStale) continue;

    await finalizeSegment(vehicleId, segment);
  }
}

async function finalizeSegment(vehicleId: string, segment: Point[]): Promise<void> {
  let distanceKm = 0;
  let idleTimeSec = 0;
  const speeds: number[] = [];

  for (let i = 1; i < segment.length; i++) {
    const prev = segment[i - 1];
    const cur = segment[i];
    if (prev.lat !== null && prev.lon !== null && cur.lat !== null && cur.lon !== null) {
      distanceKm += haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
    }

    const deltaSec = (cur.time.getTime() - prev.time.getTime()) / 1000;
    if (prev.speed !== null && cur.speed !== null) {
      const avgSpeed = (prev.speed + cur.speed) / 2;
      if (avgSpeed < IDLE_SPEED_THRESHOLD_KMH) idleTimeSec += deltaSec;
    }
  }
  for (const p of segment) {
    if (p.speed !== null) speeds.push(p.speed);
  }
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

  // 텔레메트리 내에 기록된 계기판 주행거리 정보가 있다면 그 차이를 총 운행 거리로 사용
  let finalDistance = distanceKm;
  const odometerPoints = segment.filter((p): p is Point & { odometer: number } => p.odometer !== null && p.odometer > 0);
  if (odometerPoints.length >= 2) {
    const firstOdo = odometerPoints[0].odometer;
    const lastOdo = odometerPoints[odometerPoints.length - 1].odometer;
    const diff = lastOdo - firstOdo;
    if (diff >= 0) {
      finalDistance = diff;
    }
  }

  const routePoints = segment
    .filter((p): p is Point & { lat: number; lon: number } => p.lat !== null && p.lon !== null)
    .map((p) => ({ lat: p.lat, lon: p.lon }));

  const priorPoint = await prisma.telemetryRaw.findFirst({
    where: { vehicleId, time: { lt: segment[0].time }, lat: { not: null }, lon: { not: null } },
    orderBy: { time: "desc" },
    select: { lat: true, lon: true },
  });

  if (
    priorPoint &&
    priorPoint.lat !== null &&
    priorPoint.lon !== null &&
    routePoints.length > 0 &&
    haversineKm(priorPoint.lat, priorPoint.lon, routePoints[0].lat, routePoints[0].lon) <= ROUTE_START_MAX_GAP_KM
  ) {
    routePoints.unshift({ lat: priorPoint.lat, lon: priorPoint.lon });
  }

  const routePolyline = encodeRoute(routePoints);

  await prisma.$transaction(async (tx) => {
    const t = await tx.trip.create({
      data: {
        vehicleId,
        startTime: segment[0].time,
        endTime: segment[segment.length - 1].time,
        distanceKm: Math.round(finalDistance * 100) / 100,
        avgSpeed: avgSpeed !== null ? Math.round(avgSpeed * 10) / 10 : null,
        idleTimeSec: Math.round(idleTimeSec),
        routePolyline,
      },
    });

    await tx.telemetryRaw.updateMany({
      where: { id: { in: segment.map((p) => p.id) } },
      data: { tripId: t.id },
    });
  });
}

export function startTripJob(): void {
  // 서버 기동 시 한 번 정리하고, 이후 5분마다 새로 들어온 텔레메트리를 트립으로 닫는다.
  closeTrips().catch((err) => console.error("[trips] initial close failed", err));
  cron.schedule("*/5 * * * *", () => {
    closeTrips().catch((err) => console.error("[trips] scheduled close failed", err));
  });
}
