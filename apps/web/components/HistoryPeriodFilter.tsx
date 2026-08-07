"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "../lib/api";
import type { TranslationKey } from "../lib/i18n/translations";

export type PeriodGranularity = "day" | "month" | "year";
export type HistoryPeriodScope = "trips" | "fuel" | "maintenance";

function inferGranularity(period: string): PeriodGranularity {
  if (/^\d{4}$/.test(period)) return "year";
  if (/^\d{4}-\d{2}$/.test(period)) return "month";
  return "day";
}

/** 단위를 바꿀 때 가능한 범위는 유지하고, 더 세밀한 값은 1일/1월로 채운다. */
function convertPeriod(period: string, to: PeriodGranularity): string {
  if (!period) return "";
  if (to === "year") {
    return /^\d{4}/.test(period) ? period.slice(0, 4) : "";
  }
  if (to === "month") {
    if (/^\d{4}-\d{2}/.test(period)) return period.slice(0, 7);
    if (/^\d{4}$/.test(period)) return "";
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (/^\d{4}$/.test(period)) return `${period}-01-01`;
  return "";
}

/** native date 입력은 형식이 안 맞으면 피커가 깨지므로, 현재 단위에 맞는 값만 넘긴다. */
function displayValueFor(period: string, granularity: PeriodGranularity): string {
  if (!period) return "";
  const converted = convertPeriod(period, granularity);
  if (granularity === "day") return /^\d{4}-\d{2}-\d{2}$/.test(converted) ? converted : "";
  if (granularity === "month") return /^\d{4}-\d{2}$/.test(converted) ? converted : "";
  return /^\d{4}$/.test(converted) ? converted : "";
}

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  width: "100%",
  minHeight: 38,
  height: 38,
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--color-border-light)",
  padding: "0 12px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  paddingRight: 36,
  lineHeight: "38px",
  paddingTop: 0,
  paddingBottom: 0,
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
  const [granularity, setGranularity] = useState<PeriodGranularity>(() =>
    value ? inferGranularity(value) : "day",
  );
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  // 월 모드에서 연만 고르고 월은 아직인 중간 상태
  const [monthYearDraft, setMonthYearDraft] = useState("");

  useEffect(() => {
    if (value) setGranularity(inferGranularity(value));
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/history-periods?scope=${scope}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { years?: string[]; months?: string[] };
      if (cancelled) return;
      setYears(Array.isArray(data.years) ? data.years : []);
      setMonths(Array.isArray(data.months) ? data.months : []);
    }
    loadPeriods();
    return () => {
      cancelled = true;
    };
  }, [vehicleId, scope]);

  // 적용된 값이 있을 때만 연도 칸을 맞춘다. 월을 고르기 전 단계에서는 value가 비어 있는데,
  // 여기서 draft까지 지우면 방금 고른 연도가 사라진다.
  useEffect(() => {
    if (granularity !== "month") return;
    const display = displayValueFor(value, "month");
    if (display) setMonthYearDraft(display.slice(0, 4));
  }, [value, granularity]);

  const displayValue = displayValueFor(value, granularity);
  const monthYear = granularity === "month" ? monthYearDraft || displayValue.slice(0, 4) : "";
  const monthPart = /^\d{4}-\d{2}$/.test(displayValue) ? displayValue.slice(5, 7) : "";

  const monthsForYear = useMemo(() => {
    if (!monthYear) return [] as string[];
    return months
      .filter((ym) => ym.startsWith(`${monthYear}-`))
      .map((ym) => ym.slice(5, 7));
  }, [months, monthYear]);

  function handleGranularity(next: PeriodGranularity) {
    setGranularity(next);
    const converted = convertPeriod(value, next);
    if (next === "month") {
      // 년 → 월로 바꿔도 고르던 연도는 살려둔다 (월만 다시 고르면 된다).
      const carriedYear = /^\d{4}/.exec(value)?.[0] ?? "";
      setMonthYearDraft(converted ? converted.slice(0, 4) : carriedYear);
    }
    onChange(converted);
  }

  function clearPeriod() {
    setMonthYearDraft("");
    onChange("");
  }

  function handleMonthYearChange(year: string) {
    setMonthYearDraft(year);
    // 연만 바뀌면 기존 월이 새 연에 없을 수 있으니 필터를 비운다.
    onChange("");
  }

  function handleMonthPartChange(mm: string) {
    if (!monthYear || !mm) {
      onChange("");
      return;
    }
    onChange(`${monthYear}-${mm}`);
  }

  const options: { value: PeriodGranularity; labelKey: TranslationKey }[] = [
    { value: "day", labelKey: "periodFilterDay" },
    { value: "month", labelKey: "periodFilterMonth" },
    { value: "year", labelKey: "periodFilterYear" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {options.map(({ value: g, labelKey }) => (
          <button
            key={g}
            type="button"
            onClick={() => handleGranularity(g)}
            style={{
              minHeight: 38,
              fontSize: 12,
              padding: "0 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background:
                granularity === g ? "var(--color-primary)" : "var(--color-surface-secondary)",
              color:
                granularity === g
                  ? "var(--color-text-on-primary)"
                  : "var(--color-text-on-secondary)",
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      {granularity === "day" && (
        <input
          type="date"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {granularity === "month" && (
        <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 0 }}>
          <select
            value={monthYear}
            onChange={(e) => handleMonthYearChange(e.target.value)}
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
            value={monthPart}
            onChange={(e) => handleMonthPartChange(e.target.value)}
            style={selectStyle}
            aria-label={t("periodFilterMonth")}
            disabled={!monthYear || monthsForYear.length === 0}
          >
            <option value="">{t("periodFilterMonthPlaceholder")}</option>
            {monthsForYear.map((mm) => (
              <option key={mm} value={mm}>
                {t("periodMonthLabel", { month: Number(mm) })}
              </option>
            ))}
          </select>
        </div>
      )}
      {granularity === "year" && (
        <select
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
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
      )}
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
