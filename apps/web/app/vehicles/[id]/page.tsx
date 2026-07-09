"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, uploadFileWithProgress, API_URL } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSettings } from "../../../lib/i18n/settings-context";
import { useToast } from "../../../lib/toast-context";
import { useConfirm } from "../../../lib/confirm-context";
import type { ConsumablePart, FuelType, Reminder, TripSummary, Vehicle } from "../../../lib/types";
import { fuelTypeLabelKey } from "../../../lib/fuelType";
import { formatItemLabel } from "../../../lib/i18n/itemLabel";
import { FUEL_TYPES } from "@garage/shared";
import { useMapProviders } from "../../../lib/maps/useMapProviders";
import { pickDefaultProvider } from "../../../lib/maps/types";
import dynamic from "next/dynamic";
import { NavLaunchButtons } from "../../../components/NavLaunchButtons";

const LastLocationMap = dynamic(
  () => import("../../../components/maps/LastLocationMap").then((m) => ({ default: m.LastLocationMap })),
  { ssr: false }
);

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatRelativeTime(dateStr: string, t: any): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t("justNow");
  if (diffMins < 60) return `${diffMins}분 전`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

export default function VehicleOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vehicleId = params.id;
  const { isAdmin } = useAuth();
  const { t, formatDistance, formatCurrency, locale } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const mapConfig = useMapProviders();
  const mapProvider = pickDefaultProvider(mapConfig);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const isRecent = vehicle && vehicle.locationUpdatedAt
    ? (new Date().getTime() - new Date(vehicle.locationUpdatedAt).getTime()) < 300000
    : false;
  const isDriving = isRecent && vehicle && vehicle.speed !== null && vehicle.speed !== undefined && vehicle.speed > 0;
  const isStopped = isRecent && !isDriving;
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [monthFuelCost, setMonthFuelCost] = useState(0);
  const [monthMaintenanceCost, setMonthMaintenanceCost] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit States
  const [editing, setEditing] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [tireSize, setTireSize] = useState("");
  const [batteryCapacity, setBatteryCapacity] = useState("");
  const [odometer, setOdometer] = useState("");
  const [regFile, setRegFile] = useState<File | null>(null);
  const [savingState, setSavingState] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deleteVehicleError, setDeleteVehicleError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  async function load() {
    const [vehicleRes, remindersRes, summaryRes, partsRes, odoRes, fuelRes, maintenanceRes] = await Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch("/api/reminders"),
      apiFetch(`/api/trips/summary?vehicleId=${vehicleId}&period=week`),
      apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/odometer`),
      apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=500`),
      apiFetch(`/api/vehicles/${vehicleId}/maintenance-records?limit=500`),
    ]);
    if (vehicleRes.ok) {
      const vData = await vehicleRes.json();
      setVehicle(vData);
      setMake(vData.make || "");
      setModel(vData.model || "");
      setPlate(vData.plate || "");
      setYear(vData.year ? String(vData.year) : "");
      setVin(vData.vin || "");
      setTireSize(vData.tireSize || "");
      setBatteryCapacity(vData.batteryCapacity || "");
      setOdometer(vData.odometer ? String(vData.odometer) : "0");
    }
    if (remindersRes.ok) {
      const all: Reminder[] = await remindersRes.json();
      setReminders(all.filter((r) => r.vehicleId === vehicleId && r.isDue));
    }
    if (summaryRes.ok) setSummary(await summaryRes.json());
    if (fuelRes.ok && maintenanceRes.ok) {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const fuelLogs = (await fuelRes.json()) as { date: string; cost: number }[];
      const maintenanceRecords = (await maintenanceRes.json()) as { date: string; cost: number | null }[];
      const fuelCost = fuelLogs
        .filter((log) => new Date(log.date) >= start)
        .reduce((sum, log) => sum + log.cost, 0);
      const maintenanceCost = maintenanceRecords
        .filter((record) => new Date(record.date) >= start)
        .reduce((sum, record) => sum + (record.cost ?? 0), 0);
      setMonthFuelCost(fuelCost);
      setMonthMaintenanceCost(maintenanceCost);
    }

    if (partsRes.ok && odoRes.ok) {
      const parts: ConsumablePart[] = await partsRes.json();
      const odometer = (await odoRes.json()).odometer as number;
      let due = 0;
      let upcoming = 0;
      for (const part of parts) {
        const dueOdometer = part.expectedLifeKm ? part.installedOdometer + part.expectedLifeKm : null;
        const dueDate = part.expectedLifeMonths
          ? addMonths(new Date(part.installedDate), part.expectedLifeMonths)
          : null;
        const remainingKm = dueOdometer !== null ? dueOdometer - odometer : null;
        const remainingDays = dueDate !== null ? (dueDate.getTime() - Date.now()) / 86400000 : null;
        const isDue = (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
        const isUpcoming =
          !isDue &&
          ((remainingKm !== null && remainingKm <= 1000) || (remainingDays !== null && remainingDays <= 30));
        if (isDue) due++;
        else if (isUpcoming) upcoming++;
      }
      setDueCount(due);
      setUpcomingCount(upcoming);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeleteVehicle() {
    if (!(await confirm(t("deleteVehicleConfirm")))) return;
    setDeletingVehicle(true);
    setDeleteVehicleError("");
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}`, { method: "DELETE" });
      if (res.ok) {
        showToast(t("toastDeleted"), "success");
        router.push("/vehicles");
      } else {
        setDeleteVehicleError(t("deleteError"));
        showToast(t("toastError"), "error");
      }
    } catch {
      setDeleteVehicleError(t("connectionError"));
      showToast(t("toastError"), "error");
    } finally {
      setDeletingVehicle(false);
    }
  }

  async function dismissReminder(id: string) {
    const res = await apiFetch(`/api/reminders/${id}/dismiss`, { method: "POST" });
    if (res.ok) setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  async function setFuelType(fuelType: FuelType) {
    const res = await apiFetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH",
      body: JSON.stringify({ fuelType }),
    });
    if (res.ok) window.location.reload();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingState(true);
    setSaveError("");
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          make: make || null,
          model: model || null,
          plate: plate || null,
          year: year ? Number(year) : null,
          vin: vin || null,
          tireSize: tireSize || null,
          batteryCapacity: batteryCapacity || null,
          odometer: odometer ? Number(odometer) : 0,
        }),
      });

      if (res.ok) {
        if (regFile) {
          const formData = new FormData();
          formData.append("file", regFile);
          setUploadProgress(0);
          await uploadFileWithProgress(`/api/attachments?vehicleId=${vehicleId}`, formData, setUploadProgress);
          setUploadProgress(null);
        }
        setEditing(false);
        setRegFile(null);
        showToast(t("toastSaved"), "success");
        load();
      } else {
        setSaveError(t("saveError"));
        showToast(t("toastError"), "error");
      }
    } catch {
      setSaveError(t("connectionError"));
      showToast(t("toastError"), "error");
    } finally {
      setSavingState(false);
    }
  }

  if (loading) return <p>{t("loading")}</p>;

  const regCertificate = vehicle?.attachments?.find((att) => att.vehicleId === vehicleId);

  return (
    <>
      {isAdmin && vehicle && !vehicle.fuelType && (
        <section className="reminder-banner">
          <strong>{t("fuelTypeMissingTitle")}</strong>
          <p style={{ margin: "4px 0 8px" }}>{t("fuelTypeMissingBody")}</p>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && setFuelType(e.target.value as FuelType)}
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
        </section>
      )}

      {reminders.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 15, color: "#1f2937", display: "block", marginBottom: 8 }}>
            🚨 {t("reminderBannerTitle", { count: reminders.length })}
          </strong>
          <ul className="list" style={{ marginTop: 8 }}>
            {reminders.map((r) => {
              const borderLeftColor = r.isDue ? "#ef4444" : "#f59e0b";
              const backgroundColor = r.isDue ? "#fef2f2" : "#fffbeb";
              const borderColor = r.isDue ? "#fee2e2" : "#fef3c7";
              const textColor = r.isDue ? "#991b1b" : "#92400e";
              return (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "12px",
                    backgroundColor,
                    border: `1px solid ${borderColor}`,
                    borderLeft: `4px solid ${borderLeftColor}`,
                    borderRadius: 8,
                    fontSize: 14,
                    color: textColor,
                  }}
                >
                  <span style={{ fontWeight: "600", display: "flex", alignItems: "flex-start", gap: 6, lineHeight: "1.4" }}>
                    <span style={{ flexShrink: 0 }}>{r.isDue ? "🚨" : "⚠️"}</span>
                    <span style={{ wordBreak: "break-all" }}>
                      {formatItemLabel(t, r.type)}
                      {r.dueOdometer !== null && (
                        <>
                          {" — "}
                          {t("reminderDueOdometer", { distance: formatDistance(r.dueOdometer) })}
                        </>
                      )}
                    </span>
                  </span>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px dashed rgba(0,0,0,0.06)", paddingTop: 8 }}>
                    <button
                      type="button"
                      style={{
                        minHeight: 28,
                        height: 28,
                        padding: "0 10px",
                        fontSize: 12,
                        borderRadius: 6,
                        background: r.isDue ? "#ef4444" : "#f59e0b",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: "600",
                      }}
                      onClick={() => dismissReminder(r.id)}
                    >
                      {t("dismissReminder")}
                    </button>
                    <Link href={`/vehicles/${vehicleId}/schedule`} style={{ fontSize: 12, fontWeight: "500", textDecoration: "underline", color: textColor }}>
                      {t("reminderGoSchedule")}
                    </Link>
                    <Link href={`/vehicles/${vehicleId}/quick-log`} style={{ fontSize: 12, fontWeight: "500", textDecoration: "underline", color: textColor }}>
                      {t("reminderGoQuickLog")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={`/vehicles/${vehicleId}/quick-log`} className="card" style={{ flex: "1 1 140px", textDecoration: "none" }}>
          <div style={{ fontSize: 13, color: "#666" }}>{t("navQuickLog")}</div>
          <strong style={{ color: "#18523f" }}>{t("quickLogHeading")} →</strong>
        </Link>

        <Link href={`/vehicles/${vehicleId}/schedule`} className="card" style={{ flex: "1 1 140px", textDecoration: "none" }}>
          <div style={{ fontSize: 13, color: "#666" }}>{t("navSchedule")}</div>
          <strong style={{ color: dueCount > 0 ? "#a12a24" : "#18523f" }}>
            {dueCount > 0
              ? `${t("scheduleDueBadge")} ${dueCount}`
              : upcomingCount > 0
                ? `${t("scheduleUpcomingBadge")} ${upcomingCount}`
                : t("scheduleOkBadge")}
          </strong>
        </Link>

        <Link href={`/vehicles/${vehicleId}/history`} className="card" style={{ flex: "1 1 140px", textDecoration: "none" }}>
          <div style={{ fontSize: 13, color: "#666" }}>{t("totalDistance")} ({t("tripPeriodWeek")})</div>
          <strong style={{ color: "#18523f" }}>
            {summary ? formatDistance(summary.totalDistanceKm) : "-"}
          </strong>
        </Link>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>{t("monthlyCostSummary")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("monthlyFuelCost")}</div>
            <strong>{formatCurrency(monthFuelCost)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("monthlyMaintenanceCost")}</div>
            <strong>{formatCurrency(monthMaintenanceCost)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("monthlyTotalCost")}</div>
            <strong>{formatCurrency(monthFuelCost + monthMaintenanceCost)}</strong>
          </div>
        </div>
      </section>

      {/* Vehicle Metadata & Registration Certificate Card */}
      {vehicle && (
        <section className="card" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{t("vehiclesHeading")}</h2>
            {isAdmin && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditing((prev) => !prev);
                    setSaveError("");
                  }}
                  style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto", background: editing ? "#eee" : "#18523f", color: editing ? "#333" : "#fff" }}
                >
                  {editing ? t("cancel") : t("edit")}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVehicle}
                  disabled={deletingVehicle}
                  style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto", background: "#a12a24", color: "#fff" }}
                >
                  {t("delete")}
                </button>
              </div>
            )}
          </div>
          {deleteVehicleError && (
            <p style={{ color: "#a12a24", fontSize: 13, margin: "0 0 8px" }}>{deleteVehicleError}</p>
          )}

          {editing ? (
            <form onSubmit={handleSave} className="form" style={{ marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleMake")}</label>
                  <input
                    placeholder={t("vehicleMake")}
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleModel")}</label>
                  <input
                    placeholder={t("vehicleModel")}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehiclePlate")}</label>
                  <input
                    placeholder={t("vehiclePlate")}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleYear")}</label>
                  <input
                    type="number"
                    placeholder={t("vehicleYear")}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleVin")}</label>
                <input
                  placeholder={t("vehicleVin")}
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleTireSize")}</label>
                  <input
                    placeholder="205/55R16"
                    value={tireSize}
                    onChange={(e) => setTireSize(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("vehicleBatteryCapacity")}</label>
                  <input
                    placeholder="77.4 kWh"
                    value={batteryCapacity}
                    onChange={(e) => setBatteryCapacity(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: "600", color: "#666" }}>{t("dashboardOdometer")}</label>
                <input
                  type="number"
                  placeholder={t("dashboardOdometer")}
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>
                  {t("registrationCertificate")}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setRegFile(e.target.files?.[0] || null)}
                  style={{ minHeight: "auto", padding: "4px 8px" }}
                />
                {uploadProgress !== null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div className="upload-progress-track">
                      <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span style={{ fontSize: 12, color: "#666" }}>{t("uploading")} {uploadProgress}%</span>
                  </div>
                )}
              </div>

              {saveError && <p style={{ color: "red", fontSize: 13, margin: "8px 0 0" }}>{saveError}</p>}

              <button type="submit" disabled={savingState} style={{ marginTop: 16 }}>
                {savingState ? t("saving") : t("save")}
              </button>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                <div><strong>{t("vehicleMake")} / {t("vehicleModel")}:</strong> {vehicle.make || "-"} / {vehicle.model || "-"}</div>
                <div><strong>{t("vehiclePlate")}:</strong> {vehicle.plate || "-"}</div>
                <div><strong>{t("vehicleYear")}:</strong> {vehicle.year || "-"}</div>
                <div><strong>{t("vehicleFuelType")}:</strong> {vehicle.fuelType ? t(fuelTypeLabelKey(vehicle.fuelType)) : "-"}</div>
                <div><strong>{t("dashboardOdometer")}:</strong> {vehicle.odometer !== null && vehicle.odometer !== undefined ? formatDistance(vehicle.odometer) : "-"}</div>
                <div><strong>{t("fuelLevel")}:</strong> {vehicle.fuelLevel !== null && vehicle.fuelLevel !== undefined ? `${vehicle.fuelLevel.toFixed(1)}%` : "-"}</div>
              </div>
              <div style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4, wordBreak: "break-all" }}>
                <strong>{t("vehicleVin")}:</strong> <span style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>{vehicle.vin || "-"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4 }}>
                <div><strong>{t("vehicleTireSize")}:</strong> {vehicle.tireSize || "-"}</div>
                <div><strong>{t("vehicleBatteryCapacity")}:</strong> {vehicle.batteryCapacity || "-"}</div>
              </div>
              <div style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4 }}>
                <strong>{t("registrationCertificate")}:</strong>{" "}
                {regCertificate ? (
                  <a
                    href={`${API_URL}/api/attachments/file/${regCertificate.filePath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#18523f", textDecoration: "underline", fontWeight: "600" }}
                  >
                    📎 {t("registrationCertificate")} ({regCertificate.mimeType.split("/")[1]?.toUpperCase() || "FILE"})
                  </a>
                ) : (
                  <span style={{ color: "#999" }}>미등록 (Not registered)</span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {vehicle && vehicle.latitude !== null && vehicle.latitude !== undefined && vehicle.longitude !== null && vehicle.longitude !== undefined && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: "600", marginTop: 0, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📍 {t("lastKnownLocation")}</span>
            {vehicle.locationUpdatedAt && (
              <span style={{ fontSize: 12, fontWeight: "normal", color: "#666" }}>
                {t("locationUpdatedAtLabel", {
                  time: new Date(vehicle.locationUpdatedAt).toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </span>
            )}
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: isDriving ? "#10b981" : isStopped ? "#3b82f6" : "#6b7280",
                animation: isDriving ? "statusPulse 1.5s infinite ease-in-out" : "none",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: "600", color: isDriving ? "#047857" : isStopped ? "#1d4ed8" : "#374151" }}>
              {isDriving
                ? t("statusDriving")
                : isStopped
                ? t("statusStopped")
                : `${t("statusParked")} (${formatRelativeTime(vehicle.locationUpdatedAt || "", t)})`}
            </span>
            <style>{`
              @keyframes statusPulse {
                0% { transform: scale(0.9); opacity: 0.6; }
                50% { transform: scale(1.2); opacity: 1; }
                100% { transform: scale(0.9); opacity: 0.6; }
              }
            `}</style>
          </div>

          <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <LastLocationMap
              lat={vehicle.latitude}
              lon={vehicle.longitude}
              provider={mapProvider}
              kakaoAppKey={mapConfig.kakaoAppKey}
              naverClientId={mapConfig.naverClientId}
              tmapAppKey={mapConfig.tmapAppKey}
            />
          </div>
          <NavLaunchButtons
            destination={{ lat: vehicle.latitude, lon: vehicle.longitude, name: t("lastKnownLocation") }}
            heading={t("navLaunchHeading")}
            labels={{
              tmap: t("navLaunchTmap"),
              kakao: t("navLaunchKakao"),
              naver: t("navLaunchNaver"),
            }}
          />
        </section>
      )}
    </>
  );
}
