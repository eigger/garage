import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import {
  isHyundaiConfigured,
  getAuthorizeUrl,
  exchangeCodeForToken,
  revokeAccessToken,
  fetchUserProfile,
  getDataConsentUrl,
  rejectDataConsent,
  fetchLinkedVehicles,
  fetchMileage,
  fetchVehicleStatus,
  fetchDrivingHabit,
} from "../lib/hyundai.js";
import {
  getValidAccessTokenFor,
  getValidAccessTokenForUser,
  getValidAccessTokenForVehicleLink,
} from "../lib/hyundaiToken.js";

export async function hyundaiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 관리자가 /integrations에서 Client ID/Secret을 설정했는지 여부
  app.get("/configured", async () => {
    return { configured: await isHyundaiConfigured() };
  });

  // 로그인한 사용자 본인의 블루링크 계정 연동 여부 + 개인정보 제공 동의 여부
  app.get("/account", async (request) => {
    const link = await prisma.hyundaiAccountLink.findUnique({ where: { userId: request.user.sub } });
    return { linked: link !== null, consentGranted: link?.dataConsentGrantedAt !== null && link?.dataConsentGrantedAt !== undefined };
  });

  // 계정 연동 시작 — 프론트가 이 URL을 새 창/리다이렉트로 열면 현대 로그인 후
  // redirectUri(프론트의 콜백 페이지)로 code와 함께 돌아온다.
  app.get("/authorize-url", async (request, reply) => {
    const { redirectUri } = request.query as { redirectUri?: string };
    if (!redirectUri) return reply.code(400).send({ error: "redirectUri is required" });

    // TODO: state를 서버 세션/캐시에 저장해두고 콜백에서 검증(CSRF 방지) — 지금은 구조만.
    const state = request.user.sub;
    const url = await getAuthorizeUrl(redirectUri, state);
    if (!url) return reply.code(409).send({ error: "hyundai integration not configured" });
    return { url };
  });

  // 콜백 페이지(프론트)가 인가 코드를 받은 뒤 이 엔드포인트로 넘겨 토큰 교환 + 계정 연동 저장
  app.post("/link", async (request, reply) => {
    const { code, redirectUri } = request.body as { code?: string; redirectUri?: string };
    if (!code || !redirectUri) return reply.code(400).send({ error: "code and redirectUri are required" });

    const token = await exchangeCodeForToken(code, redirectUri);
    if (!token) return reply.code(502).send({ error: "hyundai token exchange failed" });

    // 웹훅(데이터 조회 불가 알림)이 계정 삭제를 이 id로 통지하므로 함께 저장해둔다.
    const profile = await fetchUserProfile(token.accessToken);

    await prisma.hyundaiAccountLink.upsert({
      where: { userId: request.user.sub },
      update: {
        hyundaiUserId: profile?.id,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        redirectUri,
        expiresAt: token.expiresAt,
      },
      create: {
        userId: request.user.sub,
        hyundaiUserId: profile?.id,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        redirectUri,
        expiresAt: token.expiresAt,
      },
    });
    return { linked: true };
  });

  // 개인정보 제3자 제공 동의 시작 — 로그인(토큰 발급)과 별개의 필수 단계.
  // 이게 없으면 /vehicles/:vehicleId/mileage 등 데이터 API가 전부 실패한다.
  app.get("/data-consent-url", async (request, reply) => {
    const link = await prisma.hyundaiAccountLink.findUnique({ where: { userId: request.user.sub } });
    if (!link) return reply.code(409).send({ error: "hyundai account not linked" });

    const accessToken = await getValidAccessTokenFor(link);
    if (!accessToken) return reply.code(409).send({ error: "hyundai account not linked" });

    const url = await getDataConsentUrl(accessToken, request.user.sub);
    return { url };
  });

  // 동의 콜백 페이지(프론트)가 리다이렉트로 받은 userId/state를 넘기면 동의 완료로 기록한다.
  app.post("/consent/complete", async (request, reply) => {
    const { state } = request.body as { userId?: string; state?: string };
    if (state !== request.user.sub) return reply.code(400).send({ error: "state mismatch" });

    const link = await prisma.hyundaiAccountLink.findUnique({ where: { userId: request.user.sub } });
    if (!link) return reply.code(409).send({ error: "hyundai account not linked" });

    await prisma.hyundaiAccountLink.update({
      where: { userId: request.user.sub },
      data: { dataConsentGrantedAt: new Date() },
    });
    return { consentGranted: true };
  });

  app.delete("/account", async (request) => {
    const link = await prisma.hyundaiAccountLink.findUnique({ where: { userId: request.user.sub } });
    if (link) {
      await rejectDataConsent(link.accessToken);
      await revokeAccessToken(link.accessToken);
      await prisma.hyundaiAccountLink.deleteMany({ where: { userId: request.user.sub } });
    }
    return { linked: false };
  });

  // 연동된 블루링크 계정에 묶인 차량 목록 — Garage 차량과 매칭할 때 선택지로 쓴다.
  app.get("/vehicles", async (request, reply) => {
    const accessToken = await getValidAccessTokenForUser(request.user.sub);
    if (!accessToken) return reply.code(409).send({ error: "hyundai account not linked" });
    return fetchLinkedVehicles(accessToken);
  });

  // 이 Garage 차량이 어느 블루링크 carId에 연결돼 있는지 — 매칭 화면에서 현재 상태 표시용
  app.get("/vehicles/:vehicleId/link", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    const link = await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } });
    return { hyundaiCarId: link?.hyundaiCarId ?? null };
  });

  // Garage 차량 ↔ 블루링크 carId 연결
  app.put("/vehicles/:vehicleId/link", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { carId } = request.body as { carId?: string };
    if (!carId) return reply.code(400).send({ error: "carId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    const accountLink = await prisma.hyundaiAccountLink.findUnique({ where: { userId: sub } });
    if (!accountLink) return reply.code(409).send({ error: "hyundai account not linked" });

    const link = await prisma.hyundaiVehicleLink.upsert({
      where: { vehicleId },
      update: { hyundaiCarId: carId, accountLinkId: accountLink.id },
      create: { vehicleId, hyundaiCarId: carId, accountLinkId: accountLink.id },
    });
    return link;
  });

  app.delete("/vehicles/:vehicleId/link", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    await prisma.hyundaiVehicleLink.deleteMany({ where: { vehicleId } });
    return reply.code(204).send();
  });

  // 연결된 차량의 데이터 조회 3종 — 각각 별도 API라 개별 엔드포인트로 노출한다.
  app.get("/vehicles/:vehicleId/mileage", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    const link = await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } });
    if (!link) return reply.code(404).send({ error: "vehicle not linked to hyundai" });

    const accessToken = await getValidAccessTokenForVehicleLink(link.accountLinkId);
    if (!accessToken) return reply.code(409).send({ error: "hyundai account not linked" });

    const mileage = await fetchMileage(accessToken, link.hyundaiCarId);
    if (!mileage) return reply.code(502).send({ error: "hyundai data api not available yet" });
    return mileage;
  });

  app.get("/vehicles/:vehicleId/status", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    const link = await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } });
    if (!link) return reply.code(404).send({ error: "vehicle not linked to hyundai" });

    const accessToken = await getValidAccessTokenForVehicleLink(link.accountLinkId);
    if (!accessToken) return reply.code(409).send({ error: "hyundai account not linked" });

    const status = await fetchVehicleStatus(accessToken, link.hyundaiCarId);
    if (!status) return reply.code(502).send({ error: "hyundai data api not available yet" });
    return status;
  });

  app.get("/vehicles/:vehicleId/driving-habit", async (request, reply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) return reply.code(403).send({ error: "forbidden" });

    const link = await prisma.hyundaiVehicleLink.findUnique({ where: { vehicleId } });
    if (!link) return reply.code(404).send({ error: "vehicle not linked to hyundai" });

    const accessToken = await getValidAccessTokenForVehicleLink(link.accountLinkId);
    if (!accessToken) return reply.code(409).send({ error: "hyundai account not linked" });

    const habit = await fetchDrivingHabit(accessToken, link.hyundaiCarId);
    if (!habit) return reply.code(502).send({ error: "hyundai data api not available yet" });
    return habit;
  });
}
