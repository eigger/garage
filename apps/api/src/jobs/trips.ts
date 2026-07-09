import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { haversineKm, encodeRoute } from "../lib/geo.js";

// 이 간격보다 다음 포인트까지의 시간이 더 벌어지면 새 트립으로 간주한다.
// 같은 값을 "이 세그먼트가 끝났다고 확정해도 되는가"의 기준으로도 쓴다 —
// 마지막 포인트로부터 이만큼 지나야 더 이상 데이터가 이어질 걱정 없이 트립을 닫는다.
const TRIP_GAP_MINUTES = 10;
const IDLE_SPEED_THRESHOLD_KMH = 3;

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
    select: { id: true, time: true, lat: true, lon: true, speed: true, odometer: true },
  });
  if (points.length === 0) return;

  const gapMs = TRIP_GAP_MINUTES * 60 * 1000;
  const now = Date.now();

  const segments: Point[][] = [];
  let current: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i].time.getTime() - points[i - 1].time.getTime();
    if (gap > gapMs) {
      segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
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

  const routePolyline = encodeRoute(
    segment
      .filter((p): p is Point & { lat: number; lon: number } => p.lat !== null && p.lon !== null)
      .map((p) => ({ lat: p.lat, lon: p.lon })),
  );

  const trip = await prisma.$transaction(async (tx) => {
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

    return t;
  });
}

export function startTripJob(): void {
  // 서버 기동 시 한 번 정리하고, 이후 5분마다 새로 들어온 텔레메트리를 트립으로 닫는다.
  closeTrips().catch((err) => console.error("[trips] initial close failed", err));
  cron.schedule("*/5 * * * *", () => {
    closeTrips().catch((err) => console.error("[trips] scheduled close failed", err));
  });
}
