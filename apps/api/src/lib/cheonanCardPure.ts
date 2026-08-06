/** 순수 함수·상수 — DB/설정 의존 없음. 단위 테스트 대상. */

export const CHEONAN_CARD = {
  label: "천안사랑카드",
  konaId: 34,
  merchantType: "KB",
  bizType: "3301",
  affiliateName: "천안사랑카드",
  opinetSidoArea: "05",
  // areaCode.do로 확정 전 — 비어 있으면 주소에 "천안" 포함 여부로 대체 판정한다.
  opinetSigunCds: [] as string[],
} as const;

export const CHEONAN_CARD_PRICE_BOUNDARIES = [1, 2, 9, 12, 16, 19] as const;

export type KstBoundaryHour = (typeof CHEONAN_CARD_PRICE_BOUNDARIES)[number];

const MERCHANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const THROTTLE_MS = 200;
export const NAME_MATCH_MAX_M = 500;
export const COORD_MATCH_MAX_M = 150;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeStationName(name: string): string {
  let s = name.normalize("NFKC");
  s = s.replace(/\(주\)|\(유\)|주식회사|㈜/gi, "");
  s = s.replace(/셀프|self/gi, "");
  s = s.replace(/\([^)]*\)/g, "");
  s = s.replace(/\s+/g, "");
  s = s.toLowerCase();
  return s.trim();
}

export function fuelTypeToProdCd(fuelType: string): string {
  if (fuelType === "DIESEL") return "D047";
  if (fuelType === "LPG") return "K015";
  return "B027"; // GASOLINE / HYBRID / default
}

export function merchantTtlExpired(syncedAt: Date | null | undefined, now = new Date()): boolean {
  if (!syncedAt) return true;
  return now.getTime() - syncedAt.getTime() > MERCHANT_TTL_MS;
}

/** KST 벽시계 시각의 시(0–23)를 반환. TZ=UTC 환경에서도 안전. */
export function getKstHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return Number(hour);
}

/** now 이전의 가장 최근 오피넷 가격 게시 경계(KST). */
export function lastPublishBoundary(
  now: Date,
  boundaries: readonly number[] = CHEONAN_CARD_PRICE_BOUNDARIES,
): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);

  const sorted = [...boundaries].sort((a, b) => a - b);
  let boundaryHour: number;
  let dayOffset = 0;
  const prev = sorted.filter((b) => b <= h);
  if (prev.length > 0) {
    boundaryHour = prev[prev.length - 1];
  } else {
    boundaryHour = sorted[sorted.length - 1];
    dayOffset = -1;
  }

  // KST wall clock → UTC Date
  const utcMs = Date.UTC(y, mo - 1, d + dayOffset, boundaryHour - 9, 0, 0);
  return new Date(utcMs);
}

export function isPriceCacheStale(syncedAt: Date | null | undefined, now = new Date()): boolean {
  if (!syncedAt) return true;
  return syncedAt.getTime() < lastPublishBoundary(now).getTime();
}
