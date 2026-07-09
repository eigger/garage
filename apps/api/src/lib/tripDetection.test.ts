import { describe, it, expect } from "vitest";
import { isActivePoint, type TripDetectionPoint } from "./tripDetection.js";

function point(overrides: Partial<TripDetectionPoint> = {}): TripDetectionPoint {
  return {
    lat: 37.5665,
    lon: 126.978,
    speed: null,
    rpm: null,
    odometer: null,
    source: "rest_api_post",
    inVehicle: null,
    ...overrides,
  };
}

describe("isActivePoint", () => {
  it("trusts inVehicle=true when explicitly provided", () => {
    expect(isActivePoint(point({ inVehicle: true, speed: 0 }), null)).toBe(true);
  });

  it("trusts inVehicle=false even when OBD signals are present", () => {
    expect(
      isActivePoint(
        point({ inVehicle: false, rpm: 2000, odometer: 50000 }),
        point({ odometer: 49900 }),
      ),
    ).toBe(false);
  });

  it("detects odometer increase when inVehicle is omitted", () => {
    expect(
      isActivePoint(point({ odometer: 50100 }), point({ odometer: 50000 })),
    ).toBe(true);
  });

  it("detects rpm above threshold when inVehicle is omitted", () => {
    expect(isActivePoint(point({ rpm: 800 }), null)).toBe(true);
  });

  it("detects OBD app speed when inVehicle is omitted", () => {
    expect(isActivePoint(point({ source: "obd_app_get", speed: 10 }), null)).toBe(true);
  });

  it("requires displacement for GPS-only speed fallback", () => {
    const prev = point({ lat: 37.5665, lon: 126.978, speed: 20 });
    const cur = point({ lat: 37.5665, lon: 126.978, speed: 25 });
    expect(isActivePoint(cur, prev)).toBe(false);
  });

  it("accepts GPS speed with sufficient displacement", () => {
    const prev = point({ lat: 37.5665, lon: 126.978, speed: 20 });
    const cur = point({ lat: 37.575, lon: 126.978, speed: 25 });
    expect(isActivePoint(cur, prev)).toBe(true);
  });

  it("rejects walking-speed GPS without inVehicle hint", () => {
    const prev = point({ lat: 37.5665, lon: 126.978, speed: 5 });
    const cur = point({ lat: 37.567, lon: 126.978, speed: 5 });
    expect(isActivePoint(cur, prev)).toBe(false);
  });
});
