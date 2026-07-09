import type { Locale } from "../i18n/locale.js";
import { adminItemLabel } from "./adminItems.js";
import { ADMIN_ITEMS } from "./adminItems.js";
import type { AdminItemKey } from "./adminItems.js";
import { maintenanceItemLabel } from "./maintenanceItems.js";
import { MAINTENANCE_ITEMS } from "./maintenanceItems.js";
import type { MaintenanceItemKey } from "./maintenanceItems.js";
import { recordItemLabel } from "./recordTypes.js";
import { RECORD_TYPES } from "./recordTypes.js";
import type { RecordTypeKey } from "./recordTypes.js";
import type { CatalogCategory, ResolvedCatalogItem } from "./types.js";
import { resolveAdminItemKey } from "./adminItems.js";
import { resolveMaintenanceItemKey } from "./maintenanceItems.js";
import { resolveRecordTypeKey } from "./recordTypes.js";

export type CatalogKey = MaintenanceItemKey | AdminItemKey | RecordTypeKey;

export type ResolvedCatalog = ResolvedCatalogItem<CatalogKey>;

export function resolveCatalogKey(stored: string): ResolvedCatalog | null {
  const maintenance = resolveMaintenanceItemKey(stored);
  if (maintenance) return { category: "maintenance", key: maintenance };

  const admin = resolveAdminItemKey(stored);
  if (admin) return { category: "admin", key: admin };

  const record = resolveRecordTypeKey(stored);
  if (record) return { category: "record", key: record };

  return null;
}

export function catalogTranslationKeyPrefix(category: CatalogCategory): string {
  switch (category) {
    case "maintenance":
      return "item";
    case "admin":
      return "admin";
    case "record":
      return "record";
  }
}

export function catalogToTranslationKey(resolved: ResolvedCatalog): string {
  const prefix = catalogTranslationKeyPrefix(resolved.category);
  const key = resolved.key;
  return `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
}

function resolvedItemLabel(resolved: ResolvedCatalog, locale: Locale): string {
  switch (resolved.category) {
    case "maintenance":
      return maintenanceItemLabel(resolved.key as MaintenanceItemKey, locale);
    case "admin":
      return adminItemLabel(resolved.key as AdminItemKey, locale);
    case "record":
      return recordItemLabel(resolved.key as RecordTypeKey, locale);
  }
}

export function formatStoredItemLabel(stored: string, locale: Locale): string {
  const resolved = resolveCatalogKey(stored);
  return resolved ? resolvedItemLabel(resolved, locale) : stored;
}

/** web translations.ts에 병합할 catalog 항목 라벨 맵 */
export function buildCatalogTranslationMap(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};

  for (const key of Object.keys(MAINTENANCE_ITEMS) as MaintenanceItemKey[]) {
    out[catalogToTranslationKey({ category: "maintenance", key })] = maintenanceItemLabel(
      key,
      locale,
    );
  }
  for (const key of Object.keys(ADMIN_ITEMS) as AdminItemKey[]) {
    out[catalogToTranslationKey({ category: "admin", key })] = adminItemLabel(key, locale);
  }
  for (const key of Object.keys(RECORD_TYPES) as RecordTypeKey[]) {
    out[catalogToTranslationKey({ category: "record", key })] = recordItemLabel(key, locale);
  }

  return out;
}

/** legacy 한글 → catalog key 데이터 마이그레이션 SQL 생성 */
export function buildItemKeyMigrationSql(): string {
  const catalogs = [
    { table: "ConsumablePart", column: "partType" },
    { table: "MaintenanceRecord", column: "type" },
    { table: "Reminder", column: "type" },
    { table: "MaintenancePresetTemplate", column: "name" },
  ] as const;

  const mappings: { key: string; legacyKo: string }[] = [];
  for (const [key, entry] of Object.entries(MAINTENANCE_ITEMS)) {
    if (entry.legacyKo !== key) mappings.push({ key, legacyKo: entry.legacyKo });
  }
  for (const [key, entry] of Object.entries(ADMIN_ITEMS)) {
    if (entry.legacyKo !== key) mappings.push({ key, legacyKo: entry.legacyKo });
  }
  for (const [key, entry] of Object.entries(RECORD_TYPES)) {
    if (entry.legacyKo !== key) mappings.push({ key, legacyKo: entry.legacyKo });
  }

  const lines = ["-- Migrate legacy Korean item labels to catalog keys"];
  for (const { table, column } of catalogs) {
    lines.push("");
    lines.push(`-- ${table}.${column}`);
    for (const { key, legacyKo } of mappings) {
      const escaped = legacyKo.replace(/'/g, "''");
      lines.push(
        `UPDATE "${table}" SET "${column}" = '${key}' WHERE "${column}" = '${escaped}';`,
      );
    }
  }
  return lines.join("\n");
}
