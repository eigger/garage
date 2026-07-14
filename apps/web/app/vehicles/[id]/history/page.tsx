"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, API_URL, getToken } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import { useConfirm } from "../../../../lib/confirm-context";
import type { ConsumablePart, FuelLog, MaintenanceRecord, Trip, TripSummary, Vehicle } from "../../../../lib/types";
import { formatItemLabel } from "../../../../lib/i18n/itemLabel";
import { formatDuration } from "../../../../lib/duration";
import type { TranslationKey } from "../../../../lib/i18n/translations";
import type { MapProvider } from "@garage/shared";
import { TripRouteMap } from "../../../../components/maps/TripRouteMap";
import { CategoryBadge } from "../../../../components/CategoryBadge";
import type { RecordCategory } from "../../../../lib/types";
import { useMapProviders } from "../../../../lib/maps/useMapProviders";
import { pickDefaultProvider, type MapProvidersConfig } from "../../../../lib/maps/types";
import type { SpeedPoint } from "../../../../lib/maps/polyline";
import { decodeRoute } from "../../../../lib/maps/polyline";
import { LeafIcon, BarChartIcon, RouteIcon, FileTextIcon, MapPinIcon } from "../../../../components/icons";
import { computeFuelEfficiencyPoints, efficiencyUnitLabels, fuelVolumeUnit } from "../../../../lib/fuelEfficiency";
import type { FuelType } from "../../../../lib/types";
import dynamic from "next/dynamic";

const LastLocationMap = dynamic(
  () => import("../../../../components/maps/LastLocationMap").then((m) => ({ default: m.LastLocationMap })),
  { ssr: false },
);

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
type FuelEfficiency = {
  distanceKm: number;
  kmPerLiter: number;
  litersPer100Km: number;
};

