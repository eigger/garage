"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import { PushNotificationSettings } from "../../components/PushNotificationSettings";
import { useMapProviders } from "../../lib/maps/useMapProviders";
import { isMapProvider, MAP_PROVIDER_STORAGE_KEY } from "../../lib/maps/types";
import { SettingsGearIcon, CheckIcon, XIcon } from "../../components/icons";
import type { AccentColor } from "../../lib/i18n/settings-context";

const ACCENT_SWATCHES: { value: AccentColor; hex: string; labelKey: "accentGreen" | "accentBlue" | "accentPurple" | "accentOrange" | "accentBlack" }[] = [
  { value: "green", hex: "#18523f", labelKey: "accentGreen" },
  { value: "blue", hex: "#1d4ed8", labelKey: "accentBlue" },
  { value: "purple", hex: "#7c3aed", labelKey: "accentPurple" },
  { value: "orange", hex: "#c2410c", labelKey: "accentOrange" },
  { value: "black", hex: "#18181b", labelKey: "accentBlack" },
];

export default function ProfilePage() {
  const { user, requireAuth } = useAuth();
  const {
    locale,
    setLocale,
    distanceUnit,
    setDistanceUnit,
    currency,
    setCurrency,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    t,
  } = useSettings();
  const { showToast } = useToast();
  const router = useRouter();
  const mapConfig = useMapProviders();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mapProviderPref, setMapProviderPref] = useState("auto");

  useEffect(() => {
    requireAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saved = localStorage.getItem(MAP_PROVIDER_STORAGE_KEY);
    setMapProviderPref(saved && isMapProvider(saved) ? saved : "auto");
  }, []);

  function handleMapProviderChange(value: string) {
    setMapProviderPref(value);
    if (value === "auto") {
      localStorage.removeItem(MAP_PROVIDER_STORAGE_KEY);
    } else {
      localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, value);
    }
  }

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (newPassword && newPassword !== confirmNewPassword) {
      setError(t("passwordConfirmMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const body: any = { name, email };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(t("profileUpdated"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        showToast(t("toastSaved"), "success");
        // Reload to sync auth state, delayed so the success message/toast is visible first.
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const errData = await res.json();
        if (errData.error === "incorrect currentPassword") {
          setError(t("incorrectPassword"));
        } else {
          setError(t("passwordMismatch"));
        }
        showToast(t("toastError"), "error");
      }
    } catch {
      setError(t("connectionError"));
      showToast(t("toastError"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <main className="container">
      <h1>{t("navProfile")}</h1>

      <form onSubmit={handleSubmit} className="form" style={{ maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t("name")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("emailPlaceholder")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={t("emailPlaceholder")}
          />
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: 15, borderBottom: "1px solid var(--color-border)", paddingBottom: 6 }}>
          {t("changePasswordHeading")}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("currentPassword")}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t("currentPassword")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("newPassword")}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("newPassword")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("confirmPassword")}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder={t("confirmPassword")}
          />
        </div>

        {message && (
          <p style={{ color: "var(--color-primary)", fontSize: 14, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckIcon /> {message}
          </p>
        )}
        {error && (
          <p style={{ color: "var(--color-danger)", fontSize: 14, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
            <XIcon /> {error}
          </p>
        )}

        <button type="submit" disabled={submitting} style={{ marginTop: 20 }}>
          {submitting ? t("saving") : t("save")}
        </button>
      </form>

      <h3 style={{ marginTop: 28, marginBottom: 12, fontSize: 15, borderBottom: "1px solid var(--color-border)", paddingBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <SettingsGearIcon /> {t("preferences")}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400, marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("languageLabel")}</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as any)}
            style={{ width: "100%", height: 48, minHeight: 48 }}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("themeLabel")}</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            style={{ width: "100%", height: 48, minHeight: 48 }}
          >
            <option value="system">{t("themeSystem")}</option>
            <option value="light">{t("themeLight")}</option>
            <option value="dark">{t("themeDark")}</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("accentColorLabel")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => setAccentColor(swatch.value)}
                title={t(swatch.labelKey)}
                aria-label={t(swatch.labelKey)}
                aria-pressed={accentColor === swatch.value}
                style={{
                  width: 36,
                  height: 36,
                  minHeight: 36,
                  padding: 0,
                  borderRadius: "50%",
                  background: swatch.hex,
                  border: accentColor === swatch.value ? "3px solid var(--color-text)" : "3px solid transparent",
                  boxShadow: accentColor === swatch.value ? "0 0 0 1px var(--color-border)" : "none",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("distanceUnitLabel")}</label>
          <select
            value={distanceUnit}
            onChange={(e) => setDistanceUnit(e.target.value as any)}
            style={{ width: "100%", height: 48, minHeight: 48 }}
          >
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("currencyLabel")}</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
            style={{ width: "100%", height: 48, minHeight: 48 }}
          >
            <option value="KRW">₩ KRW</option>
            <option value="USD">$ USD</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("mapProviderLabel")}</label>
          <select
            value={mapProviderPref}
            onChange={(e) => handleMapProviderChange(e.target.value)}
            style={{ width: "100%", height: 48, minHeight: 48 }}
          >
            <option value="auto">{t("mapProviderAuto")}</option>
            <option value="osm">{t("mapProviderOsm")}</option>
            {mapConfig.providers.includes("kakao") && <option value="kakao">{t("mapProviderKakao")}</option>}
            {mapConfig.providers.includes("naver") && <option value="naver">{t("mapProviderNaver")}</option>}
            {mapConfig.providers.includes("tmap") && <option value="tmap">{t("mapProviderTmap")}</option>}
          </select>
        </div>
      </div>

      <PushNotificationSettings />
    </main>
  );
}
