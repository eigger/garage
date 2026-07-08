"use client";

import Link from "next/link";
import { useSettings } from "../lib/i18n/settings-context";
import type { Locale } from "../lib/i18n/translations";
import type { CurrencyCode, DistanceUnit } from "../lib/i18n/settings-context";
import { useAuth } from "../lib/auth-context";

export function SettingsBar() {
  const { locale, setLocale, distanceUnit, setDistanceUnit, currency, setCurrency, t } =
    useSettings();
  const { user } = useAuth();

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 16,
        fontSize: 13,
        alignItems: "center",
      }}
      aria-label={t("settingsLabel")}
    >
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("languageLabel")}
        style={{ minHeight: 36, fontSize: 13, padding: "0 8px" }}
      >
        <option value="ko">한국어</option>
        <option value="en">English</option>
      </select>

      <select
        value={distanceUnit}
        onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
        aria-label={t("distanceUnitLabel")}
        style={{ minHeight: 36, fontSize: 13, padding: "0 8px" }}
      >
        <option value="km">km</option>
        <option value="mi">mi</option>
      </select>

      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        aria-label={t("currencyLabel")}
        style={{ minHeight: 36, fontSize: 13, padding: "0 8px" }}
      >
        <option value="KRW">₩ KRW</option>
        <option value="USD">$ USD</option>
      </select>

      {user && (
        <Link
          href="/profile"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 36,
            padding: "0 12px",
            fontSize: 13,
            backgroundColor: "#eee",
            color: "#333",
            textDecoration: "none",
            borderRadius: 4,
            border: "1px solid #ccc",
          }}
        >
          👤 {t("navProfile")}
        </Link>
      )}

      {user && user.role === "ADMIN" && (
        <Link
          href="/backup"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 36,
            padding: "0 12px",
            fontSize: 13,
            backgroundColor: "#eee",
            color: "#333",
            textDecoration: "none",
            borderRadius: 4,
            border: "1px solid #ccc",
          }}
        >
          💾 {t("navBackupRestore")}
        </Link>
      )}
    </div>
  );
}
