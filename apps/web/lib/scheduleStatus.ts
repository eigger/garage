import type { ConsumablePart } from "./types";

export type ScheduleStatus = "due" | "upcoming" | "ok";

const UPCOMING_KM_THRESHOLD = 1000;
const UPCOMING_DAY_THRESHOLD = 30;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// 스케줄 항목 하나의 지남/임박/정상 상태를 계산한다. 대시보드·차량 개요·정비 스케줄
// 화면이 전부 이 함수를 통해서만 판단해야 세 화면의 지남/임박 건수가 항상 일치한다.
export function computeScheduleStatus(
  part: Pick<ConsumablePart, "installedDate" | "installedOdometer" | "expectedLifeKm" | "expectedLifeMonths">,
  currentOdometer: number,
): { status: ScheduleStatus; remainingKm: number | null; dueDate: Date | null } {
  const dueOdometer = part.expectedLifeKm ? part.installedOdometer + part.expectedLifeKm : null;
  const dueDate = part.expectedLifeMonths
    ? addMonths(new Date(part.installedDate), part.expectedLifeMonths)
    : null;

  const remainingKm = dueOdometer !== null ? dueOdometer - currentOdometer : null;
  const remainingDays = dueDate !== null ? (dueDate.getTime() - Date.now()) / 86400000 : null;

  const isDue = (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
  const isUpcoming =
    !isDue &&
    ((remainingKm !== null && remainingKm <= UPCOMING_KM_THRESHOLD) ||
      (remainingDays !== null && remainingDays <= UPCOMING_DAY_THRESHOLD));

  return {
    status: isDue ? "due" : isUpcoming ? "upcoming" : "ok",
    remainingKm,
    dueDate,
  };
}

export function countScheduleStatuses(
  parts: Pick<ConsumablePart, "installedDate" | "installedOdometer" | "expectedLifeKm" | "expectedLifeMonths">[],
  currentOdometer: number,
): { due: number; upcoming: number } {
  let due = 0;
  let upcoming = 0;
  for (const part of parts) {
    const { status } = computeScheduleStatus(part, currentOdometer);
    if (status === "due") due++;
    else if (status === "upcoming") upcoming++;
  }
  return { due, upcoming };
}
