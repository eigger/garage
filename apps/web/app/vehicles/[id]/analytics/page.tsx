"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Line,
  ComposedChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch, getToken, API_URL } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { KM_TO_MI } from "../../../../lib/i18n/format";
import type { FuelLog, MaintenanceRecord, Trip, Vehicle } from "../../../../lib/types";
import { computeFuelEfficiencyPoints, efficiencyUnitLabels, fuelVolumeUnit } from "../../../../lib/fuelEfficiency";
import { DownloadIcon } from "../../../../components/icons";

type Period = "all" | "1w" | "1m" | "6m" | "1y";

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, locale, distanceUnit, formatCurrency } = useSettings();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("1m");

  function handleExport(category: "trips" | "maintenance" | "fuel") {
    const token = getToken();
    const url = `${API_URL}/api/vehicles/${vehicleId}/reports/export?category=${category}&period=${period}&lang=${locale}${token ? `&token=${token}` : ""}`;
    window.open(url, "_blank");
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=1000`),
      apiFetch(`/api/vehicles/${vehicleId}/maintenance-records?limit=1000`),
      apiFetch(`/api/trips?vehicleId=${vehicleId}&limit=1000`),
    ]).then(async ([vRes, fRes, mRes, tRes]) => {
      setVehicle(vRes.ok ? await vRes.json() : null);
      setFuelLogs(fRes.ok ? await fRes.json() : []);
      setMaintenanceRecords(mRes.ok ? await mRes.json() : []);
      setTrips(tRes.ok ? await tRes.json() : []);
      setLoading(false);
    });
  }, [vehicleId]);

  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const units = efficiencyUnitLabels(vehicle?.fuelType ?? null);

  const periodStart = useMemo(() => {
    if (period === "all") return null;
    const start = new Date();
    if (period === "1w") start.setDate(start.getDate() - 7);
    else if (period === "1m") start.setMonth(start.getMonth() - 1);
    else if (period === "6m") start.setMonth(start.getMonth() - 6);
    else if (period === "1y") start.setFullYear(start.getFullYear() - 1);
    return start;
  }, [period]);

  const filteredLogs = useMemo(() => {
    if (!periodStart) return fuelLogs;
    return fuelLogs.filter((l) => new Date(l.date) >= periodStart);
  }, [fuelLogs, periodStart]);

  const filteredMaintenance = useMemo(() => {
    if (!periodStart) return maintenanceRecords;
    return maintenanceRecords.filter((m) => new Date(m.date) >= periodStart);
  }, [maintenanceRecords, periodStart]);

  const filteredTrips = useMemo(() => {
    if (!periodStart) return trips;
    return trips.filter((tr) => new Date(tr.startTime) >= periodStart);
  }, [trips, periodStart]);

  // Determine grouping granularity based on period
  const granularity: "day" | "week" | "month" =
    period === "1w" ? "day" : period === "1m" ? "week" : "month";

  // Returns a sortable group key for a given date
  function getGroupKey(d: Date): string {
    if (granularity === "day") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (granularity === "week") {
      // ISO week: Monday-based
      const tmp = new Date(d);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() - ((tmp.getDay() + 6) % 7)); // back to Monday
      return `${tmp.getFullYear()}-${String(tmp.getMonth() + 1).padStart(2, "0")}-${String(tmp.getDate()).padStart(2, "0")}`;
    }
    // month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // Formats a group key into a human-readable X-axis label
  function formatGroupLabel(key: string): string {
    if (granularity === "day") {
      const [y, m, dd] = key.split("-").map(Number);
      return new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(new Date(y, m - 1, dd));
    }
    if (granularity === "week") {
      const [y, m, dd] = key.split("-").map(Number);
      const start = new Date(y, m - 1, dd);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const s = new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(start);
      const e = new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(end);
      return `${s}~${e}`;
    }
    // month
    const [y, mo] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(localeTag, { year: "2-digit", month: "short" }).format(new Date(y, mo - 1, 1));
  }

  const groupedTrips = useMemo(() => {
    const map = new Map<string, { distanceKm: number; count: number }>();
    for (const trip of filteredTrips) {
      const key = getGroupKey(new Date(trip.startTime));
      const entry = map.get(key) ?? { distanceKm: 0, count: 0 };
      entry.distanceKm += trip.distanceKm ?? 0;
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, { distanceKm, count }]) => {
        const distance = distanceUnit === "mi" ? distanceKm * KM_TO_MI : distanceKm;
        return { label: formatGroupLabel(key), distance: Math.round(distance * 10) / 10, count };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrips, granularity, localeTag, distanceUnit]);

  const groupedCost = useMemo(() => {
    const map = new Map<string, { fuel: number; maintenance: number }>();
    for (const log of filteredLogs) {
      const key = getGroupKey(new Date(log.date));
      const entry = map.get(key) ?? { fuel: 0, maintenance: 0 };
      entry.fuel += log.cost;
      map.set(key, entry);
    }
    for (const record of filteredMaintenance) {
      const key = getGroupKey(new Date(record.date));
      const entry = map.get(key) ?? { fuel: 0, maintenance: 0 };
      entry.maintenance += record.cost ?? 0;
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, { fuel, maintenance }]) => ({
        label: formatGroupLabel(key),
        fuel,
        maintenance,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLogs, filteredMaintenance, granularity, localeTag]);

  const totalCostInPeriod = useMemo(
    () =>
      filteredLogs.reduce((sum, l) => sum + l.cost, 0) +
      filteredMaintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [filteredLogs, filteredMaintenance],
  );

  const totalDistanceInPeriod = useMemo(() => {
    const km = filteredTrips.reduce((sum, tr) => sum + (tr.distanceKm ?? 0), 0);
    return distanceUnit === "mi" ? Math.round(km * KM_TO_MI * 10) / 10 : Math.round(km * 10) / 10;
  }, [filteredTrips, distanceUnit]);

  const allEfficiencyPoints = useMemo(() => computeFuelEfficiencyPoints(fuelLogs), [fuelLogs]);
  const filteredEfficiencyPoints = useMemo(
    () => (periodStart ? allEfficiencyPoints.filter((p) => new Date(p.date) >= periodStart) : allEfficiencyPoints),
    [allEfficiencyPoints, periodStart],
  );
  // 단가는 만탱크가 아니어도 매 주유 건마다 나오므로, "데이터가 아예 없다"는
  // 연비 기준(allEfficiencyPoints)이 아니라 주유 기록 자체 기준으로 판단한다.
  const hasAnyFuelData = useMemo(() => fuelLogs.some((l) => l.liters > 0), [fuelLogs]);

  // 연비는 만탱크끼리만 비교 가능해 데이터가 적지만, 단가는 주유 건마다 바로
  // 나오므로 차트를 따로 두지 않고 한 차트에 합쳐서 스크롤을 줄인다 — logId로 맞춰서
  // 연비가 없는 주유 건은 그 지점만 끊기고(null) 단가 선은 계속 이어진다.
  const combinedFuelChartData = useMemo(() => {
    const efficiencyByLogId = new Map(filteredEfficiencyPoints.map((p) => [p.logId, Math.round(p.kmPerLiter * 10) / 10]));
    return filteredLogs
      .filter((l) => l.liters > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((l) => ({
        date: new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(new Date(l.date)),
        efficiency: efficiencyByLogId.get(l.id) ?? null,
        price: Math.round((l.cost / l.liters) * 10) / 10,
      }));
  }, [filteredLogs, filteredEfficiencyPoints, localeTag]);

  // 구간별 연비 비율의 단순 평균이 아니라, 전체 주행거리/전체 주유량으로 계산해야
  // 짧은 구간 하나가 평균을 왜곡하지 않는다.
  const avgEfficiency = useMemo(() => {
    if (filteredEfficiencyPoints.length === 0) return null;
    const totalDistance = filteredEfficiencyPoints.reduce((sum, p) => sum + p.distanceKm, 0);
    const totalLiters = filteredEfficiencyPoints.reduce((sum, p) => sum + p.distanceKm / p.kmPerLiter, 0);
    return totalLiters > 0 ? totalDistance / totalLiters : null;
  }, [filteredEfficiencyPoints]);

  if (loading) {
    return (
      <section>
        <p>{t("loading")}</p>
      </section>
    );
  }

  return (
    <section>
      <div>
        <h1 style={{ margin: "0 0 10px" }}>{t("analyticsHeading")}</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(
            [
              ["1w", "analyticsPeriod1w"],
              ["1m", "analyticsPeriod1m"],
              ["6m", "analyticsPeriod6m"],
              ["1y", "analyticsPeriod1y"],
              ["all", "analyticsPeriodAll"],
            ] as const
          ).map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              style={{
                flex: 1,
                fontSize: 12,
                padding: "5px 4px",
                minHeight: "auto",
                textAlign: "center",
                whiteSpace: "nowrap",
                background: period === value ? "var(--color-primary)" : "var(--color-surface-secondary)",
                color: period === value ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
                borderRadius: 6,
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("analyticsAvgEfficiency")}</div>
            <strong>{avgEfficiency !== null ? `${avgEfficiency.toFixed(1)} ${units.perUnit}` : "-"}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("analyticsTotalDistance")}</div>
            <strong>{totalDistanceInPeriod > 0 ? `${totalDistanceInPeriod} ${distanceUnit}` : "-"}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("analyticsTotalCost")}</div>
            <strong>{formatCurrency(totalCostInPeriod)}</strong>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("analyticsEfficiencyChartTitle")}</h2>
          <button
            type="button"
            onClick={() => handleExport("fuel")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "4px 8px",
              minHeight: "auto",
              background: "var(--color-surface-secondary)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <DownloadIcon size={12} /> {t("exportDownloadButton")}
          </button>
        </div>
        {combinedFuelChartData.length === 0 ? (
          <EmptyState
            title={hasAnyFuelData ? t("analyticsNoDataInPeriod") : t("analyticsEmptyTitle")}
            desc={hasAnyFuelData ? undefined : t("analyticsEmptyDesc")}
          />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={combinedFuelChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} width={36} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} width={44} />
              <Tooltip
                formatter={(value, name, props: any) => {
                  if (value === null || value === undefined) return ["-", name];
                  if (props?.dataKey === "price") {
                    return [`${formatCurrency(Number(value))}/${fuelVolumeUnit(vehicle?.fuelType ?? null)}`, name];
                  }
                  return [`${value} ${units.perUnit}`, name];
                }}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="efficiency"
                name={t("analyticsEfficiencyLegend")}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="price"
                name={t("analyticsFuelPriceLegend")}
                stroke="var(--chart-secondary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("analyticsCostChartTitle")}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => handleExport("fuel")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                padding: "4px 8px",
                minHeight: "auto",
                background: "var(--color-surface-secondary)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <DownloadIcon size={11} /> {t("exportCategoryFuel")}
            </button>
            <button
              type="button"
              onClick={() => handleExport("maintenance")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                padding: "4px 8px",
                minHeight: "auto",
                background: "var(--color-surface-secondary)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <DownloadIcon size={11} /> {t("exportCategoryMaintenance")}
            </button>
          </div>
        </div>
        {groupedCost.length === 0 ? (
          <EmptyState title={t("analyticsNoDataInPeriod")} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={groupedCost} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} width={50} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                cursor={{ fill: "var(--color-text)", fillOpacity: 0.06 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fuel" name={t("analyticsFuelCost")} stackId="cost" fill="var(--color-primary)" maxBarSize={48} />
              <Bar dataKey="maintenance" name={t("analyticsMaintenanceCost")} stackId="cost" fill="var(--chart-secondary)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("analyticsTripChartTitle")}</h2>
          <button
            type="button"
            onClick={() => handleExport("trips")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "4px 8px",
              minHeight: "auto",
              background: "var(--color-surface-secondary)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <DownloadIcon size={12} /> {t("exportDownloadButton")}
          </button>
        </div>
        {groupedTrips.length === 0 ? (
          <EmptyState title={t("analyticsNoDataInPeriod")} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={groupedTrips} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} width={40} />
              <Tooltip
                formatter={(value) => [`${value} ${distanceUnit}`, t("totalDistance")]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                cursor={{ fill: "var(--color-text)", fillOpacity: 0.06 }}
              />
              <Bar dataKey="distance" name={t("totalDistance")} fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </section>
  );
}

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "var(--color-text-muted)" }}>{title}</p>
      {desc && <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted-2)" }}>{desc}</p>}
    </div>
  );
}
