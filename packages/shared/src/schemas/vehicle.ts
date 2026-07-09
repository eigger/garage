import { z } from "zod";

export const fuelTypeSchema = z.enum(["GASOLINE", "DIESEL", "LPG", "ELECTRIC"]);
export type FuelType = z.infer<typeof fuelTypeSchema>;

export const vehicleSchema = z.object({
  name: z.string().min(1),
  // 프론트엔드가 빈 입력란을 저장할 때 undefined(생략)가 아니라 명시적 null(값 지우기)을
  // 보내므로, DB에서 nullable인 필드는 전부 .nullable()을 같이 줘야 한다 — 이게 빠져 있으면
  // 차량 편집 폼에서 빈 필드가 하나라도 있을 때 항상 400으로 저장이 실패한다.
  plate: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  vin: z.string().nullable().optional(),
  fuelType: fuelTypeSchema.optional(),
  tireSize: z.string().nullable().optional(),
  batteryCapacity: z.string().nullable().optional(),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const vehicleUpdateSchema = vehicleSchema.partial();
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

export const vehicleAccessSchema = z.object({
  canViewLocation: z.boolean().default(false),
});
export type VehicleAccessInput = z.infer<typeof vehicleAccessSchema>;

export const maintenancePresetTemplateSchema = z.object({
  fuelType: fuelTypeSchema,
  name: z.string().min(1),
  intervalKm: z.number().int().positive().optional(),
  intervalMonths: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});
export type MaintenancePresetTemplateInput = z.infer<typeof maintenancePresetTemplateSchema>;

export const maintenancePresetTemplateUpdateSchema = maintenancePresetTemplateSchema
  .omit({ fuelType: true })
  .partial();
export type MaintenancePresetTemplateUpdateInput = z.infer<
  typeof maintenancePresetTemplateUpdateSchema
>;
