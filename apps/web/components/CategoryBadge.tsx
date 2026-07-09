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
        background: isAdmin ? "#e8f0fe" : "#e3f1e9",
        color: isAdmin ? "#1d4ed8" : "#18523f",
        flexShrink: 0,
      }}
    >
      {t(categoryLabelKey(category))}
    </span>
  );
}
