"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";
import { formatDistanceVal, formatCurrencyVal } from "./format";

export type DistanceUnit = "km" | "mi";
export type CurrencyCode = "KRW" | "USD";

const KM_TO_MI = 0.621371;

const STORAGE_KEYS = {
  locale: "garage_locale",
  distanceUnit: "garage_distance_unit",
  currency: "garage_currency",
} as const;

interface SettingsContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  distanceUnit: DistanceUnit;
  setDistanceUnit: (unit: DistanceUnit) => void;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatDistance: (km: number) => string;
  formatCurrency: (amountInKrw: number) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>("km");
  const [currency, setCurrencyState] = useState<CurrencyCode>("KRW");

  // 저장된 사용자 설정을 불러온다 (기기별 로컬 설정, 로그인 계정과 무관).
  useEffect(() => {
    const savedLocale = localStorage.getItem(STORAGE_KEYS.locale) as Locale | null;
    const savedUnit = localStorage.getItem(STORAGE_KEYS.distanceUnit) as DistanceUnit | null;
    const savedCurrency = localStorage.getItem(STORAGE_KEYS.currency) as CurrencyCode | null;
    if (savedLocale) setLocaleState(savedLocale);
    if (savedUnit) setDistanceUnitState(savedUnit);
    if (savedCurrency) setCurrencyState(savedCurrency);
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEYS.locale, next);
  }

  function setDistanceUnit(next: DistanceUnit) {
    setDistanceUnitState(next);
    localStorage.setItem(STORAGE_KEYS.distanceUnit, next);
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

  return (
    <SettingsContext.Provider
      value={{
        locale,
        setLocale,
        distanceUnit,
        setDistanceUnit,
        currency,
        setCurrency,
        t,
        formatDistance,
        formatCurrency,
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
