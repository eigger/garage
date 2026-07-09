import type { Locale } from "../i18n/locale.js";

export type CatalogEntry = {
  readonly legacyKo: string;
  readonly labels: Record<Locale, string>;
};

export type CatalogCategory = "maintenance" | "admin" | "record";

export type ResolvedCatalogItem<K extends string = string> = {
  category: CatalogCategory;
  key: K;
};

export function legacyKoLookup<T extends Record<string, CatalogEntry>>(
  catalog: T,
  stored: string,
): keyof T | null {
  if (stored in catalog) return stored as keyof T;
  for (const [key, entry] of Object.entries(catalog) as [keyof T, CatalogEntry][]) {
    if (entry.legacyKo === stored) return key;
  }
  return null;
}

/** @deprecated 마이그레이션 전 legacy 한글. 신규 저장은 catalog key 문자열을 사용 */
export function storedLabel<T extends Record<string, CatalogEntry>>(
  catalog: T,
  key: keyof T,
): string {
  return catalog[key].legacyKo;
}

export function catalogItemLabel<T extends Record<string, CatalogEntry>>(
  catalog: T,
  key: keyof T,
  locale: Locale,
): string {
  return catalog[key].labels[locale];
}

export function storedVariants<T extends Record<string, CatalogEntry>>(
  catalog: T,
  key: keyof T,
): string[] {
  const legacy = catalog[key].legacyKo;
  const keyStr = String(key);
  return legacy === keyStr ? [keyStr] : [keyStr, legacy];
}

export function hasStoredCatalogItem<T extends Record<string, CatalogEntry>>(
  catalog: T,
  existing: Set<string>,
  key: keyof T,
): boolean {
  return storedVariants(catalog, key).some((v) => existing.has(v));
}
