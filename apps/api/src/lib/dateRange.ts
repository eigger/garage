export type DateRange = { gte: Date; lt: Date };

/**
 * Asia/Seoul 캘린더 기준 오늘을 UTC 자정 Date로 만든다.
 * date-only 필드(installedDate 등)는 클라이언트가 `YYYY-MM-DD`를 보내면
 * `T00:00:00.000Z`로 저장되므로, 서버에서 "오늘"을 넣을 때도 같은 규칙을 쓴다.
 * Docker 등 TZ=UTC 환경에서도 KST 날짜가 어긋나지 않는다.
 */
export function todayDateOnly(now: Date = new Date(), timeZone = "Asia/Seoul"): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` 문자열을 UTC 하루 반개구간 [start, end) 로 바꾼다. */
export function parseDayRange(date: string): DateRange | null {
  return parsePeriodRange(date);
}

/**
 * 기간 문자열을 UTC 반개구간 [start, end) 로 바꾼다.
 * - `YYYY` → 해당 연도
 * - `YYYY-MM` → 해당 월
 * - `YYYY-MM-DD` → 해당 일
 */
export function parsePeriodRange(period: string): DateRange | null {
  if (/^\d{4}$/.test(period)) {
    const year = Number(period);
    return {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) return null;
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const gte = new Date(`${period}T00:00:00.000Z`);
    if (Number.isNaN(gte.getTime())) return null;
    // 캘린더상 유효한 날짜인지 확인 (2026-02-31 같은 값 거부)
    if (gte.toISOString().slice(0, 10) !== period) return null;
    return {
      gte,
      lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  return null;
}

/** `period`를 우선하고, 없으면 레거시 `date`(하루)를 쓴다. */
export function periodRangeFromQuery(query: {
  period?: string;
  date?: string;
}): DateRange | null {
  const raw = query.period || query.date;
  if (!raw) return null;
  return parsePeriodRange(raw);
}
