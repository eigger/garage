import { z } from "zod";

export const OPINET_PROD_LABELS = {
  B027: { ko: "휘발유", en: "Gasoline" },
  B034: { ko: "고급휘발유", en: "Premium gasoline" },
  D047: { ko: "경유", en: "Diesel" },
  K015: { ko: "자동차부탄", en: "Auto LPG" },
  C004: { ko: "실내등유", en: "Kerosene" },
} as const;

export type OpinetProdCd = keyof typeof OPINET_PROD_LABELS;

export const OPINET_PROD_DISPLAY_ORDER: OpinetProdCd[] = ["B027", "B034", "D047", "K015", "C004"];

export const cheonanCardConfigSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  stationCount: z.number().int().nonnegative(),
  seedGeneratedAt: z.string(),
});
export type CheonanCardConfig = z.infer<typeof cheonanCardConfigSchema>;

export const cheonanCardStationPriceSchema = z.object({
  prodCd: z.string(),
  price: z.number(),
  tradeAt: z.string(),
});

export const cheonanCardStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  brandLabel: z.string().nullable(),
  address: z.string(),
  roadAddress: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  distanceM: z.number().nullable(),
  prices: z.array(cheonanCardStationPriceSchema),
  primaryPrice: z.number().nullable(),
  isLpgStation: z.boolean(),
});

export const cheonanCardUnmatchedSchema = z.object({
  seq: z.number().int(),
  name: z.string(),
  address: z.string(),
  tel: z.string().nullable(),
  bizType: z.string(),
});

export const cheonanCardStationsResponseSchema = z.object({
  label: z.string(),
  status: z.enum(["preparing", "refreshing", "fresh"]),
  primaryProdCd: z.string(),
  stations: z.array(cheonanCardStationSchema),
  unmatched: z.array(cheonanCardUnmatchedSchema),
  pricesSyncedAt: z.string().nullable(),
  seedGeneratedAt: z.string(),
});
export type CheonanCardStationsResponse = z.infer<typeof cheonanCardStationsResponseSchema>;
export type CheonanCardStation = z.infer<typeof cheonanCardStationSchema>;
