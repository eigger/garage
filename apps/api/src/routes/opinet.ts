import { FastifyInstance } from "fastify";
import { getSetting } from "../lib/settings.js";
import { fetchNearbyStations, fetchStationDetail } from "../lib/opinet.js";

export async function opinetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/configured", async () => {
    const apiKey = await getSetting("OPINET_API_KEY");
    return { configured: !!apiKey };
  });

  app.get("/stations", async (request, reply) => {
    const { lat, lon, fuelType, sort } = request.query as {
      lat?: string;
      lon?: string;
      fuelType?: string;
      sort?: string;
    };

    if (!lat || !lon || !fuelType) {
      return reply.code(400).send({ error: "lat, lon, and fuelType are required" });
    }

    return fetchNearbyStations(Number(lat), Number(lon), fuelType, sort === "price" ? "price" : "distance");
  });

  // 주유소 상세(주소·좌표) — 네비 연동 및 주유 기록 저장용
  app.get("/stations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id.startsWith("MOCK_")) {
      return reply.code(404).send({ error: "mock station has no detail" });
    }

    const detail = await fetchStationDetail(id);
    if (!detail) return reply.code(404).send({ error: "station not found" });
    return detail;
  });
}
