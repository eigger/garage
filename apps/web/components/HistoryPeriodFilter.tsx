"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

const inputStyle: CSSProperties = {
  minHeight: 38,
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--color-border-light)",
  padding: "0 12px",
  outline: "none",
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
  const [yearDraft, setYearDraft] = useState(value);

  useEffect(() => {
    if (value) setGranularity(inferGranularity(value));
  }, [value]);

  useEffect(() => {
    if (granularity === "year") setYearDraft(value);
  }, [value, granularity]);

  function handleGranularity(next: PeriodGranularity) {
    setGranularity(next);
    onChange(convertPeriod(value, next));
  }

  const options: { value: PeriodGranularity; labelKey: TranslationKey }[] = [
    { value: "day", labelKey: "periodFilterDay" },
    { value: "month", labelKey: "periodFilterMonth" },
    { value: "year", labelKey: "periodFilterYear" },
  ];

  return (
    <>
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {granularity === "month" && (
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {granularity === "year" && (
        <input
          type="number"
          min={2000}
          max={2100}
          placeholder="YYYY"
          value={yearDraft}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYearDraft(next);
            if (next.length === 0 || next.length === 4) onChange(next);
          }}
          style={{ ...inputStyle, width: 96 }}
        />
      )}
      {value && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange("")}
          style={{ minHeight: 38, fontSize: 13, flexShrink: 0 }}
        >
          {t("periodFilterClear")}
        </button>
      )}
    </>
  );
}
