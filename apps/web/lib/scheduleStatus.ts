import { computeDueBaseline, resolveScheduleStatus, type ScheduleStatus } from "@garage/shared";
import type { ConsumablePart } from "./types";

export type { ScheduleStatus };

// 스케줄 항목 하나의 지남/임박/정상 상태를 계산한다. 대시보드·차량 개요·정비 스케줄
// 화면이 전부 이 함수를 통해서만 판단해야 세 화면의 지남/임박 건수가 항상 일치한다.
// 실제 판단 로직은 @garage/shared의 resolveScheduleStatus/computeDueBaseline — apps/api의
// /api/ingest/reminders도 같은 함수를 써서 외부 연동 건수도 일치한다.
export function computeScheduleStatus(
  part: Pick<ConsumablePart, "installedDate" | "installedOdometer" | "expectedLifeKm" | "expectedLifeMonths">,
  currentOdometer: number,
): { status: ScheduleStatus; remainingKm: number | null; dueDate: Date | null } {
  const { dueDate, dueOdometer } = computeDueBaseline(part);
  const { status, remainingKm } = resolveScheduleStatus(dueDate, dueOdometer, currentOdometer);

  return { status, remainingKm, dueDate };
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
