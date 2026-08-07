import { resolveCatalogKey } from "@garage/shared";
import type { TranslationKey } from "../lib/i18n/translations";

export function isCustomItem(stored: string): boolean {
  return resolveCatalogKey(stored) === null;
}

/** 카탈로그에 없는 직접 입력 항목에만 붙이는 배지 */
export function CustomItemBadge({
  stored,
  t,
}: {
  stored: string;
  t: (key: TranslationKey) => string;
}) {
  if (!isCustomItem(stored)) return null;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--color-track-bg)",
        color: "var(--color-text-muted)",
        flexShrink: 0,
      }}
    >
      {t("customItem")}
    </span>
  );
}
