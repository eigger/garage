"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, uploadFileWithProgress, API_URL, getToken } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSettings } from "../../../lib/i18n/settings-context";
import { useToast } from "../../../lib/toast-context";
import { useConfirm } from "../../../lib/confirm-context";
import type { FuelType, TripSummary, Vehicle, VehicleGamification } from "../../../lib/types";
import { fuelTypeLabelKey } from "../../../lib/fuelType";
import { FUEL_TYPES } from "@garage/shared";
import { useMapProviders } from "../../../lib/maps/useMapProviders";
import { pickDefaultProvider } from "../../../lib/maps/types";
import { PaperclipIcon, MapPinIcon } from "../../../components/icons";
import { LevelCard } from "../../../components/LevelCard";
import { formatDuration } from "../../../lib/duration";
import dynamic from "next/dynamic";

const LastLocationMap = dynamic(
  () => import("../../../components/maps/LastLocationMap").then((m) => ({ default: m.LastLocationMap })),
  { ssr: false }
);

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
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [monthFuelCost, setMonthFuelCost] = useState(0);
  const [monthMaintenanceCost, setMonthMaintenanceCost] = useState(0);
  const [gamification, setGamification] = useState<VehicleGamification | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

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
    const [vehicleRes, summaryRes, fuelRes, maintenanceRes, gamificationRes] = await Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch(`/api/trips/summary?vehicleId=${vehicleId}&period=week`),
      apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=500`),
      apiFetch(`/api/vehicles/${vehicleId}/maintenance-records?limit=500`),
      apiFetch(`/api/vehicles/${vehicleId}/gamification`),
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
    if (summaryRes.ok) setSummary(await summaryRes.json());
    if (gamificationRes.ok) setGamification(await gamificationRes.json());
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

      {gamification && <LevelCard data={gamification} />}

      <Link href={`/vehicles/${vehicleId}/history`} className="card" style={{ display: "block", textDecoration: "none", marginTop: 16 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
          {t("tripPeriodWeek")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("totalDistance")}</div>
            <strong style={{ color: "var(--color-primary)" }}>
              {summary ? formatDistance(summary.totalDistanceKm) : "-"}
            </strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("totalDuration")}</div>
            <strong style={{ color: "var(--color-primary)" }}>
              {summary ? formatDuration(summary.totalDurationSec, t) : "-"}
            </strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("tripCountLabel")}</div>
            <strong style={{ color: "var(--color-primary)" }}>
              {summary ? t("tripCountValue", { count: summary.tripCount }) : "-"}
            </strong>
          </div>
        </div>
      </Link>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>{t("monthlyCostSummary")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("monthlyFuelCost")}</div>
            <strong>{formatCurrency(monthFuelCost)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("monthlyMaintenanceCost")}</div>
            <strong>{formatCurrency(monthMaintenanceCost)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("monthlyTotalCost")}</div>
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
                  style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto", background: editing ? "var(--color-surface-secondary)" : "var(--color-primary)", color: editing ? "var(--color-text-on-secondary)" : "var(--color-text-on-primary)" }}
                >
                  {editing ? t("cancel") : t("edit")}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVehicle}
                  disabled={deletingVehicle}
                  style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto", background: "var(--color-danger)", color: "#fff" }}
                >
                  {t("delete")}
                </button>
              </div>
            )}
          </div>
          {deleteVehicleError && (
            <p style={{ color: "var(--color-danger)", fontSize: 13, margin: "0 0 8px" }}>{deleteVehicleError}</p>
          )}

          {editing ? (
            <form onSubmit={handleSave} className="form" style={{ marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleMake")}</label>
                  <input
                    placeholder={t("vehicleMake")}
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleModel")}</label>
                  <input
                    placeholder={t("vehicleModel")}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehiclePlate")}</label>
                  <input
                    placeholder={t("vehiclePlate")}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleYear")}</label>
                  <input
                    type="number"
                    placeholder={t("vehicleYear")}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleVin")}</label>
                <input
                  placeholder={t("vehicleVin")}
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleTireSize")}</label>
                  <input
                    placeholder="205/55R16"
                    value={tireSize}
                    onChange={(e) => setTireSize(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("vehicleBatteryCapacity")}</label>
                  <input
                    placeholder="77.4 kWh"
                    value={batteryCapacity}
                    onChange={(e) => setBatteryCapacity(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("dashboardOdometer")}</label>
                <input
                  type="number"
                  placeholder={t("dashboardOdometer")}
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>
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
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("uploading")} {uploadProgress}%</span>
                  </div>
                )}
              </div>

              {saveError && <p style={{ color: "var(--color-danger)", fontSize: 13, margin: "8px 0 0" }}>{saveError}</p>}

              <button type="submit" disabled={savingState} style={{ marginTop: 16 }}>
                {savingState ? t("saving") : t("save")}
              </button>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                <div><strong>{t("dashboardOdometer")}:</strong> {vehicle.odometer !== null && vehicle.odometer !== undefined ? formatDistance(vehicle.odometer) : "-"}</div>
                <div><strong>{t("fuelLevel")}:</strong> {vehicle.fuelLevel !== null && vehicle.fuelLevel !== undefined ? `${vehicle.fuelLevel.toFixed(1)}%` : "-"}</div>
              </div>

              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                style={{ background: "transparent", color: "var(--color-primary)", alignSelf: "flex-start", padding: 0, minHeight: "auto", fontSize: 13 }}
              >
                {showDetails ? t("fewerFields") : t("moreFields")}
              </button>

              {showDetails && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                    <div><strong>{t("vehicleMake")} / {t("vehicleModel")}:</strong> {vehicle.make || "-"} / {vehicle.model || "-"}</div>
                    <div><strong>{t("vehiclePlate")}:</strong> {vehicle.plate || "-"}</div>
                    <div><strong>{t("vehicleYear")}:</strong> {vehicle.year || "-"}</div>
                    <div><strong>{t("vehicleFuelType")}:</strong> {vehicle.fuelType ? t(fuelTypeLabelKey(vehicle.fuelType)) : "-"}</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4, wordBreak: "break-all" }}>
                    <strong>{t("vehicleVin")}:</strong> <span style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>{vehicle.vin || "-"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4 }}>
                    <div><strong>{t("vehicleTireSize")}:</strong> {vehicle.tireSize || "-"}</div>
                    <div><strong>{t("vehicleBatteryCapacity")}:</strong> {vehicle.batteryCapacity || "-"}</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4 }}>
                    <strong>{t("registrationCertificate")}:</strong>{" "}
                    {regCertificate ? (
                      <a
                        href={`${API_URL}/api/attachments/file/${regCertificate.filePath}${getToken() ? `?token=${getToken()}` : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--color-primary)", textDecoration: "underline", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <PaperclipIcon /> {t("registrationCertificate")} ({regCertificate.mimeType.split("/")[1]?.toUpperCase() || "FILE"})
                      </a>
                    ) : (
                      <span style={{ color: "var(--color-text-muted-2)" }}>미등록 (Not registered)</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {vehicle && vehicle.latitude !== null && vehicle.latitude !== undefined && vehicle.longitude !== null && vehicle.longitude !== undefined && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: "600", marginTop: 0, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPinIcon /> {t("lastKnownLocation")}</span>
            {vehicle.locationUpdatedAt && (
              <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--color-text-muted)" }}>
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
                backgroundColor: isDriving ? "var(--live-driving-dot)" : isStopped ? "var(--live-stopped-dot)" : "var(--live-idle-dot)",
                animation: isDriving ? "statusPulse 1.5s infinite ease-in-out" : "none",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: "600", color: isDriving ? "var(--live-driving-text)" : isStopped ? "var(--live-stopped-text)" : "var(--live-idle-text)" }}>
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

          <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden" }}>
            <LastLocationMap
              lat={vehicle.latitude}
              lon={vehicle.longitude}
              provider={mapProvider}
              kakaoAppKey={mapConfig.kakaoAppKey}
              naverClientId={mapConfig.naverClientId}
              tmapAppKey={mapConfig.tmapAppKey}
            />
          </div>
        </section>
      )}
    </>
  );
}
