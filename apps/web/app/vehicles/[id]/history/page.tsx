"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, API_URL } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import { useConfirm } from "../../../../lib/confirm-context";
import type { FuelLog, MaintenanceRecord, Trip, TripSummary } from "../../../../lib/types";
import type { TranslationKey } from "../../../../lib/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export default function HistoryPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, formatDistance, formatCurrency } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const CHUNK_SIZE = 5;

  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [fuelOffset, setFuelOffset] = useState(0);
  const [hasMoreFuel, setHasMoreFuel] = useState(true);

  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceOffset, setMaintenanceOffset] = useState(0);
  const [hasMoreMaintenance, setHasMoreMaintenance] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [loading, setLoading] = useState(true);
  // state 대신 ref를 쓴다 — 검색 이펙트가 예약된 시점이 아니라 "실행되는 시점"의 값을
  // 봐야 초기 로딩 도중 검색어가 바뀌는 경우에도 그 검색이 씹히지 않는다.
  const initialLoadDone = useRef(false);

  async function loadFuelLogs(reset = false) {
    const currentOffset = reset ? 0 : fuelOffset;
    const res = await apiFetch(`/api/fuel-logs?vehicleId=${vehicleId}&limit=${CHUNK_SIZE}&offset=${currentOffset}`);
    if (res.ok) {
      const data: FuelLog[] = await res.json();
      if (reset) {
        setFuelLogs(data);
        setFuelOffset(data.length);
        setHasMoreFuel(data.length === CHUNK_SIZE);
      } else {
        setFuelLogs((prev) => prev.concat(data));
        setFuelOffset((prev) => prev + data.length);
        setHasMoreFuel(data.length === CHUNK_SIZE);
      }
    }
  }

  async function loadMaintenanceRecords(reset = false) {
    const currentOffset = reset ? 0 : maintenanceOffset;
    const res = await apiFetch(
      `/api/maintenance-records?vehicleId=${vehicleId}&limit=${CHUNK_SIZE}&offset=${currentOffset}&search=${encodeURIComponent(
        debouncedSearch
      )}`
    );
    if (res.ok) {
      const data: MaintenanceRecord[] = await res.json();
      if (reset) {
        setMaintenanceRecords(data);
        setMaintenanceOffset(data.length);
        setHasMoreMaintenance(data.length === CHUNK_SIZE);
      } else {
        setMaintenanceRecords((prev) => prev.concat(data));
        setMaintenanceOffset((prev) => prev + data.length);
        setHasMoreMaintenance(data.length === CHUNK_SIZE);
      }
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    Promise.all([loadFuelLogs(true), loadMaintenanceRecords(true)]).then(() => {
      setLoading(false);
      initialLoadDone.current = true;
    });
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialLoadDone.current) return;
    loadMaintenanceRecords(true);
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p>{t("loading")}</p>;

  return (
    <>
      <h1>{t("historyHeading")}</h1>

      <TripSection vehicleId={vehicleId} t={t} formatDistance={formatDistance} />

      <section>
        <h2>{t("fuelLogsHeading")}</h2>
        {fuelLogs.length === 0 ? (
          <p>{t("noFuelLogs")}</p>
        ) : (
          <>
            <ul className="list">
              {fuelLogs.map((f) => (
                <FuelLogRow
                  key={f.id}
                  log={f}
                  onChanged={() => loadFuelLogs(true)}
                  t={t}
                  formatCurrency={formatCurrency}
                  showToast={showToast}
                  confirm={confirm}
                />
              ))}
            </ul>
            {hasMoreFuel && (
              <button
                type="button"
                onClick={() => loadFuelLogs(false)}
                style={{
                  width: "100%",
                  marginTop: 12,
                  minHeight: 38,
                  fontSize: 13,
                  fontWeight: "500",
                  backgroundColor: "#ffffff",
                  color: "#18523f",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                className="nav-btn-premium"
              >
                {t("loadMore")}
              </button>
            )}
          </>
        )}
      </section>

      <section>
        <h2>{t("maintenanceHeading")}</h2>
        <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder={t("searchMaintenancePlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minHeight: 38,
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              padding: "0 12px",
              outline: "none",
            }}
          />
        </div>
        {maintenanceRecords.length === 0 ? (
          <p>{t("noMaintenanceRecords")}</p>
        ) : (
          <>
            <ul className="list">
              {maintenanceRecords.map((m) => (
                <MaintenanceRow
                  key={m.id}
                  record={m}
                  onChanged={() => loadMaintenanceRecords(true)}
                  t={t}
                  formatCurrency={formatCurrency}
                  showToast={showToast}
                  confirm={confirm}
                />
              ))}
            </ul>
            {hasMoreMaintenance && (
              <button
                type="button"
                onClick={() => loadMaintenanceRecords(false)}
                style={{
                  width: "100%",
                  marginTop: 12,
                  minHeight: 38,
                  fontSize: 13,
                  fontWeight: "500",
                  backgroundColor: "#ffffff",
                  color: "#18523f",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                className="nav-btn-premium"
              >
                {t("loadMore")}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

function FuelLogRow({
  log,
  onChanged,
  t,
  formatCurrency,
  showToast,
  confirm,
}: {
  log: FuelLog;
  onChanged: () => void;
  t: Translator;
  formatCurrency: (amount: number) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(log.date.slice(0, 10));
  const [odometer, setOdometer] = useState(String(log.odometer));
  const [liters, setLiters] = useState(String(log.liters));
  const [cost, setCost] = useState(String(log.cost));
  const [fullTank, setFullTank] = useState(log.fullTank);
  const [location, setLocation] = useState(log.location || "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/fuel-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date,
          odometer: Number(odometer),
          liters: Number(liters),
          cost: Number(cost),
          fullTank,
          location: location || undefined,
        }),
      });
      if (res.ok) {
        setEditing(false);
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!(await confirm(t("confirmDelete")))) return;
    const res = await apiFetch(`/api/fuel-logs/${log.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      onChanged();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  if (editing) {
    return (
      <li className="list-item">
        <form onSubmit={handleSave} className="form">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            type="number"
            placeholder={t("odometer")}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder={t("liters")}
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            required
          />
          <input
            type="number"
            placeholder={t("cost")}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            required
          />
          <input
            placeholder={t("gasStation")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={fullTank}
              onChange={(e) => setFullTank(e.target.checked)}
              style={{ minHeight: "auto", width: "auto" }}
            />
            {t("fullTank")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="list-item" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>
          {log.date.slice(0, 10)} · {log.liters}L · {formatCurrency(log.cost)}
          {log.location && <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>({log.location})</span>}
        </span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      <AttachmentList attachments={log.attachments} />
    </li>
  );
}

function AttachmentList({ attachments }: { attachments: { id: string; filePath: string; mimeType: string }[] }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((att) => {
        const fileUrl = `${API_URL}/api/attachments/file/${att.filePath}`;
        const isImage = att.mimeType.startsWith("image/");

        return (
          <a
            key={att.id}
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #ddd",
              borderRadius: 4,
              overflow: "hidden",
              textDecoration: "none",
              backgroundColor: "#f9f9f9",
            }}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl}
                alt="Attachment"
                style={{ width: 60, height: 60, objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 11, color: "#666", padding: "8px 12px" }}>
                📄 PDF
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function MaintenanceRow({
  record,
  onChanged,
  t,
  formatCurrency,
  showToast,
  confirm,
}: {
  record: MaintenanceRecord;
  onChanged: () => void;
  t: Translator;
  formatCurrency: (amount: number) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(record.date.slice(0, 10));
  const [odometer, setOdometer] = useState(String(record.odometer));
  const [type, setType] = useState(record.type);
  const [cost, setCost] = useState(record.cost !== null ? String(record.cost) : "");
  const [shop, setShop] = useState(record.shop ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/maintenance-records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date,
          odometer: Number(odometer),
          type,
          cost: cost ? Number(cost) : undefined,
          shop: shop || undefined,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        setEditing(false);
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!(await confirm(t("confirmDelete")))) return;
    const res = await apiFetch(`/api/maintenance-records/${record.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      onChanged();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  if (editing) {
    return (
      <li className="list-item">
        <form onSubmit={handleSave} className="form">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            type="number"
            placeholder={t("odometer")}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            required
          />
          <input
            placeholder={t("maintenanceType")}
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          />
          <input
            type="number"
            placeholder={t("cost")}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <input placeholder={t("shop")} value={shop} onChange={(e) => setShop(e.target.value)} />
          <input
            placeholder={t("notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="list-item" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>
          {record.date.slice(0, 10)} · {t(record.type as any)}
          {record.cost !== null ? ` · ${formatCurrency(record.cost)}` : ""}
        </span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      <AttachmentList attachments={record.attachments} />
    </li>
  );
}

function formatDuration(seconds: number, t: Translator): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}${t("minutesShort")}`;
  return `${hours}${t("hoursShort")} ${minutes}${t("minutesShort")}`;
}

function TripSection({
  vehicleId,
  t,
  formatDistance,
}: {
  vehicleId: string;
  t: Translator;
  formatDistance: (km: number) => string;
}) {
  const CHUNK_SIZE = 5;
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripOffset, setTripOffset] = useState(0);
  const [hasMoreTrips, setHasMoreTrips] = useState(true);
  const [summary, setSummary] = useState<TripSummary | null>(null);

  async function loadTrips(reset = false) {
    const currentOffset = reset ? 0 : tripOffset;
    const res = await apiFetch(`/api/trips?vehicleId=${vehicleId}&limit=${CHUNK_SIZE}&offset=${currentOffset}`);
    if (res.ok) {
      const data: Trip[] = await res.json();
      if (reset) {
        setTrips(data);
        setTripOffset(data.length);
        setHasMoreTrips(data.length === CHUNK_SIZE);
      } else {
        setTrips((prev) => prev.concat(data));
        setTripOffset((prev) => prev + data.length);
        setHasMoreTrips(data.length === CHUNK_SIZE);
      }
    }
  }

  useEffect(() => {
    loadTrips(true);
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetch(`/api/trips/summary?vehicleId=${vehicleId}&period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setSummary);
  }, [vehicleId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setPurpose(tripId: string, purpose: "BUSINESS" | "PERSONAL" | null) {
    const res = await apiFetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({ purpose }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTrips((prev) => prev.map((t) => (t.id === tripId ? updated : t)));
    }
  }

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: "0 0 8px" }}>{t("tripsHeading")}</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as "week" | "month")}
          style={{ minHeight: 36, fontSize: 13, padding: "0 8px" }}
        >
          <option value="week">{t("tripPeriodWeek")}</option>
          <option value="month">{t("tripPeriodMonth")}</option>
        </select>
      </div>

      {summary && (
        <div className="card" style={{ display: "flex", gap: 20, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("totalDistance")}</div>
            <strong>{formatDistance(summary.totalDistanceKm)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("totalDuration")}</div>
            <strong>{formatDuration(summary.totalDurationSec, t)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>{t("tripCount", { count: summary.tripCount })}</div>
          </div>
        </div>
      )}

      {trips.length === 0 ? (
        <p>{t("noTrips")}</p>
      ) : (
        <>
          <ul className="list">
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="list-item"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
              >
                <span>
                  {trip.startTime.slice(0, 16).replace("T", " ")} ·{" "}
                  {trip.distanceKm !== null ? formatDistance(trip.distanceKm) : "-"}
                </span>
                <select
                  value={trip.purpose ?? ""}
                  onChange={(e) =>
                    setPurpose(trip.id, (e.target.value || null) as "BUSINESS" | "PERSONAL" | null)
                  }
                  style={{ minHeight: 36, fontSize: 13, padding: "0 8px", flexShrink: 0 }}
                >
                  <option value="">{t("tripPurposeUnset")}</option>
                  <option value="BUSINESS">{t("tripPurposeBusiness")}</option>
                  <option value="PERSONAL">{t("tripPurposePersonal")}</option>
                </select>
              </li>
            ))}
          </ul>
          {hasMoreTrips && (
            <button
              type="button"
              onClick={() => loadTrips(false)}
              style={{
                width: "100%",
                marginTop: 12,
                minHeight: 38,
                fontSize: 13,
                fontWeight: "500",
                backgroundColor: "#ffffff",
                color: "#18523f",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                cursor: "pointer",
              }}
              className="nav-btn-premium"
            >
              {t("loadMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
