import { describe, it, expect } from "vitest";
import { formatDistanceVal, formatCurrencyVal } from "./format";

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