export default function HistoryPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, formatDistance, formatCurrency, formatDateTime } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const mapConfig = useMapProviders();

  const CHUNK_SIZE = 5;

  type SubTab = "trips" | "fuel" | "maintenance";
  const [subTab, setSubTab] = useState<SubTab>("trips");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [fuelOffset, setFuelOffset] = useState(0);
  const [hasMoreFuel, setHasMoreFuel] = useState(true);

  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceOffset, setMaintenanceOffset] = useState(0);
  const [hasMoreMaintenance, setHasMoreMaintenance] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | RecordCategory>("all");

  const [fuelLoading, setFuelLoading] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  // 더보기 요청과 검색/필터 변경 요청이 겹치면, 먼저 보낸 요청이 나중에 응답이 와서 최신
  // 상태를 덮어쓸 수 있다 (예: 더보기 응답이 검색 결과보다 늦게 도착해 필터 안 걸린 데이터가
  // 뒤에 붙어버림). 요청마다 순번을 매겨서 이후에 더 최신 요청이 있었으면 그 응답은 버린다.
  const maintenanceRequestSeq = useRef(0);

  async function loadFuelLogs(reset = false) {
    const currentOffset = reset ? 0 : fuelOffset;
    const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=${CHUNK_SIZE}&offset=${currentOffset}`);
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

  async function loadMaintenanceRecords(reset = false, searchOverride?: string, categoryOverride?: "all" | RecordCategory) {
    const currentOffset = reset ? 0 : maintenanceOffset;
    const effectiveSearch = searchOverride !== undefined ? searchOverride : debouncedSearch;
    const effectiveCategory = categoryOverride !== undefined ? categoryOverride : categoryFilter;
    const categoryParam = effectiveCategory === "all" ? "" : `&category=${effectiveCategory}`;
    const requestId = ++maintenanceRequestSeq.current;
    const res = await apiFetch(
      `/api/vehicles/${vehicleId}/maintenance-records?limit=${CHUNK_SIZE}&offset=${currentOffset}&search=${encodeURIComponent(
        effectiveSearch,
      )}${categoryParam}`,
    );
    if (res.ok) {
      const data: MaintenanceRecord[] = await res.json();
      // 이 요청을 보낸 뒤에 더 최신 요청(검색어 변경 등)이 이미 발생했다면 이 응답은 버린다.
      if (requestId !== maintenanceRequestSeq.current) return;
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

  // Reset logs and states when vehicle changes
  useEffect(() => {
    setFuelLogs([]);
    setFuelOffset(0);
    setHasMoreFuel(true);
    setMaintenanceRecords([]);
    setMaintenanceOffset(0);
    setHasMoreMaintenance(true);
    setSearch("");
    setDebouncedSearch("");
    setCategoryFilter("all");
  }, [vehicleId]);

  useEffect(() => {
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
  }, [vehicleId]);

  // Load fuel logs when active tab is fuel
  useEffect(() => {
    if (subTab === "fuel") {
      setFuelLoading(true);
      loadFuelLogs(true).then(() => setFuelLoading(false));
    }
  }, [vehicleId, subTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load maintenance records when active tab is maintenance
  useEffect(() => {
    if (subTab === "maintenance") {
      setMaintenanceLoading(true);
      loadMaintenanceRecords(true, debouncedSearch, categoryFilter).then(() => setMaintenanceLoading(false));
    }
  }, [vehicleId, subTab, debouncedSearch, categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fuelEfficiencyById: Record<string, FuelEfficiency> = {};
  for (const point of computeFuelEfficiencyPoints(fuelLogs)) {
    fuelEfficiencyById[point.logId] = {
      distanceKm: point.distanceKm,
      kmPerLiter: point.kmPerLiter,
      litersPer100Km: point.litersPer100Km,
    };
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: "trips", label: t("historyTabTrips") },
    { key: "fuel", label: t("historyTabFuel") },
    { key: "maintenance", label: t("historyTabMaintenance") },
  ];

  return (
    <>
      <h1>{t("historyHeading")}</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setSubTab(tb.key)}
            style={{
              background: subTab === tb.key ? "var(--color-primary)" : "var(--color-surface-secondary)",
              color: subTab === tb.key ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
              flex: 1,
              minHeight: 38,
              fontSize: 14,
              fontWeight: "600",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {subTab === "trips" && (
        <TripSection vehicleId={vehicleId} t={t} formatDistance={formatDistance} formatDateTime={formatDateTime} mapConfig={mapConfig} />
      )}

      {subTab === "fuel" && (
        <section>
          <h2>{t("fuelLogsHeading")}</h2>
          {fuelLoading ? (
            <p>{t("loading")}</p>
          ) : fuelLogs.length === 0 ? (
            <p>{t("noFuelLogs")}</p>
          ) : (
            <>
              <ul className="list">
                {fuelLogs.map((f) => (
                  <FuelLogRow
                    key={f.id}
                    vehicleId={vehicleId}
                    log={f}
                    efficiency={fuelEfficiencyById[f.id] ?? null}
                    fuelType={vehicle?.fuelType ?? null}
                    onChanged={() => loadFuelLogs(true)}
                    t={t}
                    formatCurrency={formatCurrency}
                    showToast={showToast}
                    confirm={confirm}
                    mapConfig={mapConfig}
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
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-primary)",
                    border: "1px solid var(--color-border-light)",
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
      )}

      {subTab === "maintenance" && (
        <section>
          <h2>{t("maintenanceAndAdminHeading")}</h2>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["all", "historyCategoryAll"],
                ["MAINTENANCE", "historyCategoryMaintenance"],
                ["ADMINISTRATIVE", "historyCategoryAdministrative"],
              ] as const
            ).map(([value, labelKey]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  minHeight: "auto",
                  background: categoryFilter === value ? "var(--color-primary)" : "var(--color-surface-secondary)",
                  color: categoryFilter === value ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
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
                border: "1px solid var(--color-border-light)",
                padding: "0 12px",
                outline: "none",
              }}
            />
          </div>
          {maintenanceLoading ? (
            <p>{t("loading")}</p>
          ) : maintenanceRecords.length === 0 ? (
            <p>{t("noMaintenanceRecords")}</p>
          ) : (
            <>
              <ul className="list">
                {maintenanceRecords.map((m) => (
                  <MaintenanceRow
                    key={m.id}
                    vehicleId={vehicleId}
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
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-primary)",
                    border: "1px solid var(--color-border-light)",
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
      )}
    </>
  );
}

function FuelLogRow({
  vehicleId,
  log,
  efficiency,
  fuelType,
  onChanged,
  t,
  formatCurrency,
  showToast,
  confirm,
  mapConfig,
}: {
  vehicleId: string;
  log: FuelLog;
  efficiency: FuelEfficiency | null;
  fuelType: FuelType | null;
  onChanged: () => void;
  t: Translator;
  formatCurrency: (amount: number) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  mapConfig: MapProvidersConfig;
}) {
  const units = efficiencyUnitLabels(fuelType);
  const volumeUnit = fuelVolumeUnit(fuelType);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(log.date.slice(0, 10));
  const [odometer, setOdometer] = useState(String(log.odometer));
  const [liters, setLiters] = useState(String(log.liters));
  const [cost, setCost] = useState(String(log.cost));
  const [fullTank, setFullTank] = useState(log.fullTank);
  const [location, setLocation] = useState(log.location || "");
  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const mapProvider = pickDefaultProvider(mapConfig);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/${log.id}`, {
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
    const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/${log.id}`, { method: "DELETE" });
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
            placeholder={fuelType === "ELECTRIC" ? t("chargeAmount") : t("liters")}
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
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
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
          {log.date.slice(0, 10)} · {log.liters}{volumeUnit} · {formatCurrency(log.cost)}
          {log.location && <span style={{ fontSize: 13, color: "var(--color-text-muted)", marginLeft: 8 }}>({log.location})</span>}
        </span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" className="btn-danger" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      {efficiency && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 4 }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 6px",
            fontSize: 11,
            fontWeight: "600",
            color: "var(--badge-green-text)",
            backgroundColor: "var(--badge-green-bg)",
            border: "1px solid var(--badge-green-border)",
            borderRadius: 6,
          }}>
            <LeafIcon /> {efficiency.kmPerLiter.toFixed(1)} {units.perUnit}
          </span>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 6px",
            fontSize: 11,
            fontWeight: "500",
            color: "var(--badge-grey-text)",
            backgroundColor: "var(--badge-grey-bg)",
            border: "1px solid var(--badge-grey-border)",
            borderRadius: 6,
          }}>
            <BarChartIcon /> {efficiency.litersPer100Km.toFixed(1)} {units.per100}
          </span>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 6px",
            fontSize: 11,
            fontWeight: "500",
            color: "var(--badge-blue-text)",
            backgroundColor: "var(--badge-blue-bg)",
            border: "1px solid var(--badge-blue-border)",
            borderRadius: 6,
          }}>
            <RouteIcon /> {efficiency.distanceKm.toFixed(0)}km {t("historyTabTrips")}
          </span>
        </div>
      )}
      {log.address && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{log.address}</div>}
      {log.latitude !== null && log.longitude !== null && (
        <>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            style={{
              minHeight: 32,
              fontSize: 13,
              padding: "0 10px",
              background: showMap ? "var(--color-primary)" : "var(--color-surface)",
              color: showMap ? "var(--color-text-on-primary)" : "var(--color-primary)",
              border: "1px solid var(--color-border-light)",
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <MapPinIcon size={14} /> {showMap ? t("hideTripMap") : t("showTripMap")}
          </button>
          {showMap && (
            <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
              <LastLocationMap
                lat={log.latitude}
                lon={log.longitude}
                provider={mapProvider}
                kakaoAppKey={mapConfig.kakaoAppKey}
                naverClientId={mapConfig.naverClientId}
                tmapAppKey={mapConfig.tmapAppKey}
              />
            </div>
          )}
        </>
      )}
      <AttachmentList attachments={log.attachments} />
    </li>
  );
}

function AttachmentList({ attachments }: { attachments: { id: string; filePath: string; mimeType: string }[] }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((att) => {
        const token = getToken();
        const fileUrl = `${API_URL}/api/attachments/file/${att.filePath}${token ? `?token=${token}` : ""}`;
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
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              overflow: "hidden",
              textDecoration: "none",
              backgroundColor: "var(--color-surface-secondary)",
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
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <FileTextIcon /> PDF
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function MaintenanceRow({
  vehicleId,
  record,
  onChanged,
  t,
  formatCurrency,
  showToast,
  confirm,
}: {
  vehicleId: string;
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
  const [category, setCategory] = useState<RecordCategory>(record.category);
  const [selectedPartType, setSelectedPartType] = useState("");
  const [customType, setCustomType] = useState("");
  const [cost, setCost] = useState(record.cost !== null ? String(record.cost) : "");
  const [shop, setShop] = useState(record.shop ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const [parts, setParts] = useState<ConsumablePart[]>([]);

  useEffect(() => {
    if (!editing) return;

    apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConsumablePart[]) => {
        setParts(data);
        const isPreset = data.some((p) => p.category === record.category && p.partType === record.type);
        if (isPreset) {
          setSelectedPartType(record.type);
          setCustomType("");
        } else {
          setSelectedPartType("CUSTOM");
          setCustomType(record.type);
        }
      });
  }, [editing, vehicleId, record.type, record.category]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const finalType = selectedPartType === "CUSTOM" || !selectedPartType ? customType : selectedPartType;
    const matchedPart = parts.find((p) => p.partType === finalType);
    const recordCategory = matchedPart?.category ?? category;

    if (!finalType.trim()) {
      showToast(t("requiredField"), "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/maintenance-records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date,
          odometer: Number(odometer),
          type: finalType,
          category: recordCategory,
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
    const res = await apiFetch(`/api/vehicles/${vehicleId}/maintenance-records/${record.id}`, { method: "DELETE" });
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

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {(
              [
                ["MAINTENANCE", "recordCategoryMaintenance"],
                ["ADMINISTRATIVE", "recordCategoryAdministrative"],
              ] as const
            ).map(([value, labelKey]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setCategory(value);
                  setSelectedPartType("");
                  setCustomType("");
                }}
                style={{
                  flex: 1,
                  fontSize: 13,
                  minHeight: 36,
                  background: category === value ? "var(--color-primary)" : "var(--color-surface-secondary)",
                  color: category === value ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <select
            value={selectedPartType}
            onChange={(e) => {
              setSelectedPartType(e.target.value);
              if (e.target.value !== "CUSTOM") {
                setCustomType("");
                const part = parts.find((p) => p.partType === e.target.value);
                if (part) setCategory(part.category);
              }
            }}
          >
            <option value="" disabled>{t("selectMaintenanceTask")}</option>
            {parts
              .filter((p) => p.category === category)
              .map((p) => (
                <option key={p.id} value={p.partType}>
                  {formatItemLabel(t, p.partType)}
                </option>
              ))}
            <option value="CUSTOM">{t("customInput")}</option>
          </select>

          {(selectedPartType === "CUSTOM" || !selectedPartType) && (
            <input
              placeholder={t("maintenanceType")}
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              required
            />
          )}

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
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
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
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <CategoryBadge category={record.category} t={t} />
          <span>
            {record.date.slice(0, 10)} · {formatItemLabel(t, record.type)}
            {record.cost !== null ? ` · ${formatCurrency(record.cost)}` : ""}
          </span>
        </span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" className="btn-danger" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      <AttachmentList attachments={record.attachments} />
    </li>
  );
}


function TripSection({
  vehicleId,
  t,
  formatDistance,
  formatDateTime,
  mapConfig,
}: {
  vehicleId: string;
  t: Translator;
  formatDistance: (km: number) => string;
  formatDateTime: (iso: string) => string;
  mapConfig: MapProvidersConfig;
}) {
  const CHUNK_SIZE = 5;
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripOffset, setTripOffset] = useState(0);
  const [hasMoreTrips, setHasMoreTrips] = useState(true);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripPointsCache, setTripPointsCache] = useState<Record<string, SpeedPoint[]>>({});
  const [mapProvider, setMapProvider] = useState<MapProvider>("osm");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    setMapProvider(pickDefaultProvider(mapConfig));
  }, [mapConfig.providers.join(",")]);

  useEffect(() => {
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
  }, [vehicleId]);

  // 트립의 원시 텔레메트리(위경도+속도)를 가져와 경로에 속도별 색상을 입힌다.
  // 보존 기간이 지나 텔레메트리가 삭제된 오래된 트립은 routePolyline 기반 단색 표시로 폴백한다.
  async function loadTripPoints(trip: Trip) {
    if (tripPointsCache[trip.id]) return;
    let points: SpeedPoint[] = [];
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/points`);
      const data: { lat: number | null; lon: number | null; speed: number | null }[] = res.ok
        ? await res.json()
        : [];
      points = data
        .filter((p): p is { lat: number; lon: number; speed: number | null } => p.lat !== null && p.lon !== null)
        .map((p) => ({ lat: p.lat, lon: p.lon, speed: p.speed }));
    } catch {
      points = [];
    }
    if (points.length === 0 && trip.routePolyline) {
      points = decodeRoute(trip.routePolyline).map((p) => ({ ...p, speed: null }));
    }
    setTripPointsCache((prev) => ({ ...prev, [trip.id]: points }));
  }

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


  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("tripsHeading")}</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as "week" | "month")}
          style={{ height: 36, minHeight: 36, fontSize: 13, padding: "0 28px 0 8px", flexShrink: 0 }}
        >
          <option value="week">{t("tripPeriodWeek")}</option>
          <option value="month">{t("tripPeriodMonth")}</option>
        </select>
      </div>

      {summary && (
        <div className="card" style={{ display: "flex", gap: 20, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("totalDistance")}</div>
            <strong>{formatDistance(summary.totalDistanceKm)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("totalDuration")}</div>
            <strong>{formatDuration(summary.totalDurationSec, t)}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("tripCount", { count: summary.tripCount })}</div>
          </div>
        </div>
      )}

      {trips.length === 0 ? (
        <p>{t("noTrips")}</p>
      ) : (
        <>
          <ul className="list">
            {trips.map((trip) => {
              const isSelected = selectedTripId === trip.id;
              return (
                <li key={trip.id} className="list-item" style={{ display: "block" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>
                      {(() => {
                        const durationSec = trip.endTime
                          ? Math.round((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
                          : null;
                        const durationStr = durationSec !== null ? `${formatDuration(durationSec, t)} · ` : "";
                        
                        let fuelConsumedStr = "";
                        if (trip.startFuelLevel !== null && trip.startFuelLevel !== undefined && trip.endFuelLevel !== null && trip.endFuelLevel !== undefined) {
                          const fuelDiff = trip.startFuelLevel - trip.endFuelLevel;
                          if (fuelDiff > 0) {
                            const isEv = vehicle?.fuelType === "ELECTRIC";
                            if (isEv) {
                              const capacity = parseFloat(vehicle?.batteryCapacity || "");
                              if (!isNaN(capacity) && capacity > 0) {
                                const kwh = (fuelDiff / 100) * capacity;
                                fuelConsumedStr = ` · ${t("batteryConsumed", { value: fuelDiff.toFixed(1) })} (${kwh.toFixed(1)} kWh)`;
                              } else {
                                fuelConsumedStr = ` · ${t("batteryConsumed", { value: fuelDiff.toFixed(1) })}`;
                              }
                            } else {
                              fuelConsumedStr = ` · ${t("fuelConsumed", { value: fuelDiff.toFixed(1) })}`;
                            }
                          } else if (fuelDiff < 0) {
                            const isEv = vehicle?.fuelType === "ELECTRIC";
                            if (isEv) {
                              fuelConsumedStr = ` · ${t("batteryCharged", { value: Math.abs(fuelDiff).toFixed(1) })}`;
                            } else {
                              fuelConsumedStr = ` · ${t("fuelIncreased", { value: Math.abs(fuelDiff).toFixed(1) })}`;
                            }
                          }
                        }

                        return (
                          <>
                            {formatDateTime(trip.startTime)} · {durationStr}
                            {trip.distanceKm !== null ? formatDistance(trip.distanceKm) : "-"}
                            {fuelConsumedStr}
                          </>
                        );
                      })()}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = isSelected ? null : trip.id;
                          setSelectedTripId(next);
                          if (next) loadTripPoints(trip);
                        }}
                        style={{
                          minHeight: 36,
                          fontSize: 13,
                          padding: "0 10px",
                          background: isSelected ? "var(--color-primary)" : "var(--color-surface)",
                          color: isSelected ? "var(--color-text-on-primary)" : "var(--color-primary)",
                          border: "1px solid var(--color-border-light)",
                          borderRadius: 8,
                        }}
                      >
                        {isSelected ? t("hideTripMap") : t("showTripMap")}
                      </button>

                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ marginTop: 12 }}>
                      {!trip.routePolyline ? (
                        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("noRouteData")}</p>
                      ) : tripPointsCache[trip.id] === undefined ? (
                        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("loading")}</p>
                      ) : (
                        <TripRouteMap
                          points={tripPointsCache[trip.id]}
                          provider={mapProvider}
                          kakaoAppKey={mapConfig.kakaoAppKey}
                          naverClientId={mapConfig.naverClientId}
                          tmapAppKey={mapConfig.tmapAppKey}
                          noRouteLabel={t("noRouteData")}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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
                backgroundColor: "var(--color-surface)",
                color: "var(--color-primary)",
                border: "1px solid var(--color-border-light)",
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
