import { timingSafeEqual } from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { obdIngestQuerySchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { publish } from "../lib/mqtt.js";
import { telemetryEmitter } from "../lib/telemetryEmitter.js";

// 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 길이를 맞춰 확인한다.
// 길이 자체를 비교하는 건 타이밍에 영향이 없다 — 토큰 형식(UUID) 자체는 비밀이 아니다.
function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const jsonTelemetrySchema = z.object({
  speed: z.number().nullable().optional(),
  rpm: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  fuelLevel: z.number().nullable().optional(),
  dtcCodes: z.string().nullable().optional(),
  odometer: z.number().nullable().optional(),
});

async function checkToken(vehicleId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  return !!(vehicle && vehicle.apiToken && safeTokenEqual(vehicle.apiToken, token));
}

export async function ingestRoutes(app: FastifyInstance) {
  // 1. Torque Pro 등 OBD 앱의 "Upload URL"(GET 쿼리스트링) 방식에 대응한다.
  app.get("/obd/:vehicleId", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { token } = request.query as { token?: string };

    if (!(await checkToken(vehicleId, token))) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = obdIngestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { speed, rpm, lat, lon, fuelLevel, odometer } = parsed.data;

    // OBD 주행거리 즉시 업데이트 (롤백 방지용 크기 검증 포함)
    if (odometer !== undefined && odometer !== null) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { odometer: true },
      });
      if (vehicle && odometer > vehicle.odometer) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { odometer },
        });
      }
    }

    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        source: "obd_app_get",
        speed,
        rpm,
        lat,
        lon,
        fuelLevel,
        odometer: odometer ?? null,
      },
    });

    const payload = {
      speed,
      rpm,
      lat,
      lon,
      fuelLevel,
      odometer: odometer ?? null,
      time: new Date().toISOString(),
    };

    publish(`car/${vehicleId}/telemetry`, payload);
    telemetryEmitter.emit(`telemetry:${vehicleId}`, payload);

    return { status: "ok" };
  });

  // 2. HA (Home Assistant) 또는 범용 장치 연동용 JSON POST API
  app.post("/telemetry/:vehicleId", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    
    // Authorization 헤더나 쿼리 스트링의 토큰 확인
    let token = (request.query as { token?: string }).token;
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(" ");
      if (parts[0] === "Bearer" && parts[1]) {
        token = parts[1];
      }
    }

    if (!(await checkToken(vehicleId, token))) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = jsonTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { speed, rpm, lat, lon, fuelLevel, dtcCodes, odometer } = parsed.data;

    // OBD 주행거리 즉시 업데이트 (롤백 방지용 크기 검증 포함)
    if (odometer !== undefined && odometer !== null) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { odometer: true },
      });
      if (vehicle && odometer > vehicle.odometer) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { odometer },
        });
      }
    }

    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        source: "rest_api_post",
        speed: speed ?? null,
        rpm: rpm ?? null,
        lat: lat ?? null,
        lon: lon ?? null,
        fuelLevel: fuelLevel ?? null,
        dtcCodes: dtcCodes ?? null,
        odometer: odometer ?? null,
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
      time: new Date().toISOString(),
    };

    // 실시간 웹소켓 구독 클라이언트들에게 브로드캐스팅
    telemetryEmitter.emit(`telemetry:${vehicleId}`, payload);

    return { status: "ok" };
  });

  // 3. 웹 브라우저 대시보드 / 실시간 상태 연동용 WebSocket 스트림
  app.get("/telemetry/:vehicleId/ws", { websocket: true }, async (connection, request) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { token } = request.query as { token?: string };

    // 소켓 연결 인증 확인 (차량 토큰)
    if (!(await checkToken(vehicleId, token))) {
      connection.socket.send(JSON.stringify({ error: "unauthorized" }));
      connection.socket.close();
      return;
    }

    const listener = (data: any) => {
      if (connection.socket.readyState === 1) { // OPEN state
        connection.socket.send(JSON.stringify(data));
      }
    };

    telemetryEmitter.on(`telemetry:${vehicleId}`, listener);

    connection.socket.on("close", () => {
      telemetryEmitter.off(`telemetry:${vehicleId}`, listener);
    });
  });
}
