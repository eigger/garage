import { catalogToTranslationKey, resolveCatalogKey } from "@garage/shared";
import type { TranslationKey } from "./translations";

export function itemLabelKey(stored: string): TranslationKey | null {
  const resolved = resolveCatalogKey(stored);
  if (!resolved) return null;
  return catalogToTranslationKey(resolved) as TranslationKey;
}

export function formatItemLabel(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  stored: string,
): string {
  const key = itemLabelKey(stored);
  return key ? t(key) : stored;
}
