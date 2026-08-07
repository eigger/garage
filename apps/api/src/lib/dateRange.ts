/** `YYYY-MM-DD` 문자열을 UTC 하루 반개구간 [start, end) 로 바꾼다. 주행 필터와 동일. */
export function parseDayRange(date: string): { gte: Date; lt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const gte = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(gte.getTime())) return null;
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}
