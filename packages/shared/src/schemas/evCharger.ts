import { z } from "zod";

export const chargerStatusSchema = z.enum([
  "AVAILABLE",
  "CHARGING",
  "RESERVED",
  "OUT_OF_SERVICE",
  "UNKNOWN",
]);

export const evConnectorSchema = z.object({
  chgerId: z.string(),
  type: z.string(),
  typeLabel: z.string(),
  status: chargerStatusSchema,
  statusLabel: z.string(),
  output: z.number().nullable(),
});

export const evChargerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  operator: z.string(),
  distance: z.number(),
  lat: z.number(),
  lon: z.number(),
  address: z.string().nullable(),
  parkingFree: z.boolean(),
  connectors: z.array(evConnectorSchema),
});

export type ChargerStatus = z.infer<typeof chargerStatusSchema>;
export type EvConnector = z.infer<typeof evConnectorSchema>;
export type EvChargerSummary = z.infer<typeof evChargerSummarySchema>;
