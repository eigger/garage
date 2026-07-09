import type { CatalogEntry } from "./types.js";
import { catalogItemLabel, legacyKoLookup, storedLabel } from "./types.js";
import type { Locale } from "../i18n/locale.js";

export const RECORD_TYPES = {
  odometerLog: {
    legacyKo: "주행거리 기록",
    labels: { ko: "주행거리 기록", en: "Odometer Record" },
  },
} as const satisfies Record<string, CatalogEntry>;

export type RecordTypeKey = keyof typeof RECORD_TYPES;

export function resolveRecordTypeKey(stored: string): RecordTypeKey | null {
  return legacyKoLookup(RECORD_TYPES, stored);
}

/** @deprecated use itemKey string directly for new DB rows */
export function recordStoredLabel(key: RecordTypeKey): string {
  return storedLabel(RECORD_TYPES, key);
}

export function recordItemLabel(key: RecordTypeKey, locale: Locale): string {
  return catalogItemLabel(RECORD_TYPES, key, locale);
}
