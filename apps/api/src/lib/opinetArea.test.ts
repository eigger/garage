import { describe, it, expect } from "vitest";
import { resolveOpinetArea } from "./opinet.js";

describe("resolveOpinetArea", () => {
  it("uses Cheonan sigungu code 0502 when address mentions 천안", () => {
    expect(resolveOpinetArea("충청남도 천안시 동남구 안서동")).toBe("0502");
    expect(resolveOpinetArea("충남 천안시 서북구")).toBe("0502");
    expect(resolveOpinetArea("천안시 동남구")).toBe("0502");
  });

  it("falls back to sido 2-digit codes otherwise", () => {
    expect(resolveOpinetArea("충청남도 아산시")).toBe("05");
    expect(resolveOpinetArea("서울특별시 중구")).toBe("01");
    expect(resolveOpinetArea(null)).toBeUndefined();
  });
});
