import { z } from "zod";

// Torque Pro 등 OBD 앱의 Upload URL(GET 쿼리스트링) 방식에 대응하는 스키마.
// 문자열로 들어오는 쿼리 파라미터를 숫자로 강제 변환(coerce)한다.
export const obdIngestQuerySchema = z.object({
  speed: z.coerce.number().optional(),
  rpm: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  fuelLevel: z.coerce.number().optional(),
  odometer: z.coerce.number().optional(),
});

export type ObdIngestQuery = z.infer<typeof obdIngestQuerySchema>;
