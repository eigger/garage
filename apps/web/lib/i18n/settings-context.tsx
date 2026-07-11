"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";
import { formatDistanceVal, formatCurrencyVal, formatDateTimeVal } from "./format";

export type DistanceUnit = "km" | "mi";
export type CurrencyCode = "KRW" | "USD";
export type ThemeMode = "system" | "light" | "dark";
export type AccentColor = "green" | "blue" | "purple" | "orange" | "black";

const KM_TO_MI = 0.621371;

const STORAGE_KEYS = {
  locale: "garage_locale",
  distanceUnit: "garage_distance_unit",
  currency: "garage_currency",
  theme: "garage_theme",
  accentColor: "garage_accent_color",
} as const;

// 모바일 상태 표시줄(theme-color)은 globals.css에 이미 정의된 CSS 변수를 유일한
// 색상 소스로 삼는다(라이트: 강조색, 다크: 배경색) — 별도 색상표를 중복으로 두지 않는다.
function readThemeColorMetaValue(theme: ThemeMode): string {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const varName = resolved === "dark" ? "--color-bg" : "--color-primary";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

interface SettingsContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  distanceUnit: DistanceUnit;
  setDistanceUnit: (unit: DistanceUnit) => void;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  accentColor: AccentColor;
  setAccentColor: (accentColor: AccentColor) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatDistance: (km: number) => string;
  formatCurrency: (amountInKrw: number) => string;
  formatDateTime: (iso: string) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>("km");
  const [currency, setCurrencyState] = useState<CurrencyCode>("KRW");
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [accentColor, setAccentColorState] = useState<AccentColor>("green");

  // 저장된 사용자 설정을 불러온다 (기기별 로컬 설정, 로그인 계정과 무관).
  useEffect(() => {
    const savedLocale = localStorage.getItem(STORAGE_KEYS.locale) as Locale | null;
    const savedUnit = localStorage.getItem(STORAGE_KEYS.distanceUnit) as DistanceUnit | null;
    const savedCurrency = localStorage.getItem(STORAGE_KEYS.currency) as CurrencyCode | null;
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode | null;
    const savedAccent = localStorage.getItem(STORAGE_KEYS.accentColor) as AccentColor | null;
    if (savedLocale) setLocaleState(savedLocale);
    if (savedUnit) setDistanceUnitState(savedUnit);
    if (savedCurrency) setCurrencyState(savedCurrency);
    if (savedTheme) setThemeState(savedTheme);
    if (savedAccent) setAccentColorState(savedAccent);
  }, []);

  // data-accent 속성으로 강조색 팔레트를 적용한다.
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
  }, [accentColor]);

  // data-theme 속성으로 강제 라이트/다크를 적용한다. "시스템"이면 속성을 없애서
  // globals.css의 prefers-color-scheme 미디어쿼리가 OS 설정을 따르게 둔다.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // 테마/강조색이 바뀔 때마다 상태 표시줄 색을 갱신한다. data-theme/data-accent 속성이
  // 이미 위에서 적용된 뒤 실행되므로 getComputedStyle이 최신 값을 읽는다.
  useEffect(() => {
    const value = readThemeColorMetaValue(theme);
    if (value) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value);
    }
  }, [theme, accentColor]);

  // OS의 라이트/다크 설정이 바뀔 때도 상태 표시줄 색을 갱신한다("시스템" 모드일 때만).
  // 강조색이 바뀌어도 이 구독 자체는 재생성하지 않는다 — 위 effect가 직접 갱신한다.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const value = readThemeColorMetaValue(theme);
      if (value) {
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value);
      }
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEYS.locale, next);
  }

  function setDistanceUnit(next: DistanceUnit) {
    setDistanceUnitState(next);
    localStorage.setItem(STORAGE_KEYS.distanceUnit, next);
  }

  function setTheme(next: ThemeMode) {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEYS.theme, next);
  }

  function setAccentColor(next: AccentColor) {
    setAccentColorState(next);
    localStorage.setItem(STORAGE_KEYS.accentColor, next);
  }

  function setCurrency(next: CurrencyCode) {
    setCurrencyState(next);
    localStorage.setItem(STORAGE_KEYS.currency, next);
  }

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const table = translations[locale] as Record<string, string>;
    const fallback = translations.ko as Record<string, string>;
    let text: string = table[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      }
    }
    return text;
  }

  // 백엔드는 항상 km로 저장한다. 마일 표시가 선택되면 여기서 환산만 한다(실측 변환, 정확함).
  function formatDistance(km: number): string {
    return formatDistanceVal(km, distanceUnit);
  }

  // 주의: 실시간 환율 연동은 하지 않는다. 저장된 금액(원)을 그대로 두고
  // 통화 기호·천단위 구분 같은 "표시 형식"만 선택한 통화 관례에 맞춘다.
  function formatCurrency(amountInKrw: number): string {
    return formatCurrencyVal(amountInKrw, currency);
  }

  // 서버가 내려주는 UTC ISO 문자열을 브라우저의 로컬 시간대로 변환해서 표시한다.
  function formatDateTime(iso: string): string {
    return formatDateTimeVal(iso, locale);
  }

  return (
    <SettingsContext.Provider
      value={{
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
        formatDistance,
        formatCurrency,
        formatDateTime,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
