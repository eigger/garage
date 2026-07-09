"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "../lib/i18n/settings-context";
import type { Locale } from "../lib/i18n/translations";
import type { CurrencyCode, DistanceUnit } from "../lib/i18n/settings-context";
import { useAuth } from "../lib/auth-context";

export function SettingsBar() {
  const { locale, setLocale, distanceUnit, setDistanceUnit, currency, setCurrency, t } =
    useSettings();
  const { user } = useAuth();
  const pathname = usePathname();
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
        overflowX: "auto",
        whiteSpace: "nowrap",
        marginBottom: 16,
        fontSize: 13,
        alignItems: "center",
        paddingBottom: 4,
        WebkitOverflowScrolling: "touch",
      }}
      className="no-scrollbar"
      aria-label={t("settingsLabel")}
    >
      {user && (
        <Link
          href="/profile"
          className={`nav-btn-premium ${pathname === "/profile" ? "active" : ""}`}
          style={{ flexShrink: 0, height: 36, minHeight: 36, display: "inline-flex", alignItems: "center" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          {t("navProfile")}
        </Link>
      )}

      {user && user.role === "ADMIN" && (
        <Link
          href="/backup"
          className={`nav-btn-premium ${pathname === "/backup" ? "active" : ""}`}
          style={{ flexShrink: 0, height: 36, minHeight: 36, display: "inline-flex", alignItems: "center" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
          {t("navBackupRestore")}
        </Link>
      )}

      <span
        style={{
          color: "#888",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          marginLeft: 8,
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
