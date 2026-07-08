import { z } from "zod";

export const fuelTypeSchema = z.enum(["GASOLINE", "DIESEL", "LPG", "ELECTRIC"]);
export type FuelType = z.infer<typeof fuelTypeSchema>;

export const vehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  vin: z.string().optional(),
  fuelType: fuelTypeSchema.optional(),
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
