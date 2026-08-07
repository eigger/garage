import { prisma } from "./prisma.js";

export type HistoryPeriodScope = "trips" | "fuel" | "maintenance";

export type HistoryPeriods = {
  years: string[];
  months: string[];
  days: string[];
};

/**
 * 차량별 기록에서 실제 데이터가 있는 연도(YYYY)·월(YYYY-MM)·일(YYYY-MM-DD) 목록을 모은다.
 * 기간 필터 UI가 빈 기간을 나열하지 않도록 서버에서 집계한다.
 *
 * 날짜 컬럼은 timestamp(3) without time zone에 UTC 벽시계 값으로 저장된다.
 * parsePeriodRange가 UTC 경계로 조회하므로 여기서도 변환 없이 그대로 잘라야 버킷이 어긋나지 않는다.
 */
export async function listHistoryPeriods(
  vehicleId: string,
  scope: HistoryPeriodScope,
): Promise<HistoryPeriods> {
  let rows: Array<{ day: string }> = [];

  if (scope === "trips") {
    rows = await prisma.$queryRaw<Array<{ day: string }>>`
      SELECT DISTINCT to_char("startTime", 'YYYY-MM-DD') AS day
      FROM "Trip"
      WHERE "vehicleId" = ${vehicleId}
      ORDER BY day DESC
    `;
  } else if (scope === "fuel") {
    rows = await prisma.$queryRaw<Array<{ day: string }>>`
      SELECT DISTINCT to_char("date", 'YYYY-MM-DD') AS day
      FROM "FuelLog"
      WHERE "vehicleId" = ${vehicleId}
      ORDER BY day DESC
    `;
  } else {
    rows = await prisma.$queryRaw<Array<{ day: string }>>`
      SELECT DISTINCT to_char("date", 'YYYY-MM-DD') AS day
      FROM "MaintenanceRecord"
      WHERE "vehicleId" = ${vehicleId}
      ORDER BY day DESC
    `;
  }

  const days = rows.map((r) => r.day).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const months = [...new Set(days.map((day) => day.slice(0, 7)))];
  const years = [...new Set(months.map((ym) => ym.slice(0, 4)))];
  return { years, months, days };
}
