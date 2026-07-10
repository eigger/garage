"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { KM_TO_MI } from "../../../../lib/i18n/format";
import type { FuelLog, MaintenanceRecord, Vehicle } from "../../../../lib/types";
import { computeFuelEfficiencyPoints, efficiencyUnitLabels } from "../../../../lib/fuelEfficiency";

type Period = "all" | "6m" | "1y";

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, locale, distanceUnit, formatCurrency } = useSettings();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=1000`),
      apiFetch(`/api/vehicles/${vehicleId}/maintenance-records?limit=1000`),
    ]).then(async ([vRes, fRes, mRes]) => {
      setVehicle(vRes.ok ? await vRes.json() : null);
      setFuelLogs(fRes.ok ? await fRes.json() : []);
      setMaintenanceRecords(mRes.ok ? await mRes.json() : []);
      setLoading(false);
    });
  }, [vehicleId]);

  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const units = efficiencyUnitLabels(vehicle?.fuelType ?? null);

  const periodStart = useMemo(() => {
    if (period === "all") return null;
    const start = new Date();
    start.setMonth(start.getMonth() - (period === "6m" ? 6 : 12));
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

  const allEfficiencyPoints = useMemo(() => computeFuelEfficiencyPoints(fuelLogs), [fuelLogs]);
  const filteredEfficiencyPoints = useMemo(
    () => (periodStart ? allEfficiencyPoints.filter((p) => new Date(p.date) >= periodStart) : allEfficiencyPoints),
    [allEfficiencyPoints, periodStart],
  );

  const efficiencyChartData = useMemo(
    () =>
      filteredEfficiencyPoints.map((p) => ({
        date: new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(new Date(p.date)),
        value: Math.round(p.kmPerLiter * 10) / 10,
      })),
    [filteredEfficiencyPoints, localeTag],
  );

  // 구간별 연비 비율의 단순 평균이 아니라, 전체 주행거리/전체 주유량으로 계산해야
  // 짧은 구간 하나가 평균을 왜곡하지 않는다.
  const avgEfficiency = useMemo(() => {
    if (filteredEfficiencyPoints.length === 0) return null;
    const totalDistance = filteredEfficiencyPoints.reduce((sum, p) => sum + p.distanceKm, 0);
    const totalLiters = filteredEfficiencyPoints.reduce((sum, p) => sum + p.distanceKm / p.kmPerLiter, 0);
    return totalLiters > 0 ? totalDistance / totalLiters : null;
  }, [filteredEfficiencyPoints]);

  const monthlyCost = useMemo(() => {
    const map = new Map<string, { fuel: number; maintenance: number }>();
    for (const log of filteredLogs) {
      const d = new Date(log.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key) ?? { fuel: 0, maintenance: 0 };
      entry.fuel += log.cost;
      map.set(key, entry);
    }
    for (const record of filteredMaintenance) {
      const d = new Date(record.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key) ?? { fuel: 0, maintenance: 0 };
      entry.maintenance += record.cost ?? 0;
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, { fuel, maintenance }]) => {
        const [y, m] = key.split("-").map(Number);
        const month = new Intl.DateTimeFormat(localeTag, { year: "2-digit", month: "short" }).format(
          new Date(y, m - 1, 1),
        );
        return { month, fuel, maintenance };
      });
  }, [filteredLogs, filteredMaintenance, localeTag]);

  const thisMonthCost = useMemo(() => {
    const now = new Date();
    const isThisMonth = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };
    const fuelSum = fuelLogs.filter((l) => isThisMonth(l.date)).reduce((sum, l) => sum + l.cost, 0);
    const maintenanceSum = maintenanceRecords
      .filter((m) => isThisMonth(m.date))
      .reduce((sum, m) => sum + (m.cost ?? 0), 0);
    return fuelSum + maintenanceSum;
  }, [fuelLogs, maintenanceRecords]);

  const totalCostInPeriod = useMemo(
    () =>
      filteredLogs.reduce((sum, l) => sum + l.cost, 0) +
      filteredMaintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [filteredLogs, filteredMaintenance],
  );

  const periodDistanceKm = useMemo(() => {
    const odometers = [...filteredLogs.map((l) => l.odometer), ...filteredMaintenance.map((m) => m.odometer)];
    if (odometers.length < 2) return 0;
    return Math.max(...odometers) - Math.min(...odometers);
  }, [filteredLogs, filteredMaintenance]);

  const costPerDistance = useMemo(() => {
    if (periodDistanceKm <= 0) return null;
    const distanceInUnit = distanceUnit === "mi" ? periodDistanceKm * KM_TO_MI : periodDistanceKm;
    return totalCostInPeriod / distanceInUnit;
  }, [periodDistanceKm, totalCostInPeriod, distanceUnit]);

  if (loading) {
    return (
      <section>
        <p>{t("loading")}</p>
      </section>
    );
  }

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>{t("analyticsHeading")}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["all", "analyticsPeriodAll"],
              ["6m", "analyticsPeriod6m"],
              ["1y", "analyticsPeriod1y"],
            ] as const
          ).map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                minHeight: "auto",
                background: period === value ? "#18523f" : "#eee",
                color: period === value ? "#fff" : "#333",
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
            <div style={{ fontSize: 12, color: "#666" }}>{t("analyticsAvgEfficiency")}</div>
            <strong>{avgEfficiency !== null ? `${avgEfficiency.toFixed(1)} ${units.perUnit}` : "-"}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("analyticsThisMonthCost")}</div>
            <strong>{formatCurrency(thisMonthCost)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("analyticsTotalCost")}</div>
            <strong>{formatCurrency(totalCostInPeriod)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("analyticsCostPerDistance")}</div>
            <strong>{costPerDistance !== null ? `${formatCurrency(costPerDistance)}/${distanceUnit}` : "-"}</strong>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{t("analyticsEfficiencyChartTitle")}</h2>
        {filteredEfficiencyPoints.length === 0 ? (
          <EmptyState
            title={allEfficiencyPoints.length === 0 ? t("analyticsEmptyTitle") : t("analyticsNoDataInPeriod")}
            desc={allEfficiencyPoints.length === 0 ? t("analyticsEmptyDesc") : undefined}
          />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={efficiencyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#666" }} />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} width={40} />
              <Tooltip
                formatter={(value) => [`${value} ${units.perUnit}`, ""]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="value" stroke="#18523f" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{t("analyticsCostChartTitle")}</h2>
        {monthlyCost.length === 0 ? (
          <EmptyState title={t("analyticsNoDataInPeriod")} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyCost} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#666" }} />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} width={50} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fuel" name={t("analyticsFuelCost")} stackId="cost" fill="#18523f" />
              <Bar dataKey="maintenance" name={t("analyticsMaintenanceCost")} stackId="cost" fill="#2f6690" radius={[4, 4, 0, 0]} />
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
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#666" }}>{title}</p>
      {desc && <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{desc}</p>}
    </div>
  );
}
