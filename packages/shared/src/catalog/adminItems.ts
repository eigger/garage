import type { RecordCategory } from "../schemas/category.js";
import type { CatalogEntry } from "./types.js";
import {
  catalogItemLabel,
  hasStoredCatalogItem,
  legacyKoLookup,
  storedLabel,
  storedVariants,
} from "./types.js";
import type { Locale } from "../i18n/locale.js";

export const ADMIN_ITEMS = {
  vehicleInspection: {
    legacyKo: "자동차 정기검사",
    labels: { ko: "자동차 정기검사", en: "Vehicle inspection" },
  },
  autoInsuranceRenewal: {
    legacyKo: "자동차보험 갱신",
    labels: { ko: "자동차보험 갱신", en: "Auto insurance renewal" },
  },
  vehicleTax: {
    legacyKo: "자동차세",
    labels: { ko: "자동차세", en: "Vehicle tax" },
  },
  vehicleTaxH1: {
    legacyKo: "자동차세(상반기)",
    labels: { ko: "자동차세(상반기)", en: "Vehicle tax (H1)" },
  },
  vehicleTaxH2: {
    legacyKo: "자동차세(하반기)",
    labels: { ko: "자동차세(하반기)", en: "Vehicle tax (H2)" },
  },
} as const satisfies Record<string, CatalogEntry>;

export type AdminItemKey = keyof typeof ADMIN_ITEMS;

export type AdminScheduleDef = {
  itemKey: AdminItemKey;
  expectedLifeMonths: number;
  category: RecordCategory;
};

export const ADMIN_SCHEDULE_DEFS: AdminScheduleDef[] = [
  { itemKey: "vehicleInspection", expectedLifeMonths: 24, category: "ADMINISTRATIVE" },
  { itemKey: "autoInsuranceRenewal", expectedLifeMonths: 12, category: "ADMINISTRATIVE" },
  { itemKey: "vehicleTax", expectedLifeMonths: 12, category: "ADMINISTRATIVE" },
];

export function resolveAdminItemKey(stored: string): AdminItemKey | null {
  return legacyKoLookup(ADMIN_ITEMS, stored);
}

/** @deprecated use itemKey string directly for new DB rows */
export function adminStoredLabel(key: AdminItemKey): string {
  return storedLabel(ADMIN_ITEMS, key);
}

export function adminItemLabel(key: AdminItemKey, locale: Locale): string {
  return catalogItemLabel(ADMIN_ITEMS, key, locale);
}

export function adminStoredVariants(key: AdminItemKey): string[] {
  return storedVariants(ADMIN_ITEMS, key);
}

export function hasStoredAdminItem(existing: Set<string>, key: AdminItemKey): boolean {
  return hasStoredCatalogItem(ADMIN_ITEMS, existing, key);
}

export function adminPresetCatalogDefs(): { itemKey: AdminItemKey; intervalMonths?: number }[] {
  const defaults = new Map(ADMIN_SCHEDULE_DEFS.map((d) => [d.itemKey, d.expectedLifeMonths]));
  return (Object.keys(ADMIN_ITEMS) as AdminItemKey[]).map((itemKey) => ({
    itemKey,
    intervalMonths: defaults.get(itemKey),
  }));
}

export function hasStoredAdminPresetName(existing: Set<string>, name: string): boolean {
  if (existing.has(name)) return true;
  const key = resolveAdminItemKey(name);
  return key ? hasStoredAdminItem(existing, key) : false;
}
