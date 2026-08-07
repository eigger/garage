"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "../lib/api";
import type { TranslationKey } from "../lib/i18n/translations";

export type HistoryPeriodScope = "trips" | "fuel" | "maintenance";

type PeriodParts = { year: string; month: string; day: string };

function parsePeriod(value: string): PeriodParts {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { year: value.slice(0, 4), month: value.slice(5, 7), day: value.slice(8, 10) };
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return { year: value.slice(0, 4), month: value.slice(5, 7), day: "" };
  }
  if (/^\d{4}$/.test(value)) {
    return { year: value, month: "", day: "" };
  }
  return { year: "", month: "", day: "" };
}

function composePeriod(parts: PeriodParts): string {
  if (!parts.year) return "";
  if (!parts.month) return parts.year;
  if (!parts.day) return `${parts.year}-${parts.month}`;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  width: "100%",
  minHeight: 38,
  height: 38,
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--color-border-light)",
  padding: "0 36px 0 12px",
  outline: "none",
  boxSizing: "border-box",
  lineHeight: "38px",
};

export function HistoryPeriodFilter({
  value,
  onChange,
  t,
  vehicleId,
  scope,
}: {
  value: string;
  onChange: (period: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  vehicleId: string;
  scope: HistoryPeriodScope;
}) {
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const parts = parsePeriod(value);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/history-periods?scope=${scope}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        years?: string[];
        months?: string[];
        days?: string[];
      };
      if (cancelled) return;
      setYears(Array.isArray(data.years) ? data.years : []);
      setMonths(Array.isArray(data.months) ? data.months : []);
      setDays(Array.isArray(data.days) ? data.days : []);
    }
    loadPeriods();
    return () => {
      cancelled = true;
    };
  }, [vehicleId, scope]);

  const monthsForYear = useMemo(() => {
    if (!parts.year) return [] as string[];
    return months
      .filter((ym) => ym.startsWith(`${parts.year}-`))
      .map((ym) => ym.slice(5, 7));
  }, [months, parts.year]);

  const daysForMonth = useMemo(() => {
    if (!parts.year || !parts.month) return [] as string[];
    const prefix = `${parts.year}-${parts.month}-`;
    return days.filter((d) => d.startsWith(prefix)).map((d) => d.slice(8, 10));
  }, [days, parts.year, parts.month]);

  function emit(next: PeriodParts) {
    onChange(composePeriod(next));
  }

  function handleYearChange(year: string) {
    // 연 변경/해제 시 월·일 초기화
    emit({ year, month: "", day: "" });
  }

  function handleMonthChange(month: string) {
    // 월 변경/해제 시 일 초기화 (연은 유지)
    emit({ year: parts.year, month, day: "" });
  }

  function handleDayChange(day: string) {
    emit({ year: parts.year, month: parts.month, day });
  }

  function clearPeriod() {
    onChange("");
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
      <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 0 }}>
        <select
          value={parts.year}
          onChange={(e) => handleYearChange(e.target.value)}
          style={selectStyle}
          aria-label={t("periodFilterYear")}
          disabled={years.length === 0}
        >
          <option value="">{t("periodFilterYearPlaceholder")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={parts.month}
          onChange={(e) => handleMonthChange(e.target.value)}
          style={selectStyle}
          aria-label={t("periodFilterMonth")}
          disabled={!parts.year || monthsForYear.length === 0}
        >
          <option value="">{t("periodFilterMonthPlaceholder")}</option>
          {monthsForYear.map((mm) => (
            <option key={mm} value={mm}>
              {t("periodMonthLabel", { month: Number(mm) })}
            </option>
          ))}
        </select>
        <select
          value={parts.day}
          onChange={(e) => handleDayChange(e.target.value)}
          style={selectStyle}
          aria-label={t("periodFilterDay")}
          disabled={!parts.month || daysForMonth.length === 0}
        >
          <option value="">{t("periodFilterDayPlaceholder")}</option>
          {daysForMonth.map((dd) => (
            <option key={dd} value={dd}>
              {t("periodDayLabel", { day: Number(dd) })}
            </option>
          ))}
        </select>
      </div>
      {value && (
        <button
          type="button"
          className="btn-secondary"
          onClick={clearPeriod}
          style={{ minHeight: 38, fontSize: 13, flexShrink: 0, width: "auto" }}
        >
          {t("periodFilterClear")}
        </button>
      )}
    </div>
  );
}
