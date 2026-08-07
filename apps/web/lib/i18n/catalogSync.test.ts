import { describe, expect, it } from "vitest";
import {
  ADMIN_ITEMS,
  type AdminItemKey,
  buildCatalogTranslationMap,
  catalogToTranslationKey,
  MAINTENANCE_ITEMS,
  type MaintenanceItemKey,
  RECORD_TYPES,
  type RecordTypeKey,
} from "@garage/shared";
import { translations } from "./translations";

describe("catalog translation sync", () => {
  for (const locale of ["ko", "en"] as const) {
    it(`web translations include all catalog keys (${locale})`, () => {
      const catalog = buildCatalogTranslationMap(locale);
      for (const [key, value] of Object.entries(catalog)) {
        expect(translations[locale][key as keyof (typeof translations)["ko"]]).toBe(value);
      }
    });
  }

  it("covers every maintenance, admin, and record catalog entry", () => {
    const keys = new Set(Object.keys(buildCatalogTranslationMap("ko")));
    for (const key of Object.keys(MAINTENANCE_ITEMS) as MaintenanceItemKey[]) {
      expect(keys.has(catalogToTranslationKey({ category: "maintenance", key }))).toBe(true);
    }
    for (const key of Object.keys(ADMIN_ITEMS) as AdminItemKey[]) {
      expect(keys.has(catalogToTranslationKey({ category: "admin", key }))).toBe(true);
    }
    for (const key of Object.keys(RECORD_TYPES) as RecordTypeKey[]) {
      expect(keys.has(catalogToTranslationKey({ category: "record", key }))).toBe(true);
    }
  });
});
