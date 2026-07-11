import type { RecordCategory } from "../lib/types";
import type { TranslationKey } from "../lib/i18n/translations";

export function categoryLabelKey(category: RecordCategory): TranslationKey {
  return category === "ADMINISTRATIVE" ? "recordCategoryAdministrative" : "recordCategoryMaintenance";
}

export function CategoryBadge({
  category,
  t,
}: {
  category: RecordCategory;
  t: (key: TranslationKey) => string;
}) {
  const isAdmin = category === "ADMINISTRATIVE";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: isAdmin ? "var(--badge-admin-bg)" : "var(--status-ok-bg)",
        color: isAdmin ? "var(--badge-admin-text)" : "var(--color-success)",
        flexShrink: 0,
      }}
    >
      {t(categoryLabelKey(category))}
    </span>
  );
}
