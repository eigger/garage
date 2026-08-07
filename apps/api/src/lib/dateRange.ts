export type DateRange = { gte: Date; lt: Date };

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
