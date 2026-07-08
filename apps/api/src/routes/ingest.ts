import type { FastifyInstance } from "fastify";
import { obdIngestQuerySchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { publish } from "../lib/mqtt.js";

export async function ingestRoutes(app: FastifyInstance) {
  // Torque Pro 등 OBD 앱의 "Upload URL"(GET 쿼리스트링) 방식에 대응한다.
  // 2단계에서 실제 앱 연동 시 쿼리 파라미터명을 앱 설정에 맞춰 조정한다.
  app.get("/obd/:vehicleId", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return reply.code(404).send({ error: "vehicle not found" });

    const { token } = request.query as { token?: string };
    if (!vehicle.apiToken || vehicle.apiToken !== token) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = obdIngestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { speed, rpm, lat, lon, fuelLevel } = parsed.data;

    await prisma.telemetryRaw.create({
      data: {
        vehicleId,
        source: "obd_app",
        speed,
        rpm,
        lat,
        lon,
        fuelLevel,
      },
    });

    publish(`car/${vehicleId}/telemetry`, {
      speed,
      rpm,
      lat,
      lon,
      fuelLevel,
      time: new Date().toISOString(),
    });

    return { status: "ok" };
  });
}
