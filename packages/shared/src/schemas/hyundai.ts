import { z } from "zod";

// Hyundai Developers(developers.hyundai.com) 커넥티드카 API 연동 타입.
// 정확한 필드는 콘솔의 API 규격서 확인 후 조정될 수 있다 — 지금은 리뷰 단계에서
// 확인된 5개 데이터 API 카테고리(제원/운행정보/주행거리/차량상태/운전습관) 기준.

export const hyundaiVehicleSummarySchema = z.object({
  carId: z.string(),
  nickname: z.string().nullable(),
  model: z.string().nullable(),
});

export const hyundaiMileageSchema = z.object({
  odometerKm: z.number(),
  distanceToEmptyKm: z.number().nullable(),
});

export const hyundaiVehicleStatusSchema = z.object({
  lastParkedLat: z.number().nullable(),
  lastParkedLon: z.number().nullable(),
  warnings: z.array(z.string()),
});

export const hyundaiDrivingHabitSchema = z.object({
  safetyScore: z.number(),
  periodDays: z.number(),
});

export type HyundaiVehicleSummary = z.infer<typeof hyundaiVehicleSummarySchema>;
export type HyundaiMileage = z.infer<typeof hyundaiMileageSchema>;
export type HyundaiVehicleStatus = z.infer<typeof hyundaiVehicleStatusSchema>;
export type HyundaiDrivingHabit = z.infer<typeof hyundaiDrivingHabitSchema>;
