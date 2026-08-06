/** 순수 함수·상수 — DB/설정 의존 없음. 단위 테스트 대상. */

export const CHEONAN_CARD = {
  label: "천안사랑카드",
  konaId: 34,
  merchantType: "KB",
  bizType: "3301",
  affiliateName: "천안사랑카드",
  opinetSidoArea: "05", // 충청남도 — searchByName의 area
  opinetSigunCd: "0502", // 천안시 — areaCode.do로 검증 완료
} as const;

export const CHEONAN_CARD_PRICE_BOUNDARIES = [1, 2, 9, 12, 16, 19] as const;

export type KstBoundaryHour = (typeof CHEONAN_CARD_PRICE_BOUNDARIES)[number];

export const THROTTLE_MS = 200;
/** seed 빌드 시 좌표 매칭 임계값(m). 런타임에는 쓰지 않는다. */
export const COORD_MATCH_MAX_M = 50;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeStationName(name: string): string {
  let s = name.normalize("NFKC");
  s = s.replace(/\(주\)|\(유\)|주식회사|㈜/gi, "");
  s = s.replace(/셀프|self/gi, "");
  s = s.replace(/\([^)]*\)/g, "");
  s = s.replace(/\s+/g, "");
  // 오피넷 searchByName.do는 대소문자를 구분한다(GS≠gs, IC≠ic). 소문자화 금지.
  return s.trim();
}

/** 가격 동기화 성공률이 이 비율 이상일 때만 pricesSyncedAt을 갱신한다. */
export const PRICE_SYNC_SUCCESS_RATIO = 0.5;

export function shouldMarkPricesSynced(successCount: number, total: number): boolean {
  if (total <= 0 || successCount <= 0) return false;
  return successCount >= Math.ceil(total * PRICE_SYNC_SUCCESS_RATIO);
}

export function fuelTypeToProdCd(fuelType: string): string {
  if (fuelType === "DIESEL") return "D047";
  if (fuelType === "LPG") return "K015";
  return "B027"; // GASOLINE / HYBRID / default
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
