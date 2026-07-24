import { FastifyInstance } from "fastify";
import type { OpinetValuePicksResponse } from "@garage/shared";
import { getSetting } from "../lib/settings.js";
import {
  computeNetGain,
  fetchLowPriceCandidates,
  fetchNearbyStations,
  fetchStationDetail,
} from "../lib/opinet.js";
import { getVehicleFuelStats } from "../lib/fuelStats.js";
import { haversineKm } from "../lib/geo.js";
import { canAccessVehicle } from "../lib/access.js";

const VALUE_PICK_CANDIDATE_COUNT = 10;
const VALUE_PICK_RESULT_LIMIT = 5;

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

  // "이득순" — 가까운 주유소 대비, 지역 최저가 후보를 왕복 기름값까지 감안한
  // 순이득 기준으로 상위 몇 곳만 추려서 돌려준다.
  app.get("/value-picks", async (request, reply) => {
    const { vehicleId, lat, lon, fuelType, address } = request.query as {
      vehicleId?: string;
      lat?: string;
      lon?: string;
      fuelType?: string;
      address?: string;
    };

    if (!vehicleId || !lat || !lon || !fuelType) {
      return reply.code(400).send({ error: "vehicleId, lat, lon, and fuelType are required" });
    }

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const latNum = Number(lat);
    const lonNum = Number(lon);

    const [{ kmPerLiter, avgLiters }, nearby, candidates] = await Promise.all([
      getVehicleFuelStats(vehicleId),
      fetchNearbyStations(latNum, lonNum, fuelType, "distance"),
      fetchLowPriceCandidates(address, fuelType, VALUE_PICK_CANDIDATE_COUNT),
    ]);

    const baselineStation = nearby[0];
    if (!baselineStation || !kmPerLiter || !avgLiters) {
      const response: OpinetValuePicksResponse = { baseline: null, insufficientData: true, picks: [] };
      return response;
    }

    const baselineDistanceKm = baselineStation.distance / 1000;
    const baseline = {
      id: baselineStation.id,
      name: baselineStation.name,
      brandLabel: baselineStation.brandLabel,
      distanceM: baselineStation.distance,
      price: baselineStation.price,
    };

    // 후보 좌표는 목록 응답에 없어 상세 조회로 보강해야 거리를 계산할 수 있다.
    const details = await Promise.all(
      candidates
        .filter((c) => c.id !== baselineStation.id && !c.id.startsWith("MOCK_"))
        .map((c) => fetchStationDetail(c.id)),
    );

    const picks = details
      .filter((d): d is NonNullable<typeof d> => d !== null && d.lat !== null && d.lon !== null)
      .map((d) => {
        const distanceKm = haversineKm(latNum, lonNum, d.lat as number, d.lon as number);
        const extraRoundTripKm = Math.max(0, distanceKm - baselineDistanceKm) * 2;
        const netGain = computeNetGain({
          baselinePrice: baselineStation.price,
          candidatePrice: d.price,
          extraRoundTripKm,
          avgLiters,
          kmPerLiter,
        });
        return {
          id: d.id,
          name: d.name,
          brandLabel: d.brandLabel,
          lat: d.lat as number,
          lon: d.lon as number,
          distanceM: Math.round(distanceKm * 1000),
          price: d.price,
          extraRoundTripKm,
          netGain: Math.round(netGain),
        };
      })
      .filter((p) => p.netGain > 0)
      .sort((a, b) => b.netGain - a.netGain)
      .slice(0, VALUE_PICK_RESULT_LIMIT);

    const response: OpinetValuePicksResponse = { baseline, insufficientData: false, picks };
    return response;
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
