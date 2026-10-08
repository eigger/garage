import { describe, expect, it } from "vitest";
import { isPlausibleOdometerBump, MAX_ODOMETER_JUMP_KM } from "./odometer.js";

describe("isPlausibleOdometerBump", () => {
  it("accepts normal increases and the first reading of a new vehicle", () => {
    expect(isPlausibleOdometerBump(10_000, 10_050)).toBe(true);
    expect(isPlausibleOdometerBump(0, 87_000)).toBe(true);
    expect(isPlausibleOdometerBump(10_000, 10_000 + MAX_ODOMETER_JUMP_KM)).toBe(true);
  });

  it("rejects decreases, equal values and absurd one-off jumps", () => {
    expect(isPlausibleOdometerBump(10_000, 9_999)).toBe(false);
    expect(isPlausibleOdometerBump(10_000, 10_000)).toBe(false);
    expect(isPlausibleOdometerBump(10_000, 999_999)).toBe(false);
    // 직전 원시값(정상)과 이어지지 않는 튀는 값
    expect(isPlausibleOdometerBump(10_000, 999_999, 10_020)).toBe(false);
  });

  it("recovers when the vehicle odometer was entered far too low but readings are consistent", () => {
    // 등록 때 3,000으로 잘못 입력, 실제 87,000 — 직전 원시값이 87,000대면 받아들인다.
    expect(isPlausibleOdometerBump(3_000, 87_010, 87_000)).toBe(true);
    // 같은 쓰레기 값이 연속으로 와도(고정 센티넬) 통과하지 못한다.
    expect(isPlausibleOdometerBump(10_000, 999_999, 999_999)).toBe(false);
    // 직전 원시값이 없으면(첫 값) 기다린다.
    expect(isPlausibleOdometerBump(3_000, 87_000, null)).toBe(false);
    // 직전 원시값보다 작아지는 값은 받지 않는다.
    expect(isPlausibleOdometerBump(3_000, 86_990, 87_000)).toBe(false);
  });
});
