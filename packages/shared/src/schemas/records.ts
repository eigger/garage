import { z } from "zod";

export const fuelLogSchema = z.object({
  vehicleId: z.string(),
  date: z.coerce.date(),
  odometer: z.number().int().nonnegative(),
  liters: z.number().positive(),
  cost: z.number().int().nonnegative(),
  fullTank: z.boolean().default(true),
  location: z.string().optional(),
});
export type FuelLogInput = z.infer<typeof fuelLogSchema>;
export const fuelLogUpdateSchema = fuelLogSchema.omit({ vehicleId: true }).partial();
export type FuelLogUpdateInput = z.infer<typeof fuelLogUpdateSchema>;

export const maintenanceRecordSchema = z.object({
  vehicleId: z.string(),
  date: z.coerce.date(),
  odometer: z.number().int().nonnegative(),
  type: z.string().min(1),
  cost: z.number().int().nonnegative().optional(),
  shop: z.string().optional(),
  notes: z.string().optional(),
});
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordSchema>;
export const maintenanceRecordUpdateSchema = maintenanceRecordSchema
  .omit({ vehicleId: true })
  .partial();
export type MaintenanceRecordUpdateInput = z.infer<typeof maintenanceRecordUpdateSchema>;

export const tripUpdateSchema = z.object({
  purpose: z.enum(["BUSINESS", "PERSONAL"]).nullable(),
});
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;

export const consumablePartSchema = z.object({
  vehicleId: z.string(),
  partType: z.string().min(1),
  installedDate: z.coerce.date(),
  installedOdometer: z.number().int().nonnegative(),
  expectedLifeKm: z.number().int().positive().optional(),
  expectedLifeMonths: z.number().int().positive().optional(),
});
export type ConsumablePartInput = z.infer<typeof consumablePartSchema>;
export const consumablePartUpdateSchema = consumablePartSchema
  .omit({ vehicleId: true })
  .partial();
export type ConsumablePartUpdateInput = z.infer<typeof consumablePartUpdateSchema>;
