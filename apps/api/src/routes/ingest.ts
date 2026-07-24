import type { FastifyInstance } from "fastify";
import {
  obdIngestQuerySchema,
  jsonTelemetrySchema,
  fuelLogSchema,
  maintenanceRecordSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { publish } from "../lib/mqtt.js";
import { telemetryEmitter } from "../lib/telemetryEmitter.js";
import { syncReminders } from "../jobs/reminders.js";
import { isReminderDue } from "../jobs/pushReminders.js";
import { awardFuelLogXp, awardMaintenanceLogXp, awardEfficiencyXpIfGood } from "../lib/gamification.js";

// apiToken은 차량마다 유일(@unique)하므로 토큰 하나만으로 차량을 특정할 수 있다.
// URL에 vehicleId를 별도로 받을 필요가 없다 — 토큰이 곧 신원이자 인증 수단이다.
async function getVehicleByToken(
  token: string | undefined,
): Promise<{ id: string; odometer: number } | null> {
  if (!token) return null;
  return prisma.vehicle.findUnique({
    where: { apiToken: token },
    select: { id: true, odometer: true },
  });
}

async function getVehicleFromRequest(request: any): Promise<{ id: string; odometer: number } | null> {
  let token = (request.query as { token?: string }).token;
  if (!token && request.headers.authorization) {
    const auth = request.headers.authorization.trim();
    const parts = auth.split(" ");
    token = parts[0] === "Bearer" && parts[1] ? parts[1] : auth;
  }
  return getVehicleByToken(token);
}

async function bumpOdometerIfHigher(vehicleId: string, currentOdometer: number, odometer?: number | null) {
  if (odometer !== undefined && odometer !== null && odometer > currentOdometer) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { odometer } });
  }
}

