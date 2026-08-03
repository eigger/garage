import { describe, it, expect } from "vitest";
import { isActivePoint, type TripDetectionPoint } from "./tripDetection.js";

const BASE_TIME = new Date("2026-08-03T07:30:00.000Z");

function point(overrides: Partial<TripDetectionPoint> = {}): TripDetectionPoint {
  return {
    time: BASE_TIME,
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

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

describe("isActivePoint", () => {
  it("trusts inVehicle=true when explicitly provided", () => {
    expect(isActivePoint(point({ inVehicle: true, speed: 0 }), null)).toBe(true);
  });

  it("trusts inVehicle=false even when OBD signals are present", () => {
    expect(
      isActivePoint(
        point({ inVehicle: false, rpm: 2000, odometer: 50000, time: minutesAfter(BASE_TIME, 1) }),
        point({ odometer: 49900 }),
      ),
    ).toBe(false);
  });

  it("detects odometer increase when inVehicle is omitted", () => {
    expect(
      isActivePoint(
        point({ odometer: 50100, time: minutesAfter(BASE_TIME, 1) }),
        point({ odometer: 50000 }),
      ),
    ).toBe(true);
  });

  // 회귀: 트립이 닫히면 그 포인트들이 미배정 조회에서 빠지면서, 남은 주차 중 포인트의
  // prev가 한참 전 포인트로 바뀌어 오도미터 증가 규칙이 잘못 발동했다 — 도착 직후
  // "0km 0분" 트립이 생기던 원인.
  it("ignores an odometer increase when the previous point is far in the past", () => {
    const parked = point({
      odometer: 50100,
      speed: 0,
      rpm: 0,
      time: minutesAfter(BASE_TIME, 30),
    });
    const stalePrev = point({ odometer: 50000, speed: 0, rpm: 0 });
    expect(isActivePoint(parked, stalePrev)).toBe(false);
  });

  it("still accepts an odometer increase right at the gap boundary", () => {
    expect(
      isActivePoint(
        point({ odometer: 50100, time: minutesAfter(BASE_TIME, 10) }),
        point({ odometer: 50000 }),
      ),
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
