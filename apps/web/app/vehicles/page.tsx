"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { PageLoader } from "../../components/PageLoader";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import { formatItemLabel } from "../../lib/i18n/itemLabel";
import { countScheduleStatuses } from "../../lib/scheduleStatus";
import { AlertIcon } from "../../components/icons";
import type { ConsumablePart, FuelLog, FuelType, Reminder, TripSummary, Vehicle } from "../../lib/types";
import { fuelTypeLabelKey } from "../../lib/fuelType";
import { FUEL_TYPES } from "@garage/shared";

type VehicleCardSummary = {
  odometer: number | null;
  weeklyDistanceKm: number | null;
  lastFuelCost: number | null;
  dueCount: number;
  upcomingCount: number;
};

export default function VehiclesPage() {
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t, formatDistance, formatCurrency } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [vehicleSummary, setVehicleSummary] = useState<Record<string, VehicleCardSummary>>({});
  const [loading, setLoading] = useState(true);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [fuelType, setFuelType] = useState<FuelType | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHub() {
    const [vehiclesRes, remindersRes] = await Promise.all([
      apiFetch("/api/vehicles"),
      apiFetch("/api/reminders"),
    ]);
    const loadedVehicles = (await vehiclesRes.json()) as Vehicle[];
    const loadedReminders = (await remindersRes.json()) as Reminder[];
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

  useEffect(() => {
    if (user) loadHub();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function dismissReminder(id: string) {
    const res = await apiFetch(`/api/reminders/${id}/dismiss`, { method: "POST" });
    if (res.ok) setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleDeleteVehicle(id: string) {
    if (!(await confirm(t("deleteVehicleConfirm")))) return;
    setDeletingVehicleId(id);
    try {
      const res = await apiFetch(`/api/vehicles/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(t("toastDeleted"), "success");
        setLoading(true);
        await loadHub();
      } else {
        showToast(t("toastError"), "error");
      }
    } catch {
      showToast(t("toastError"), "error");
    } finally {
      setDeletingVehicleId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !fuelType) {
      setError(t("requiredField"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name,
          plate: plate || undefined,
          make: make || undefined,
          model: model || undefined,
          year: year ? Number(year) : undefined,
          fuelType: fuelType || undefined,
        }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        showToast(t("toastError"), "error");
        return;
      }
      setName("");
      setPlate("");
      setMake("");
      setModel("");
      setYear("");
      setFuelType("");
      showToast(t("toastCreated"), "success");
      setLoading(true);
      await loadHub();
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (user && loading)) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }

  if (!user) return null;

  const dueReminders = reminders.filter((r) => r.isDue);

  return (
    <main className="container">
      <h1>{t("manageVehicles")}</h1>

      {dueReminders.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 15, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <AlertIcon size={16} filled /> {t("reminderBannerTitle", { count: dueReminders.length })}
          </strong>
          <ul className="list" style={{ marginTop: 8 }}>
            {dueReminders.map((r) => {
              const borderLeftColor = r.isDue ? "var(--badge-red-accent)" : "var(--badge-amber-accent)";
              const backgroundColor = r.isDue ? "var(--badge-red-bg)" : "var(--badge-amber-bg)";
              const borderColor = r.isDue ? "var(--badge-red-border)" : "var(--badge-amber-border)";
              const textColor = r.isDue ? "var(--badge-red-text)" : "var(--badge-amber-text)";
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
                        background: r.isDue ? "var(--badge-red-accent)" : "var(--badge-amber-accent)",
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

      <h2 style={{ margin: "0 0 8px" }}>{t("vehiclesHeading")}</h2>

      {vehicles.length === 0 ? (
        <p>{t("noVehicles")}</p>
      ) : (
        <ul className="list">
          {vehicles.map((v) => {
            const stats = vehicleSummary[v.id];
            const dueCount = stats?.dueCount ?? 0;
            const upcomingCount = stats?.upcomingCount ?? 0;
            const canDelete = isAdmin || v.createdByUserId === user.id;
            return (
              <li key={v.id} className="list-item">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <Link href={`/vehicles/${v.id}`} style={{ flex: 1 }}>
                      {v.name} {v.plate ? `(${v.plate})` : ""}
                      {v.fuelType ? ` · ${t(fuelTypeLabelKey(v.fuelType))}` : ""}
                    </Link>
                    {canDelete && (
                      <button
                        type="button"
                        className="btn-action btn-action-danger"
                        onClick={() => handleDeleteVehicle(v.id)}
                        disabled={deletingVehicleId === v.id}
                      >
                        {t("delete")}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <span>
                      {t("dashboardOdometer")}:{" "}
                      {stats?.odometer !== null && stats?.odometer !== undefined
                        ? formatDistance(stats.odometer)
                        : "-"}
                    </span>
                    <span>
                      {t("dashboardWeeklyDistance")}:{" "}
                      {stats?.weeklyDistanceKm !== null && stats?.weeklyDistanceKm !== undefined
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
                    <Link href={`/vehicles/${v.id}/schedule`} style={{ color: "var(--color-danger)" }}>
                      {t("dashboardDueCount", { count: dueCount })}
                    </Link>
                    <Link href={`/vehicles/${v.id}/schedule`} style={{ color: "var(--badge-amber-text)" }}>
                      {t("dashboardUpcomingCount", { count: upcomingCount })}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 차량 등록은 일반 사용자도 할 수 있다 — 등록하면 그 차량은 자동으로 본인 목록에 들어오고,
          가족과 함께 쓰려면 차량 상세의 "차량 공유"에서 구성원을 추가하면 된다. */}
      <h2>{t("addVehicle")}</h2>
      <form onSubmit={handleSubmit} className="form" noValidate>
        <input
          placeholder={t("vehicleName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder={t("vehiclePlate")}
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
        />
        <input
          placeholder={t("vehicleMake")}
          value={make}
          onChange={(e) => setMake(e.target.value)}
        />
        <input
          placeholder={t("vehicleModel")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <input
          type="number"
          placeholder={t("vehicleYear")}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <select
          value={fuelType}
          onChange={(e) => setFuelType(e.target.value as FuelType | "")}
          required
        >
          <option value="" disabled>
            {t("vehicleFuelType")}
          </option>
          {FUEL_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(fuelTypeLabelKey(ft))}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? t("saving") : t("save")}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </main>
  );
}
