import { z } from "zod";

export const opinetStationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  brandLabel: z.string(),
  distance: z.number(),
  price: z.number(),
});

export const opinetStationDetailSchema = opinetStationSummarySchema.extend({
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  tel: z.string().nullable(),
});

export type OpinetStationSummary = z.infer<typeof opinetStationSummarySchema>;
export type OpinetStationDetail = z.infer<typeof opinetStationDetailSchema>;
