import type { FastifyInstance } from "fastify";
import { settingKeySchema, settingUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { setSetting } from "../lib/settings.js";

function mask(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  // 연동 관리 화면 목록 조회 — 실제 키 값은 절대 내려주지 않고 마스킹된 형태와
  // 출처(관리 화면에서 저장 vs .env 폴백)만 알려준다.
  app.get("/", async () => {
    const keys = settingKeySchema.options;
    const rows = await prisma.setting.findMany({ where: { key: { in: keys as unknown as string[] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    return keys.map((key) => {
      const dbValue = byKey.get(key);
      if (dbValue) return { key, configured: true, source: "db" as const, masked: mask(dbValue) };

      const envValue = process.env[key];
      if (envValue) return { key, configured: true, source: "env" as const, masked: mask(envValue) };

      return { key, configured: false, source: "none" as const, masked: null };
    });
  });

  app.put("/:key", async (request, reply) => {
    const keyParsed = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!keyParsed.success) return reply.code(400).send({ error: "unknown setting key" });

    const bodyParsed = settingUpdateSchema.safeParse(request.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });

    await setSetting(keyParsed.data, bodyParsed.data.value.trim());
    return { key: keyParsed.data, configured: true };
  });

  app.delete("/:key", async (request, reply) => {
    const keyParsed = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!keyParsed.success) return reply.code(400).send({ error: "unknown setting key" });

    await prisma.setting.deleteMany({ where: { key: keyParsed.data } });
    return reply.code(204).send();
  });
}
