"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSettings } from "../lib/i18n/settings-context";
import type { Locale } from "../lib/i18n/translations";
import type { CurrencyCode, DistanceUnit } from "../lib/i18n/settings-context";
import { useAuth } from "../lib/auth-context";

export function SettingsBar() {
  const { locale, setLocale, distanceUnit, setDistanceUnit, currency, setCurrency, t } =
    useSettings();
  const { user } = useAuth();
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; updateAvailable: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/health")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.updateAvailable === "boolean") {
          setUpdateInfo({
            latestVersion: data.latestVersion,
            updateAvailable: data.updateAvailable,
          });
        }
      })
      .catch((err) => console.error("Failed to check update:", err));
  }, [user]);

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
          className="nav-btn-premium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          {t("navProfile")}
        </Link>
      )}

      {user && user.role === "ADMIN" && (
        <Link
          href="/backup"
          className="nav-btn-premium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
          {t("navBackupRestore")}
        </Link>
      )}

      <span
        style={{
          marginLeft: "auto",
          color: "#888",
          fontSize: 12,
          alignSelf: "center",
          paddingRight: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        v{process.env.APP_VERSION}
        {updateInfo?.updateAvailable && (
          <span
            title={`New version v${updateInfo.latestVersion} is available!`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#ff4d4f",
              color: "white",
              fontSize: 10,
              fontWeight: "bold",
              borderRadius: 10,
              padding: "2px 6px",
              cursor: "help",
            }}
          >
            Update Available
          </span>
        )}
      </span>
    </div>
  );
}
