import { z } from "zod";

export const vehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  vin: z.string().optional(),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
