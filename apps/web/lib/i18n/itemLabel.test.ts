import { describe, expect, it } from "vitest";
import {
  catalogToTranslationKey,
  resolveCatalogKey,
} from "@garage/shared";
import { itemLabelKey } from "./itemLabel";

describe("resolveCatalogKey", () => {
  it("resolves legacy Korean labels", () => {
    expect(resolveCatalogKey("엔진오일·오일필터 교체")).toEqual({
      category: "maintenance",
      key: "engineOilFilter",
    });
    expect(resolveCatalogKey("자동차보험 갱신")).toEqual({
      category: "admin",
      key: "autoInsuranceRenewal",
    });
  });

  it("resolves English catalog keys", () => {
    expect(resolveCatalogKey("engineOilFilter")).toEqual({
      category: "maintenance",
      key: "engineOilFilter",
    });
  });

  it("returns null for custom user labels", () => {
    expect(resolveCatalogKey("사고 수리")).toBeNull();
  });
});

describe("catalogToTranslationKey", () => {
  it("maps to item/admin/record prefixes", () => {
    expect(
      catalogToTranslationKey({ category: "maintenance", key: "engineOilFilter" }),
    ).toBe("itemEngineOilFilter");
    expect(
      catalogToTranslationKey({ category: "admin", key: "vehicleInspection" }),
    ).toBe("adminVehicleInspection");
    expect(catalogToTranslationKey({ category: "record", key: "odometerLog" })).toBe(
      "recordOdometerLog",
    );
  });
});

describe("itemLabelKey", () => {
  it("returns translation key for known stored values", () => {
    expect(itemLabelKey("engineOilFilter")).toBe("itemEngineOilFilter");
    expect(itemLabelKey("wiperBlade")).toBe("itemWiperBlade");
  });

  it("returns null for unknown values", () => {
    expect(itemLabelKey("커스텀 정비")).toBeNull();
  });
});