export async function ingestRoutes(app: FastifyInstance) {
  // 1. Torque Pro 등 OBD 앱의 "Upload URL"(GET 쿼리스트링) 방식에 대응한다.
  app.get("/obd", async (request, reply) => {
    const { token } = request.query as { token?: string };
    const vehicle = await getVehicleByToken(token);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const parsed = obdIngestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { speed, rpm, lat, lon, fuelLevel, odometer, inVehicle } = parsed.data;

    await bumpOdometerIfHigher(vehicle.id, vehicle.odometer, odometer);

    await prisma.telemetryRaw.create({
      data: {
        vehicleId: vehicle.id,
        source: "obd_app_get",
        speed,
        rpm,
        lat,
        lon,
        fuelLevel,
        odometer: odometer ?? null,
        inVehicle: inVehicle ?? null,
      },
    });

    const payload = {
      speed,
      rpm,
      lat,
      lon,
      fuelLevel,
      odometer: odometer ?? null,
      inVehicle: inVehicle ?? null,
      time: new Date().toISOString(),
    };

    publish(`car/${vehicle.id}/telemetry`, payload);
    telemetryEmitter.emit(`telemetry:${vehicle.id}`, payload);

    return { status: "ok" };
  });

  // 2. HA (Home Assistant) 또는 범용 장치 연동용 JSON POST API
  app.post("/telemetry", async (request, reply) => {
    const vehicle = await getVehicleFromRequest(request);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const parsed = jsonTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { speed, rpm, lat, lon, fuelLevel, dtcCodes, odometer, inVehicle } = parsed.data;

    await bumpOdometerIfHigher(vehicle.id, vehicle.odometer, odometer);

    await prisma.telemetryRaw.create({
      data: {
        vehicleId: vehicle.id,
        source: "rest_api_post",
        speed: speed ?? null,
        rpm: rpm ?? null,
        lat: lat ?? null,
        lon: lon ?? null,
        fuelLevel: fuelLevel ?? null,
        dtcCodes: dtcCodes ?? null,
        odometer: odometer ?? null,
        inVehicle: inVehicle ?? null,
      },
    });

    const payload = {
      speed: speed ?? null,
      rpm: rpm ?? null,
      lat: lat ?? null,
      lon: lon ?? null,
      fuelLevel: fuelLevel ?? null,
      dtcCodes: dtcCodes ?? null,
      odometer: odometer ?? null,
      inVehicle: inVehicle ?? null,
      time: new Date().toISOString(),
    };

    // 실시간 웹소켓 구독 클라이언트들에게 브로드캐스팅
    telemetryEmitter.emit(`telemetry:${vehicle.id}`, payload);

    return { status: "ok" };
  });

  // 3. HA / 스크립트 연동을 위한 주유 기록 생성 API (apiToken 기반)
  app.post("/fuel-logs", async (request, reply) => {
    const vehicle = await getVehicleFromRequest(request);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const parsed = fuelLogSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      vehicleId: vehicle.id,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const fuelLog = await prisma.$transaction(async (tx) => {
      const log = await tx.fuelLog.create({
        data: parsed.data,
      });

      if (parsed.data.odometer > vehicle.odometer) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { odometer: parsed.data.odometer },
        });
      }

      return log;
    });

    await awardFuelLogXp(vehicle.id, parsed.data);
    if (parsed.data.fullTank) {
      await awardEfficiencyXpIfGood(vehicle.id);
    }

    return reply.code(201).send(fuelLog);
  });

  // 4. HA / 스크립트 연동을 위한 정비 기록 생성 API (apiToken 기반)
  app.post("/maintenance-records", async (request, reply) => {
    const vehicle = await getVehicleFromRequest(request);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const parsed = maintenanceRecordSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      vehicleId: vehicle.id,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.create({
        data: parsed.data,
      });

      await tx.consumablePart.updateMany({
        where: {
          vehicleId: vehicle.id,
          partType: parsed.data.type,
        },
        data: {
          installedDate: new Date(parsed.data.date),
          installedOdometer: parsed.data.odometer,
        },
      });

      if (parsed.data.odometer > vehicle.odometer) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { odometer: parsed.data.odometer },
        });
      }

      return rec;
    });

    await syncReminders(vehicle.id);
    await awardMaintenanceLogXp(vehicle.id, parsed.data);
    return reply.code(201).send(record);
  });

  // 5. HA 등 외부 서비스가 이 차량의 현재 상태(주행거리/연료·배터리/위치)를 폴링할 때 쓰는
  // 조회 API. GET /api/vehicles/:id(로그인 세션용)와 동일한 응답 모양을 쓰되, apiToken 하나로
  // 인증하므로 사람이 로그인할 필요가 없다 — HA REST 센서가 이 엔드포인트를 그대로 쓸 수 있다.
  app.get("/status", async (request, reply) => {
    const vehicle = await getVehicleFromRequest(request);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const [full, latestTelemetry, latestLocation] = await Promise.all([
      prisma.vehicle.findUnique({ where: { id: vehicle.id } }),
      prisma.telemetryRaw.findFirst({
        where: { vehicleId: vehicle.id, fuelLevel: { not: null } },
        orderBy: { time: "desc" },
        select: { fuelLevel: true },
      }),
      prisma.telemetryRaw.findFirst({
        where: { vehicleId: vehicle.id, lat: { not: null }, lon: { not: null } },
        orderBy: { time: "desc" },
        select: { lat: true, lon: true, speed: true, time: true },
      }),
    ]);
    if (!full) return reply.code(404).send({ error: "vehicle not found" });

    const { apiToken: _apiToken, ...safeVehicle } = full;
    return {
      ...safeVehicle,
      fuelLevel: latestTelemetry?.fuelLevel ?? null,
      latitude: latestLocation?.lat ?? null,
      longitude: latestLocation?.lon ?? null,
      locationUpdatedAt: latestLocation?.time ?? null,
      speed: latestLocation?.speed ?? null,
    };
  });

  // 6. HA 등 외부 서비스가 이 차량의 기한 지남/임박 정비 항목을 폴링할 때 쓰는 조회 API.
  app.get("/reminders", async (request, reply) => {
    const vehicle = await getVehicleFromRequest(request);
    if (!vehicle) return reply.code(401).send({ error: "unauthorized" });

    const reminders = await prisma.reminder.findMany({
      where: { vehicleId: vehicle.id, status: "PENDING" },
    });
    const currentOdometer = vehicle.odometer;
    const now = new Date();

    return reminders.map((reminder) => ({
      ...reminder,
      currentOdometer,
      isDue: isReminderDue(reminder, currentOdometer, now),
    }));
  });

  // 7. 웹 브라우저 대시보드 / 실시간 상태 연동용 WebSocket 스트림
  app.get("/telemetry/ws", { websocket: true }, async (connection, request) => {
    const { token } = request.query as { token?: string };
    const vehicle = await getVehicleByToken(token);
    if (!vehicle) {
      connection.socket.send(JSON.stringify({ error: "unauthorized" }));
      connection.socket.close();
      return;
    }

    const listener = (data: unknown) => {
      if (connection.socket.readyState === 1) {
        connection.socket.send(JSON.stringify(data));
      }
    };

    telemetryEmitter.on(`telemetry:${vehicle.id}`, listener);

    connection.socket.on("close", () => {
      telemetryEmitter.off(`telemetry:${vehicle.id}`, listener);
    });
  });
}

