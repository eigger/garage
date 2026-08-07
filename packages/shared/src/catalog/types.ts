import type { Locale } from "../i18n/locale.js";

export type CatalogEntry = {
  /** 과거/커스텀 한글 라벨 별칭. 신규 row는 key를 저장하고, 조회·동기화 시 variant로 함께 인식한다. */
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

/**
 * catalog entry의 legacyKo 문자열.
 * 신규 저장은 catalog key를 쓰되, legacyKo는 (1) 마이그레이션 전 한글 데이터와
 * (2) 커스텀으로 쌓인 한글 라벨을 카탈로그로 승격할 때 별칭으로도 쓴다.
 */
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
