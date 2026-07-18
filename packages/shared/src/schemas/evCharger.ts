import { z } from "zod";

export const chargerStatusSchema = z.enum([
  "AVAILABLE",
  "CHARGING",
  "RESERVED",
  "OUT_OF_SERVICE",
  "UNKNOWN",
]);

// type/status는 코드 값만 내려주고, 사람이 읽을 라벨은 프론트에서 로케일에 맞게 번역한다
// (백엔드가 한글 라벨을 내려주면 영어 로케일에서도 한글이 그대로 노출되는 문제가 있었음).
export const evConnectorSchema = z.object({
  chgerId: z.string(),
  type: z.string(),
  status: chargerStatusSchema,
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
