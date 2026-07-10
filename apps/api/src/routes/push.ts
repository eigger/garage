import type { FastifyInstance } from "fastify";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { generateAndSaveVapidKeys, getVapidPublicKey, isPushConfigured, sendPushToUser } from "../lib/push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/config", async () => ({
    configured: await isPushConfigured(),
    publicKey: await getVapidPublicKey(),
  }));

  // 관리자가 /integrations 화면에서 버튼 한 번으로 VAPID 키 쌍을 발급·저장 (수동 .env 편집·재시작 불필요)
  app.post("/vapid/generate", { preHandler: [app.authenticate, app.requireAdmin] }, async () => {
    return generateAndSaveVapidKeys();
  });

  app.get("/status", { preHandler: [app.authenticate] }, async (request) => {
    const count = await prisma.pushSubscription.count({
      where: { userId: request.user.sub },
    });
    return {
      configured: await isPushConfigured(),
      subscribed: count > 0,
      subscriptionCount: count,
    };
  });

  app.post("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!(await isPushConfigured())) {
      return reply.code(503).send({ error: "push not configured on server" });
    }

    const parsed = pushSubscribeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { endpoint, keys, locale } = parsed.data;
    const { sub } = request.user;

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (existing && existing.userId !== sub) {
      await prisma.pushSubscription.delete({ where: { endpoint } });
    }

    const row = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: sub, p256dh: keys.p256dh, auth: keys.auth, locale },
      create: { userId: sub, endpoint, p256dh: keys.p256dh, auth: keys.auth, locale },
    });

    return reply.code(201).send(row);
  });

  // 실제 운영 서버에서 VAPID 설정과 구독이 제대로 동작하는지 바로 확인할 수 있도록,
  // 새벽 배치 잡을 기다리지 않고 본인 구독으로 즉시 테스트 알림을 보낸다.
  app.post("/test", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!(await isPushConfigured())) {
      return reply.code(503).send({ error: "push not configured on server" });
    }

    const count = await prisma.pushSubscription.count({ where: { userId: request.user.sub } });
    if (count === 0) {
      return reply.code(400).send({ error: "no subscription" });
    }

    await sendPushToUser(request.user.sub, {
      title: "Garage",
      body: "테스트 알림입니다. 정상적으로 도착했다면 푸시 설정이 잘 되어 있는 것입니다.",
      url: "/profile",
    });

    return { status: "sent" };
  });

  app.delete("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = pushUnsubscribeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: parsed.data.endpoint },
    });
    if (!existing) return reply.code(204).send();
    if (existing.userId !== request.user.sub) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } });
    return reply.code(204).send();
  });
}
