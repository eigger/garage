import type { FastifyInstance } from "fastify";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { getVapidPublicKey, isPushConfigured } from "../lib/push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/config", async () => ({
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
  }));

  app.get("/status", { preHandler: [app.authenticate] }, async (request) => {
    const count = await prisma.pushSubscription.count({
      where: { userId: request.user.sub },
    });
    return {
      configured: isPushConfigured(),
      subscribed: count > 0,
      subscriptionCount: count,
    };
  });

  app.post("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!isPushConfigured()) {
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
