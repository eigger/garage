import { describe, expect, it } from "vitest";
import { jsonTelemetrySchema, obdIngestQuerySchema } from "@garage/shared";

// odometer 컬럼은 Int라 소수·범위 밖 값이 그대로 저장되면 Prisma 오류(500)로 포인트가 통째로 유실된다.
describe("telemetry odometer normalization", () => {
  it("rounds fractional JSON odometer", () => {
    expect(jsonTelemetrySchema.parse({ odometer: 12345.6 }).odometer).toBe(12346);
    expect(jsonTelemetrySchema.parse({ odometer: 12345.4 }).odometer).toBe(12345);
  });

  it("keeps null and missing odometer", () => {
    expect(jsonTelemetrySchema.parse({ odometer: null }).odometer).toBeNull();
    expect(jsonTelemetrySchema.parse({}).odometer).toBeUndefined();
  });

  it("drops only the odometer when it is negative or out of Int range, keeping other fields", () => {
    const neg = jsonTelemetrySchema.parse({ odometer: -5, speed: 40 });
    expect(neg.odometer).toBeUndefined();
    expect(neg.speed).toBe(40);
    expect(jsonTelemetrySchema.parse({ odometer: 1e12 }).odometer).toBeUndefined();
  });

  it("rounds query-string odometer and ignores garbage", () => {
    expect(obdIngestQuerySchema.parse({ odometer: "12345.6" }).odometer).toBe(12346);
    expect(obdIngestQuerySchema.parse({ odometer: "abc", speed: "10" })).toMatchObject({ speed: 10 });
    expect(obdIngestQuerySchema.parse({ odometer: "abc" }).odometer).toBeUndefined();
    expect(obdIngestQuerySchema.parse({}).odometer).toBeUndefined();
  });
});

import { isPlausibleOdometerBump, MAX_ODOMETER_JUMP_KM } from "./ingest.js";

describe("isPlausibleOdometerBump", () => {
  it("accepts normal increases and the first reading of a new vehicle", () => {
    expect(isPlausibleOdometerBump(10_000, 10_050)).toBe(true);
    expect(isPlausibleOdometerBump(0, 87_000)).toBe(true);
    expect(isPlausibleOdometerBump(10_000, 10_000 + MAX_ODOMETER_JUMP_KM)).toBe(true);
  });

  it("rejects decreases, equal values and absurd jumps", () => {
    expect(isPlausibleOdometerBump(10_000, 9_999)).toBe(false);
    expect(isPlausibleOdometerBump(10_000, 10_000)).toBe(false);
    expect(isPlausibleOdometerBump(10_000, 999_999)).toBe(false);
  });
});
