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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export default function VehicleOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vehicleId = params.id;
  const { isAdmin } = useAuth();
  const { t, formatDistance } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit States
  const [editing, setEditing] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [regFile, setRegFile] = useState<File | null>(null);
  const [savingState, setSavingState] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deleteVehicleError, setDeleteVehicleError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  async function load() {
    const [vehicleRes, remindersRes, summaryRes, partsRes, odoRes] = await Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch("/api/reminders"),
      apiFetch(`/api/trips/summary?vehicleId=${vehicleId}&period=week`),
      apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/odometer`),
    ]);
    if (vehicleRes.ok) {
      const vData = await vehicleRes.json();
      setVehicle(vData);
      setMake(vData.make || "");
      setModel(vData.model || "");
      setPlate(vData.plate || "");
      setYear(vData.year ? String(vData.year) : "");
      setVin(vData.vin || "");
    }
    if (remindersRes.ok) {
      const all: Reminder[] = await remindersRes.json();
      setReminders(all.filter((r) => r.vehicleId === vehicleId && r.isDue));
    }
    if (summaryRes.ok) setSummary(await summaryRes.json());

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
            <option value="GASOLINE">{t("fuelTypeGasoline")}</option>
            <option value="DIESEL">{t("fuelTypeDiesel")}</option>
            <option value="LPG">{t("fuelTypeLpg")}</option>
            <option value="ELECTRIC">{t("fuelTypeElectric")}</option>
          </select>
        </section>
      )}

      {reminders.length > 0 && (
        <section className="reminder-banner">
          <strong>{t("reminderBannerTitle", { count: reminders.length })}</strong>
          <ul className="list" style={{ marginTop: 8 }}>
            {reminders.map((r) => (
              <li
                key={r.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
              >
                <span>
                  {t(r.type as any)}
                  {r.dueOdometer !== null && (
                    <>
                      {" — "}
                      {t("reminderDueOdometer", { distance: formatDistance(r.dueOdometer) })}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  style={{ minHeight: 32, flexShrink: 0 }}
                  onClick={() => dismissReminder(r.id)}
                >
                  {t("dismissReminder")}
                </button>
              </li>
            ))}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><strong>{t("vehicleMake")} / {t("vehicleModel")}:</strong> {vehicle.make || "-"} / {vehicle.model || "-"}</div>
                <div><strong>{t("vehiclePlate")}:</strong> {vehicle.plate || "-"}</div>
                <div><strong>{t("vehicleYear")}:</strong> {vehicle.year || "-"}</div>
                <div><strong>{t("vehicleFuelType")}:</strong> {vehicle.fuelType ? t(fuelTypeLabelKey(vehicle.fuelType)) : "-"}</div>
              </div>
              <div style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 4 }}>
                <strong>{t("vehicleVin")}:</strong> <span style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>{vehicle.vin || "-"}</span>
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
    </>
  );
}
