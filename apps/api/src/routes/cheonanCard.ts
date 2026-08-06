import type { FastifyInstance } from "fastify";
import {
  buildStationsResponse,
  ensureFreshPrices,
  getConfigResponse,
} from "../lib/cheonanCardPrices.js";
import { CHEONAN_CARD, isCheonanCardEnabled, loadCheonanCardSeed } from "../lib/cheonanCard.js";

export async function cheonanCardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/config", async () => getConfigResponse());

  app.get("/stations", async (request, reply) => {
    if (!(await isCheonanCardEnabled())) {
      return reply.code(404).send({ error: "cheonan card feature is disabled" });
    }

    const { fuelType, lat, lon, sort, maxKm } = request.query as {
      fuelType?: string;
      lat?: string;
      lon?: string;
      sort?: string;
      maxKm?: string;
    };

    if (!fuelType) {
      return reply.code(400).send({ error: "fuelType is required" });
    }

    // HYBRID는 휘발유(B027)와 동일. ELECTRIC만 빈 목록.
    if (fuelType === "ELECTRIC") {
      const seed = loadCheonanCardSeed();
      return {
        label: CHEONAN_CARD.label,
        status: "fresh" as const,
        primaryProdCd: "B027",
        stations: [],
        unmatched: [],
        pricesSyncedAt: null,
        seedGeneratedAt: seed.generatedAt,
      };
    }

    // 갱신은 백그라운드 — 응답을 블로킹하지 않는다.
    ensureFreshPrices(app.log);

    const latNum = lat != null && lat !== "" ? Number(lat) : undefined;
    const lonNum = lon != null && lon !== "" ? Number(lon) : undefined;
    const maxKmNum = maxKm != null && maxKm !== "" ? Number(maxKm) : undefined;

    return buildStationsResponse({
      fuelType,
      lat: latNum != null && Number.isFinite(latNum) ? latNum : undefined,
      lon: lonNum != null && Number.isFinite(lonNum) ? lonNum : undefined,
      sort: sort === "distance" ? "distance" : "price",
      maxKm: maxKmNum != null && Number.isFinite(maxKmNum) ? maxKmNum : undefined,
    });
  });
}
