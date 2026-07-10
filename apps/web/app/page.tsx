"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../lib/api";
import { useSettings } from "../lib/i18n/settings-context";
import { useAuth } from "../lib/auth-context";
import { SettingsBar } from "./settings-bar";
import { formatItemLabel } from "../lib/i18n/itemLabel";
import { getLastVehicleId } from "../lib/lastVehicle";
import { countScheduleStatuses } from "../lib/scheduleStatus";
import { AlertIcon } from "../components/icons";
import type { ConsumablePart, FuelLog, Reminder, TripSummary, Vehicle } from "../lib/types";

type VehicleCardSummary = {
  odometer: number | null;
  weeklyDistanceKm: number | null;
  lastFuelCost: number | null;
  dueCount: number;
  upcomingCount: number;
};

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { user, loading: authLoading, requireAuth, logout } = useAuth();
  const { t, formatDistance, formatCurrency } = useSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [vehicleSummary, setVehicleSummary] = useState<Record<string, VehicleCardSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;

    async function load() {
      const [vehiclesRes, remindersRes] = await Promise.all([
        apiFetch("/api/vehicles"),
        apiFetch("/api/reminders"),
      ]);
      const loadedVehicles = (await vehiclesRes.json()) as Vehicle[];
      const loadedReminders = (await remindersRes.json()) as Reminder[];

      // PWA 홈 화면 숏컷("빠른 입력")으로 들어온 경우, 마지막으로 둘러본 차량(없으면 첫 차량)의
      // 빠른 입력 화면으로 바로 이동시킨다.
      if (searchParams.get("shortcut") === "quick-log" && loadedVehicles.length > 0) {
        const lastId = getLastVehicleId();
        const target = loadedVehicles.find((v) => v.id === lastId) ?? loadedVehicles[0];
        router.replace(`/vehicles/${target.id}/quick-log`);
        return;
      }

      setVehicles(loadedVehicles);
      setReminders(loadedReminders);

      const summaries = await Promise.all(
        loadedVehicles.map(async (vehicle) => {
          const [odometerRes, tripSummaryRes, fuelRes, partsRes] = await Promise.all([
            apiFetch(`/api/vehicles/${vehicle.id}/odometer`),
            apiFetch(`/api/trips/summary?vehicleId=${vehicle.id}&period=week`),
            apiFetch(`/api/vehicles/${vehicle.id}/fuel-logs?limit=1`),
            apiFetch(`/api/consumable-parts?vehicleId=${vehicle.id}`),
          ]);

          const odometer = odometerRes.ok ? ((await odometerRes.json()) as { odometer: number }).odometer : null;
          const tripSummary = tripSummaryRes.ok ? ((await tripSummaryRes.json()) as TripSummary) : null;
          const fuelLogs = fuelRes.ok ? ((await fuelRes.json()) as FuelLog[]) : [];
          const parts = partsRes.ok ? ((await partsRes.json()) as ConsumablePart[]) : [];
          // 정비 스케줄 화면과 동일한 기준(1000km/30일 이내=임박)으로 계산해야
          // 대시보드와 스케줄 화면의 지남/임박 건수가 항상 일치한다.
          const { due, upcoming } = countScheduleStatuses(parts, odometer ?? 0);

          return [
            vehicle.id,
            {
              odometer,
              weeklyDistanceKm: tripSummary?.totalDistanceKm ?? null,
              lastFuelCost: fuelLogs[0]?.cost ?? null,
              dueCount: due,
              upcomingCount: upcoming,
            },
          ] as const;
        }),
      );
      setVehicleSummary(Object.fromEntries(summaries));
      setLoading(false);
    }

    load();
  }, [user]);

  const dueReminders = reminders.filter((r) => r.isDue);

  async function dismissReminder(id: string) {
    const res = await apiFetch(`/api/reminders/${id}/dismiss`, { method: "POST" });
    if (res.ok) setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  if (authLoading || (user && loading)) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="container">
      <SettingsBar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("appTitle")}</h1>
        <button onClick={logout} style={{ background: "transparent", color: "#18523f", minHeight: 32 }}>
          {t("logout")}
        </button>
      </div>
      <p>{t("appTagline")}</p>

      {dueReminders.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 15, color: "#1f2937", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <AlertIcon size={16} filled /> {t("reminderBannerTitle", { count: dueReminders.length })}
          </strong>
          <ul className="list" style={{ marginTop: 8 }}>
            {dueReminders.map((r) => {
              const borderLeftColor = r.isDue ? "#ef4444" : "#f59e0b";
              const backgroundColor = r.isDue ? "#fef2f2" : "#fffbeb";
              const borderColor = r.isDue ? "#fee2e2" : "#fef3c7";
              const textColor = r.isDue ? "#991b1b" : "#92400e";
              return (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    backgroundColor,
                    border: `1px solid ${borderColor}`,
                    borderLeft: `4px solid ${borderLeftColor}`,
                    borderRadius: 8,
                    fontSize: 14,
                    color: textColor,
                  }}
                >
                  <span style={{ fontWeight: "500", display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertIcon size={16} filled={r.isDue} />
                    <span>
                      {t("reminderItemDue", { vehicle: r.vehicleName, type: formatItemLabel(t, r.type) })}
                      {r.dueOdometer !== null && (
                        <>
                          {" — "}
                          {t("reminderDueOdometer", { distance: formatDistance(r.dueOdometer) })}
                        </>
                      )}
                    </span>
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                    <button
                      type="button"
                      style={{
                        minHeight: 28,
                        height: 28,
                        padding: "0 8px",
                        fontSize: 12,
                        borderRadius: 6,
                        background: r.isDue ? "#ef4444" : "#f59e0b",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onClick={() => dismissReminder(r.id)}
                    >
                      {t("dismissReminder")}
                    </button>
                    <Link href={`/vehicles/${r.vehicleId}/schedule`} style={{ fontSize: 12, textDecoration: "underline", color: textColor }}>
                      {t("reminderGoSchedule")}
                    </Link>
                    <Link
                      href={`/vehicles/${r.vehicleId}/quick-log?tab=maintenance&type=${encodeURIComponent(r.type)}`}
                      style={{ fontSize: 12, textDecoration: "underline", color: textColor }}
                    >
                      {t("reminderGoQuickLog")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: "24px 0 8px" }}>{t("vehiclesHeading")}</h2>
        {user.role === "ADMIN" && (
          <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/vehicles">{t("manageVehicles")}</Link>
            <Link href="/users">{t("manageUsers")}</Link>
            <Link href="/maintenance-presets">{t("presetsHeading")}</Link>
            <Link href="/integrations">{t("navIntegrations")}</Link>
          </span>
        )}
      </div>

      {vehicles.length === 0 ? (
        <p>{t("noVehicles")}</p>
      ) : (
        <ul className="list">
          {vehicles.map((v) => (
            <li key={v.id} className="list-item">
              {(() => {
                const stats = vehicleSummary[v.id];
                const dueCount = stats?.dueCount ?? 0;
                const upcomingCount = stats?.upcomingCount ?? 0;
                return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Link href={`/vehicles/${v.id}`}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </Link>
                <div style={{ fontSize: 13, color: "#666", display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <span>
                    {t("dashboardOdometer")}:{" "}
                    {stats?.odometer !== null && stats?.odometer !== undefined
                      ? formatDistance(stats.odometer)
                      : "-"}
                  </span>
                  <span>
                    {t("dashboardWeeklyDistance")}:{" "}
                    {stats?.weeklyDistanceKm !== null &&
                    stats?.weeklyDistanceKm !== undefined
                      ? formatDistance(stats.weeklyDistanceKm)
                      : "-"}
                  </span>
                  <span>
                    {t("dashboardLastFuelCost")}:{" "}
                    {stats?.lastFuelCost !== null && stats?.lastFuelCost !== undefined
                      ? formatCurrency(stats.lastFuelCost)
                      : "-"}
                  </span>
                </div>
                <div style={{ fontSize: 12, display: "flex", gap: 8 }}>
                  <Link href={`/vehicles/${v.id}/schedule`} style={{ color: "#a12a24" }}>
                    {t("dashboardDueCount", { count: dueCount })}
                  </Link>
                  <Link href={`/vehicles/${v.id}/schedule`} style={{ color: "#8b6d1e" }}>
                    {t("dashboardUpcomingCount", { count: upcomingCount })}
                  </Link>
                </div>
              </div>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
