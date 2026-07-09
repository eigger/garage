"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import { useConfirm } from "../../../../lib/confirm-context";
import type { ConsumablePart } from "../../../../lib/types";
import type { TranslationKey } from "../../../../lib/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

type Status = "due" | "upcoming" | "ok";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function computeStatus(
  part: ConsumablePart,
  currentOdometer: number,
): { status: Status; remainingKm: number | null; dueDate: Date | null } {
  const dueOdometer = part.expectedLifeKm ? part.installedOdometer + part.expectedLifeKm : null;
  const dueDate = part.expectedLifeMonths
    ? addMonths(new Date(part.installedDate), part.expectedLifeMonths)
    : null;

  const remainingKm = dueOdometer !== null ? dueOdometer - currentOdometer : null;
  const remainingDays = dueDate !== null ? (dueDate.getTime() - Date.now()) / 86400000 : null;

  const isDue = (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
  const isUpcoming =
    !isDue &&
    ((remainingKm !== null && remainingKm <= 1000) || (remainingDays !== null && remainingDays <= 30));

  return {
    status: isDue ? "due" : isUpcoming ? "upcoming" : "ok",
    remainingKm,
    dueDate,
  };
}

function StatusBadge({ status, t }: { status: Status; t: Translator }) {
  const styles: Record<Status, { bg: string; color: string; label: TranslationKey }> = {
    due: { bg: "#fde2e1", color: "#a12a24", label: "scheduleDueBadge" },
    upcoming: { bg: "#fff3cd", color: "#8a6400", label: "scheduleUpcomingBadge" },
    ok: { bg: "#e3f1e9", color: "#18523f", label: "scheduleOkBadge" },
  };
  const s = styles[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {t(s.label)}
    </span>
  );
}

export default function SchedulePage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, formatDistance } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [parts, setParts] = useState<ConsumablePart[]>([]);
  const [odometer, setOdometer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "due">("all");

  async function load() {
    const [partsRes, odoRes] = await Promise.all([
      apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/odometer`),
    ]);
    if (partsRes.ok) setParts(await partsRes.json());
    if (odoRes.ok) setOdometer((await odoRes.json()).odometer);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p>{t("loading")}</p>;
  }

  const sorted = [...parts].sort((a, b) => {
    const sa = computeStatus(a, odometer).status;
    const sb = computeStatus(b, odometer).status;
    const rank = { due: 0, upcoming: 1, ok: 2 };
    return rank[sa] - rank[sb];
  });

  const visible =
    filter === "due"
      ? sorted.filter((part) => computeStatus(part, odometer).status !== "ok")
      : sorted;

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>{t("scheduleHeading")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              minHeight: "auto",
              background: filter === "all" ? "#18523f" : "#eee",
              color: filter === "all" ? "#fff" : "#333",
            }}
          >
            {t("scheduleFilterAll")}
          </button>
          <button
            type="button"
            onClick={() => setFilter("due")}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              minHeight: "auto",
              background: filter === "due" ? "#18523f" : "#eee",
              color: filter === "due" ? "#fff" : "#333",
            }}
          >
            {t("scheduleFilterDueOnly")}
          </button>
        </div>
      </div>
      <ul className="list">
        {visible.map((part) => (
          <ScheduleRow
            key={part.id}
            part={part}
            odometer={odometer}
            onChanged={load}
            t={t}
            formatDistance={formatDistance}
            showToast={showToast}
            confirm={confirm}
          />
        ))}
      </ul>

      <h2>{t("addCustomItem")}</h2>
      <AddScheduleItemForm vehicleId={vehicleId} odometer={odometer} onCreated={load} t={t} showToast={showToast} />
    </section>
  );
}

function ScheduleRow({
  part,
  odometer,
  onChanged,
  t,
  formatDistance,
  showToast,
  confirm,
}: {
  part: ConsumablePart;
  odometer: number;
  onChanged: () => void;
  t: Translator;
  formatDistance: (km: number) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [partType, setPartType] = useState(part.partType);
  const [expectedLifeKm, setExpectedLifeKm] = useState(
    part.expectedLifeKm ? String(part.expectedLifeKm) : "",
  );
  const [expectedLifeMonths, setExpectedLifeMonths] = useState(
    part.expectedLifeMonths ? String(part.expectedLifeMonths) : "",
  );
  const [installedDate, setInstalledDate] = useState(part.installedDate.slice(0, 10));
  const [installedOdometer, setInstalledOdometer] = useState(String(part.installedOdometer));
  const [submitting, setSubmitting] = useState(false);

  const { status, dueDate } = computeStatus(part, odometer);

  // Distance progress calculation
  let distanceProgress: { percent: number; label: string; color: string } | null = null;
  if (part.expectedLifeKm) {
    const traveledKm = Math.max(0, odometer - part.installedOdometer);
    const limitKm = part.expectedLifeKm;
    const percent = Math.min(100, (traveledKm / limitKm) * 100);
    const remaining = limitKm - traveledKm;
    
    let color = "#18523f"; // green
    if (percent >= 100 || remaining <= 0) color = "#dc2626"; // red
    else if (percent >= 80) color = "#d97706"; // orange

    const remainingText = remaining <= 0 
      ? t("scheduleDueBadge") 
      : `${formatDistance(remaining)} ${t("remaining")}`;

    distanceProgress = {
      percent,
      label: `${t("distanceLabel")}: ${formatDistance(traveledKm)} / ${formatDistance(limitKm)} (${percent.toFixed(0)}%, ${remainingText})`,
      color,
    };
  }

  // Time progress calculation
  let timeProgress: { percent: number; label: string; color: string } | null = null;
  if (part.expectedLifeMonths) {
    const elapsedMs = Date.now() - new Date(part.installedDate).getTime();
    const elapsedMonths = Math.max(0, elapsedMs / (30.436875 * 24 * 60 * 60 * 1000));
    const limitMonths = part.expectedLifeMonths;
    const percent = Math.min(100, (elapsedMonths / limitMonths) * 100);
    const remainingMonths = limitMonths - elapsedMonths;

    let color = "#18523f"; // green
    if (percent >= 100 || remainingMonths <= 0) color = "#dc2626"; // red
    else if (percent >= 80) color = "#d97706"; // orange

    const remainingText = remainingMonths <= 0 
      ? t("scheduleDueBadge") 
      : `${remainingMonths.toFixed(1)}${t("monthsUnit")} ${t("remaining")}`;

    timeProgress = {
      percent,
      label: `${t("periodLabel")}: ${elapsedMonths.toFixed(1)} / ${limitMonths}${t("monthsUnit")} (${percent.toFixed(0)}%, ${remainingText})`,
      color,
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/consumable-parts/${part.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          partType,
          installedDate,
          installedOdometer: Number(installedOdometer),
          expectedLifeKm: expectedLifeKm ? Number(expectedLifeKm) : undefined,
          expectedLifeMonths: expectedLifeMonths ? Number(expectedLifeMonths) : undefined,
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

  async function handleMarkDone() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/consumable-parts/${part.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          installedDate: new Date().toISOString().slice(0, 10),
          installedOdometer: odometer,
        }),
      });
      if (res.ok) {
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
    const res = await apiFetch(`/api/consumable-parts/${part.id}`, { method: "DELETE" });
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
          <input
            placeholder={t("itemName")}
            value={partType}
            onChange={(e) => setPartType(e.target.value)}
            required
          />
          <input
            type="number"
            placeholder={t("intervalKm")}
            value={expectedLifeKm}
            onChange={(e) => setExpectedLifeKm(e.target.value)}
          />
          <input
            type="number"
            placeholder={t("intervalMonths")}
            value={expectedLifeMonths}
            onChange={(e) => setExpectedLifeMonths(e.target.value)}
          />
          <input
            type="date"
            value={installedDate}
            onChange={(e) => setInstalledDate(e.target.value)}
            required
          />
          <input
            type="number"
            placeholder={t("installedOdometer")}
            value={installedOdometer}
            onChange={(e) => setInstalledOdometer(e.target.value)}
            required
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
    <li className="list-item">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>{t(part.partType as any)}</strong>
        <StatusBadge status={status} t={t} />
      </div>
      <div style={{ fontSize: 13, color: "#666", margin: "4px 0 8px" }}>
        {t("lastDoneAt", {
          distance: formatDistance(part.installedOdometer),
          date: part.installedDate.slice(0, 10),
        })}
        {(part.expectedLifeKm || part.expectedLifeMonths) && (
          <>
            {" · "}
            {t("nextDueAt", {
              detail: [
                part.expectedLifeKm ? formatDistance(part.installedOdometer + part.expectedLifeKm) : null,
                dueDate ? dueDate.toISOString().slice(0, 10) : null,
              ]
                .filter(Boolean)
                .join(" / "),
            })}
          </>
        )}
      </div>

      {/* Progress Bars */}
      {(distanceProgress || timeProgress) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0 16px" }}>
          {distanceProgress && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555" }}>
                <span>{distanceProgress.label}</span>
              </div>
              <div style={{ width: "100%", height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${distanceProgress.percent}%`,
                    height: "100%",
                    backgroundColor: distanceProgress.color,
                    borderRadius: 4,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}

          {timeProgress && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555" }}>
                <span>{timeProgress.label}</span>
              </div>
              <div style={{ width: "100%", height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${timeProgress.percent}%`,
                    height: "100%",
                    backgroundColor: timeProgress.color,
                    borderRadius: 4,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={handleMarkDone} disabled={submitting}>
          {t("markDone")}
        </button>
        <button type="button" onClick={() => setEditing(true)}>
          {t("edit")}
        </button>
        <button type="button" onClick={handleDelete}>
          {t("delete")}
        </button>
      </div>
    </li>
  );
}

function AddScheduleItemForm({
  vehicleId,
  odometer,
  onCreated,
  t,
  showToast,
}: {
  vehicleId: string;
  odometer: number;
  onCreated: () => void;
  t: Translator;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [partType, setPartType] = useState("");
  const [expectedLifeKm, setExpectedLifeKm] = useState("");
  const [expectedLifeMonths, setExpectedLifeMonths] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!partType.trim()) {
      setError(t("requiredField"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/consumable-parts", {
        method: "POST",
        body: JSON.stringify({
          vehicleId,
          partType,
          installedDate: new Date().toISOString().slice(0, 10),
          installedOdometer: odometer,
          expectedLifeKm: expectedLifeKm ? Number(expectedLifeKm) : undefined,
          expectedLifeMonths: expectedLifeMonths ? Number(expectedLifeMonths) : undefined,
        }),
      });
      if (res.ok) {
        setPartType("");
        setExpectedLifeKm("");
        setExpectedLifeMonths("");
        showToast(t("toastCreated"), "success");
        onCreated();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <input
        placeholder={t("itemName")}
        value={partType}
        onChange={(e) => setPartType(e.target.value)}
      />
      <input
        type="number"
        placeholder={t("intervalKm")}
        value={expectedLifeKm}
        onChange={(e) => setExpectedLifeKm(e.target.value)}
      />
      <input
        type="number"
        placeholder={t("intervalMonths")}
        value={expectedLifeMonths}
        onChange={(e) => setExpectedLifeMonths(e.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? t("saving") : t("save")}
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
