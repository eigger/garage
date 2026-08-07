"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TranslationKey } from "../lib/i18n/translations";

export type PeriodGranularity = "day" | "month" | "year";

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
    if (/^\d{4}$/.test(period)) return `${period}-01`;
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (/^\d{4}$/.test(period)) return `${period}-01-01`;
  return "";
}

/** native date/month 입력은 형식이 안 맞으면 피커가 깨지므로, 현재 단위에 맞는 값만 넘긴다. */
function displayValueFor(period: string, granularity: PeriodGranularity): string {
  if (!period) return "";
  const converted = convertPeriod(period, granularity);
  if (granularity === "day") return /^\d{4}-\d{2}-\d{2}$/.test(converted) ? converted : "";
  if (granularity === "month") return /^\d{4}-\d{2}$/.test(converted) ? converted : "";
  return /^\d{4}$/.test(converted) ? converted : "";
}

function buildYearOptions(): number[] {
  const current = new Date().getFullYear();
  const start = 2000;
  const end = Math.max(current + 1, 2100);
  const years: number[] = [];
  for (let y = end; y >= start; y -= 1) years.push(y);
  return years;
}

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 140,
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

export function HistoryPeriodFilter({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (period: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const [granularity, setGranularity] = useState<PeriodGranularity>(() =>
    value ? inferGranularity(value) : "day",
  );

  useEffect(() => {
    if (value) setGranularity(inferGranularity(value));
  }, [value]);

  const displayValue = displayValueFor(value, granularity);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  function handleGranularity(next: PeriodGranularity) {
    setGranularity(next);
    onChange(convertPeriod(value, next));
  }

  function clearPeriod() {
    onChange("");
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
        <input
          type="month"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {granularity === "year" && (
        <select
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            paddingRight: 36,
            // globals.css select 규칙(height:48)을 이 필터 행 높이에 맞춘다.
            height: 38,
            minHeight: 38,
            lineHeight: "38px",
            paddingTop: 0,
            paddingBottom: 0,
          }}
          aria-label={t("periodFilterYear")}
        >
          <option value="">{YYYY}</option>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>
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
