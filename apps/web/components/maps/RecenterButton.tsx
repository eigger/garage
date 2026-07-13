"use client";

import { useSettings } from "../../lib/i18n/settings-context";

export function RecenterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function RecenterButton({ onClick }: { onClick: () => void }) {
  const { t } = useSettings();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("recenterMap")}
      aria-label={t("recenterMap")}
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 1000,
        width: 36,
        height: 36,
        minHeight: 36,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface)",
        color: "var(--color-primary)",
        border: "1px solid var(--color-input-border)",
        borderRadius: 8,
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
      }}
    >
      <RecenterIcon />
    </button>
  );
}
