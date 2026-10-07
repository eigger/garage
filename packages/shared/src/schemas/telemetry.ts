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

// DB의 odometer 컬럼은 Int(km)다. HA/Torque가 12345.6처럼 소수를 보내면 Prisma 검증에서
// 500이 나서 포인트 전체가 유실되므로 반올림해서 받고, 음수·Int 범위 초과·숫자가 아닌 값은
// 요청 전체를 거부하는 대신 odometer만 버린다(위치·속도 등 나머지 데이터는 살린다).
const INT32_MAX = 2_147_483_647;
const odometerValue = z.number().finite().min(0).max(INT32_MAX).transform((v) => Math.round(v));

// Torque Pro 등 OBD 앱의 Upload URL(GET 쿼리스트링) 방식에 대응하는 스키마.
// 문자열로 들어오는 쿼리 파라미터를 숫자로 강제 변환(coerce)한다.
export const obdIngestQuerySchema = z.object({
  speed: z.coerce.number().optional(),
  rpm: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  fuelLevel: z.coerce.number().optional(),
  odometer: z.coerce.number().pipe(odometerValue).optional().catch(undefined),
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
  odometer: odometerValue.nullable().optional().catch(undefined),
  inVehicle: z.boolean().optional(),
});

export type JsonTelemetryInput = z.infer<typeof jsonTelemetrySchema>;
