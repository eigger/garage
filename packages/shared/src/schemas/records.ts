import { z } from "zod";
import { recordCategorySchema } from "./category.js";

export const fuelLogSchema = z.object({
  vehicleId: z.string(),
  date: z.coerce.date(),
  odometer: z.number().int().nonnegative(),
  liters: z.number().positive(),
  cost: z.number().int().nonnegative(),
  fullTank: z.boolean().default(true),
  location: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  opinetStationId: z.string().nullable().optional(),
});
export type FuelLogInput = z.infer<typeof fuelLogSchema>;
export const fuelLogUpdateSchema = fuelLogSchema.omit({ vehicleId: true }).partial();
export type FuelLogUpdateInput = z.infer<typeof fuelLogUpdateSchema>;

export const maintenanceRecordSchema = z.object({
  vehicleId: z.string(),
  date: z.coerce.date(),
  odometer: z.number().int().nonnegative(),
  type: z.string().min(1),
  category: recordCategorySchema.default("MAINTENANCE"),
  cost: z.number().int().nonnegative().optional(),
  shop: z.string().optional(),
  notes: z.string().optional(),
});
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordSchema>;
export const maintenanceRecordUpdateSchema = maintenanceRecordSchema
  .omit({ vehicleId: true })
  .partial();
export type MaintenanceRecordUpdateInput = z.infer<typeof maintenanceRecordUpdateSchema>;

export const consumablePartSchema = z.object({
  vehicleId: z.string(),
  partType: z.string().min(1),
  category: recordCategorySchema.default("MAINTENANCE"),
  installedDate: z.coerce.date(),
  installedOdometer: z.number().int().nonnegative(),
  expectedLifeKm: z.number().int().positive().optional(),
  expectedLifeMonths: z.number().int().positive().optional(),
});
export type ConsumablePartInput = z.infer<typeof consumablePartSchema>;
export const consumablePartUpdateSchema = consumablePartSchema
  .omit({ vehicleId: true })
  .partial()
  .extend({
    recordCompletion: z.boolean().optional(),
    completionCost: z.number().int().nonnegative().optional(),
    completionShop: z.string().optional(),
    completionNotes: z.string().optional(),
  });
export type ConsumablePartUpdateInput = z.infer<typeof consumablePartUpdateSchema>;
