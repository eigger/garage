import { z } from "zod";

// GET 쿼리스트링의 optional boolean (true/false/1/0). 잘못된 값은 undefined로 간주한다.
export const optionalQueryBooleanSchema = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((val): boolean | undefined => {
    if (val === undefined) return undefined;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    const lower = String(val).toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
    return undefined;
  });

// Torque Pro 등 OBD 앱의 Upload URL(GET 쿼리스트링) 방식에 대응하는 스키마.
// 문자열로 들어오는 쿼리 파라미터를 숫자로 강제 변환(coerce)한다.
export const obdIngestQuerySchema = z.object({
  speed: z.coerce.number().optional(),
  rpm: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  fuelLevel: z.coerce.number().optional(),
  odometer: z.coerce.number().optional(),
  inVehicle: optionalQueryBooleanSchema,
});

export type ObdIngestQuery = z.infer<typeof obdIngestQuerySchema>;

export const jsonTelemetrySchema = z.object({
  speed: z.number().nullable().optional(),
  rpm: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  fuelLevel: z.number().nullable().optional(),
  dtcCodes: z.string().nullable().optional(),
  odometer: z.number().nullable().optional(),
  inVehicle: z.boolean().optional(),
});

export type JsonTelemetryInput = z.infer<typeof jsonTelemetrySchema>;
