import { describe, it, expect } from "vitest";
import {
  formatDistanceVal,
  formatCurrencyVal,
  toDisplayDistanceVal,
  toStoredDistanceVal,
} from "./format";

describe("formatDistanceVal", () => {
  it("should format distance in kilometers with 0 decimal places", () => {
    expect(formatDistanceVal(12345.67, "km")).toBe("12346 km");
    expect(formatDistanceVal(0, "km")).toBe("0 km");
  });

  it("should format distance in miles with 1 decimal place and correct conversion", () => {
    // 100 km * 0.621371 = 62.1371 miles -> 62.1 mi
    expect(formatDistanceVal(100, "mi")).toBe("62.1 mi");
    expect(formatDistanceVal(0, "mi")).toBe("0.0 mi");
  });
});

describe("formatCurrencyVal", () => {
  it("should format KRW currency with 0 decimal places and won symbol", () => {
    const formatted = formatCurrencyVal(15000, "KRW");
    // Normalize spaces and verify it has the won symbol and correct formatting
    expect(formatted.replace(/\s/g, "")).toContain("₩15,000");
  });

  it("should format USD currency with 2 decimal places and dollar symbol", () => {
    const formatted = formatCurrencyVal(123.45, "USD");
    expect(formatted.replace(/\s/g, "")).toContain("$123.45");
  });
});

describe("distance input conversion", () => {
  it("leaves kilometre input untouched in both directions", () => {
    expect(toDisplayDistanceVal(30980, "km")).toBe(30980);
    expect(toStoredDistanceVal(30980, "km")).toBe(30980);
  });

  it("converts kilometres to whole miles for the input box", () => {
    // 이 환산이 없으면 마일 사용자가 계기판 숫자(19,250 mi)를 넣어도 19,250km로 저장된다.
    expect(toDisplayDistanceVal(30980, "mi")).toBe(19250);
    expect(toStoredDistanceVal(19250, "mi")).toBe(30980);
  });

  it("can drift by a kilometre across a round trip, which is why callers keep the original", () => {
    // 정수로 반올림하는 왕복이라 값이 항상 제자리로 돌아오지는 않는다 — 화면단은 입력이
    // 그대로면 환산을 건너뛰고 원본 km를 보낸다.
    const drifting = [];
    for (let km = 30000; km < 30010; km++) {
      if (toStoredDistanceVal(toDisplayDistanceVal(km, "mi"), "mi") !== km) drifting.push(km);
    }
    expect(drifting.length).toBeGreaterThan(0);
  });
});
