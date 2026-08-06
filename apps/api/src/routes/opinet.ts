import { FastifyInstance } from "fastify";
import type { OpinetValuePicksResponse } from "@garage/shared";
import { getSetting } from "../lib/settings.js";
import {
  attachAllFuelPrices,
  computeNetGain,
  fetchLowPriceCandidates,
  fetchNearbyStations,
  fetchStationDetail,
  fetchStationPrices,
  FUEL_CODE_MAP,
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

    const stations = await fetchNearbyStations(
      Number(lat),
      Number(lon),
      fuelType,
      sort === "price" ? "price" : "distance",
    );
    return attachAllFuelPrices(stations, fuelType);
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
    const primaryProdCd = FUEL_CODE_MAP[fuelType] ?? "B027";

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

    // lowTop10 응답에 좌표·주소가 포함되므로 detailById 추가 호출 없이 이득을 계산한다.
    const rawPicks = candidates
      .filter((c) => c.id !== baselineStation.id && !c.id.startsWith("MOCK_") && c.lat !== null && c.lon !== null)
      .map((c) => {
        const distanceKm = haversineKm(latNum, lonNum, c.lat as number, c.lon as number);
        const extraRoundTripKm = Math.max(0, distanceKm - baselineDistanceKm) * 2;
        const netGain = computeNetGain({
          baselinePrice: baselineStation.price,
          candidatePrice: c.price,
          extraRoundTripKm,
          avgLiters,
          kmPerLiter,
        });
        return {
          id: c.id,
          name: c.name,
          brandLabel: c.brandLabel,
          lat: c.lat as number,
          lon: c.lon as number,
          distanceM: Math.round(distanceKm * 1000),
          price: c.price,
          primaryProdCd,
          prices: [{ prodCd: primaryProdCd, price: c.price }],
          extraRoundTripKm,
          netGain: Math.round(netGain),
        };
      })
      .filter((p) => p.netGain > 0)
      .sort((a, b) => b.netGain - a.netGain)
      .slice(0, VALUE_PICK_RESULT_LIMIT);

    const picks = await Promise.all(
      rawPicks.map(async (pick) => {
        const fetched = await fetchStationPrices(pick.id);
        if (!fetched?.length) return pick;
        const prices = fetched.map((p) => ({ prodCd: p.prodCd, price: p.price }));
        const primary = prices.find((p) => p.prodCd === primaryProdCd);
        return {
          ...pick,
          price: primary?.price ?? pick.price,
          prices,
        };
      }),
    );

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
