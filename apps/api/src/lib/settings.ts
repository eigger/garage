import { prisma } from "./prisma.js";
import type { SettingKey } from "@garage/shared";

// 관리자 UI에서 저장한 DB 값이 있으면 그것을 쓰고, 없으면 .env(docker-compose)의
// 값으로 폴백한다 — UI 없이 컨테이너 환경변수만으로도 계속 동작하게 하기 위함.
export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row?.value) return row.value;
  return process.env[key] ?? null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
