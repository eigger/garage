// 정비/소모품 스케줄 항목 하나의 지남(due)/임박(upcoming)/정상(ok) 상태를 판단하는
// 공통 로직. apps/web(대시보드·차량 개요·정비 스케줄 화면)과 apps/api(외부 연동용
// /api/ingest/reminders)가 반드시 이 함수 하나로만 판단해야, 화면에 보이는 지난/임박
// 건수와 외부로 노출되는 건수가 항상 일치한다.

export type ScheduleStatus = "due" | "upcoming" | "ok";

export const UPCOMING_KM_THRESHOLD = 1000;
export const UPCOMING_DAY_THRESHOLD = 30;

export function resolveScheduleStatus(
  dueDate: Date | null,
  dueOdometer: number | null,
  currentOdometer: number,
  now: Date = new Date(),
): { status: ScheduleStatus; remainingKm: number | null; remainingDays: number | null } {
  const remainingKm = dueOdometer !== null ? dueOdometer - currentOdometer : null;
  const remainingDays = dueDate !== null ? (dueDate.getTime() - now.getTime()) / 86400000 : null;

  const isDue = (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
  const isUpcoming =
    !isDue &&
    ((remainingKm !== null && remainingKm <= UPCOMING_KM_THRESHOLD) ||
      (remainingDays !== null && remainingDays <= UPCOMING_DAY_THRESHOLD));

  return {
    status: isDue ? "due" : isUpcoming ? "upcoming" : "ok",
    remainingKm,
    remainingDays,
  };
}

export interface ScheduleBaseline {
  installedDate: Date | string;
  installedOdometer: number;
  expectedLifeKm: number | null;
  expectedLifeMonths: number | null;
}

// installedDate/installedOdometer + expectedLifeKm/expectedLifeMonths로부터 다음
// 기준점(dueDate/dueOdometer)을 계산한다. apps/web(computeScheduleStatus)과
// apps/api(reminders 동기화 잡, /api/ingest/reminders)가 전부 이 함수로만 계산해야
// 셋이 어긋나지 않는다.
export function computeDueBaseline(
  part: ScheduleBaseline,
): { dueDate: Date | null; dueOdometer: number | null } {
  const dueOdometer = part.expectedLifeKm ? part.installedOdometer + part.expectedLifeKm : null;

  let dueDate: Date | null = null;
  if (part.expectedLifeMonths) {
    dueDate = new Date(part.installedDate);
    dueDate.setMonth(dueDate.getMonth() + part.expectedLifeMonths);
  }

  return { dueDate, dueOdometer };
}
