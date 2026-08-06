import type { FastifyInstance } from "fastify";
import { settingKeySchema, settingUpdateSchema, type SettingKey } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { setSetting } from "../lib/settings.js";
import { triggerCheonanCardWarmup } from "../lib/cheonanCardPrices.js";

function mask(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

const PLAIN_VALUE_KEYS = new Set<string>(["EV_CHARGER_API_KEY_EXPIRES_AT", "CHEONAN_CARD_ENABLED"]);
const SETTING_KEYS = [...settingKeySchema.options] as SettingKey[];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  // 연동 관리 화면 목록 조회 — 실제 키 값은 절대 내려주지 않고 마스킹된 형태와
  // 출처(관리 화면에서 저장 vs .env 폴백)만 알려준다.
  app.get("/", async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    // 만료일·기능 토글은 비밀값이 아니라 UI에 원문이 필요해서 평문으로 내려준다.
    const isPlainValueKey = (key: string) => PLAIN_VALUE_KEYS.has(key);

    return SETTING_KEYS.map((key) => {
      const dbValue = byKey.get(key);
      if (dbValue) {
        return {
          key,
          configured: true,
          source: "db" as const,
          masked: mask(dbValue),
          value: isPlainValueKey(key) ? dbValue : undefined,
        };
      }

      const envValue = process.env[key];
      if (envValue) {
        return {
          key,
          configured: true,
          source: "env" as const,
          masked: mask(envValue),
          value: isPlainValueKey(key) ? envValue : undefined,
        };
      }

      return { key, configured: false, source: "none" as const, masked: null, value: undefined };
    });
  });

  app.put("/:key", async (request, reply) => {
    const keyParsed = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!keyParsed.success) return reply.code(400).send({ error: "unknown setting key" });

    const bodyParsed = settingUpdateSchema.safeParse(request.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });

    const key = keyParsed.data;
    const value = bodyParsed.data.value.trim();
    await setSetting(key, value);

    // 천안사랑카드를 켜는 순간 백그라운드 워밍업(응답 블로킹 없음)
    if (key === "CHEONAN_CARD_ENABLED" && value === "true") {
      triggerCheonanCardWarmup(app.log);
    }

    return { key, configured: true };
  });

  app.delete("/:key", async (request, reply) => {
    const keyParsed = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!keyParsed.success) return reply.code(400).send({ error: "unknown setting key" });

    await prisma.setting.deleteMany({ where: { key: keyParsed.data } });
    return reply.code(204).send();
  });
}
