import { FastifyInstance } from "fastify";
import { getSetting } from "../lib/settings.js";
import { fetchNearbyChargers } from "../lib/evCharger.js";

export async function evChargerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/configured", async () => {
    const apiKey = await getSetting("EV_CHARGER_API_KEY");
    return { configured: !!apiKey };
  });

  app.get("/stations", async (request, reply) => {
    const { lat, lon, address } = request.query as {
      lat?: string;
      lon?: string;
      address?: string;
    };

    if (!lat || !lon) {
      return reply.code(400).send({ error: "lat and lon are required" });
    }

    return fetchNearbyChargers(Number(lat), Number(lon), address);
  });
}
