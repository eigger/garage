import type { FastifyInstance } from "fastify";
import type { MapProvider } from "@garage/shared";
import { getSetting } from "../lib/settings.js";

export async function mapProviderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/providers", async () => {
    const kakaoAppKey = await getSetting("KAKAO_MAP_APP_KEY");
    const naverClientId = await getSetting("NAVER_MAP_CLIENT_ID");
    const tmapAppKey = await getSetting("TMAP_APP_KEY");

    const providers: MapProvider[] = ["osm"];
    if (kakaoAppKey) providers.push("kakao");
    if (naverClientId) providers.push("naver");
    if (tmapAppKey) providers.push("tmap");

    return { providers, kakaoAppKey, naverClientId, tmapAppKey };
  });
}
