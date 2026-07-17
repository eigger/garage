"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, API_URL, getToken, uploadFileWithProgress } from "../../../../lib/api";
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
import { geocodeAddress, reverseGeocode } from "../../../../lib/maps/geocode";
import type { SpeedPoint } from "../../../../lib/maps/polyline";
import { decodeRoute } from "../../../../lib/maps/polyline";
import { LeafIcon, BarChartIcon, RouteIcon, FileTextIcon, MapPinIcon, XIcon, SearchIcon } from "../../../../components/icons";
import { computeFuelEfficiencyPoints, efficiencyUnitLabels, fuelVolumeUnit } from "../../../../lib/fuelEfficiency";
import type { FuelType } from "../../../../lib/types";
import dynamic from "next/dynamic";
import { PlaceSearchModal } from "../../../../components/PlaceSearchModal";
import { NavLaunchButtons } from "../../../../components/NavLaunchButtons";

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

  async function loadFuelLogs(reset = false, searchOverride?: string) {
    const currentOffset = reset ? 0 : fuelOffset;
    const effectiveSearch = searchOverride !== undefined ? searchOverride : debouncedSearch;
    const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs?limit=${CHUNK_SIZE}&offset=${currentOffset}&search=${encodeURIComponent(effectiveSearch)}`);
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
      loadFuelLogs(true, debouncedSearch).then(() => setFuelLoading(false));
    }
  }, [vehicleId, subTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <TripSection vehicleId={vehicleId} t={t} formatDistance={formatDistance} formatDateTime={formatDateTime} mapConfig={mapConfig} showToast={showToast} confirm={confirm} />
      )}

      {subTab === "fuel" && (
        <section>
          <h2>{t("fuelLogsHeading")}</h2>
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder={t("searchFuelPlaceholder")}
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
          {fuelLoading ? (
            <p>{t("loading")}</p>
          ) : (
            <>
              {fuelLogs.length === 0 ? (
                <p>{t("noFuelLogs")}</p>
              ) : (
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
                      formatDistance={formatDistance}
                      showToast={showToast}
                      confirm={confirm}
                      mapConfig={mapConfig}
                    />
                  ))}
                </ul>
              )}
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
                    formatDistance={formatDistance}
                    showToast={showToast}
                    confirm={confirm}
                    mapConfig={mapConfig}
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
  formatDistance,
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
  formatDistance: (km: number) => string;
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
  const [address, setAddress] = useState(log.address || "");
  const [latitude, setLatitude] = useState<number | null>(log.latitude);
  const [longitude, setLongitude] = useState<number | null>(log.longitude);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [frequentStations, setFrequentStations] = useState<Array<{ location: string; address: string | null; latitude: number | null; longitude: number | null }>>([]);
  const [geocoding, setGeocoding] = useState(false);

  async function handleAddressBlur() {
    if (!address.trim() || !(mapConfig.kakaoAppKey || mapConfig.naverClientId)) return;
    setGeocoding(true);
    try {
      const result = await geocodeAddress(mapConfig, address);
      if (result) {
        setLatitude(result.lat);
        setLongitude(result.lon);
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    } finally {
      setGeocoding(false);
    }
  }

  const [attachments, setAttachments] = useState(log.attachments);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (editing) {
      setDate(log.date.slice(0, 10));
      setOdometer(String(log.odometer));
      setLiters(String(log.liters));
      setCost(String(log.cost));
      setFullTank(log.fullTank);
      setLocation(log.location || "");
      setAttachments(log.attachments);
      setDeletedAttachmentIds([]);
      setNewFile(null);
      setUploadProgress(null);
      setAddress(log.address || "");
      setLatitude(log.latitude);
      setLongitude(log.longitude);

      apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/frequent-stations`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setFrequentStations(data));
    }
  }, [editing, log]);

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
          location: location.trim() === "" ? null : location,
          latitude: latitude !== null ? latitude : undefined,
          longitude: longitude !== null ? longitude : undefined,
          address: address.trim() === "" ? null : address,
        }),
      });
      if (res.ok) {
        if (deletedAttachmentIds.length > 0) {
          await Promise.all(
            deletedAttachmentIds.map((id) =>
              apiFetch(`/api/attachments/${id}`, { method: "DELETE" }),
            ),
          );
        }

        if (newFile) {
          const formData = new FormData();
          formData.append("file", newFile);
          setUploadProgress(0);
          await uploadFileWithProgress(
            `/api/attachments?fuelLogId=${log.id}`,
            formData,
            setUploadProgress,
          );
          setUploadProgress(null);
        }

        setEditing(false);
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } catch (err) {
      showToast(t("toastError"), "error");
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
      <>
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
            <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%" }}>
              <input
                placeholder={t("gasStation")}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ flex: 1, marginBottom: 0, height: "48px", minHeight: "48px" }}
              />
              {(mapConfig.kakaoAppKey || mapConfig.naverClientId) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSearchModal(true)}
                  style={{
                    height: "48px",
                    minHeight: "48px",
                    width: "48px",
                    minWidth: "48px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <SearchIcon size={18} />
                </button>
              )}
            </div>
            {frequentStations.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "4px 0 8px 4px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", alignSelf: "center" }}>자주 감:</span>
                {frequentStations.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setLocation(item.location);
                      setAddress(item.address || "");
                      setLatitude(item.latitude);
                      setLongitude(item.longitude);
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "16px",
                      background: "var(--color-surface-secondary)",
                      border: "1px solid var(--color-border-light)",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                      minHeight: "auto",
                      width: "auto",
                    }}
                  >
                    {item.location}
                  </button>
                ))}
              </div>
            )}
            <input
              placeholder={t("addressOptional")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={handleAddressBlur}
              style={{ fontSize: "13px", height: "40px", minHeight: "40px" }}
            />
            {geocoding && (
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "-4px 0 8px 4px" }}>
                {t("geocoding")}
              </p>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={fullTank}
                onChange={(e) => setFullTank(e.target.checked)}
                style={{ minHeight: "auto", width: "auto" }}
              />
              {t("fullTank")}
            </label>
            {(log.attachments.length > 0 || attachments.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>
                  {t("attachmentLabel")}
                </label>
                <AttachmentList
                  attachments={attachments}
                  editable
                  onRemove={(id) => {
                    setAttachments((prev) => prev.filter((a) => a.id !== id));
                    setDeletedAttachmentIds((prev) => [...prev, id]);
                  }}
                  t={t}
                  showToast={showToast}
                  confirm={confirm}
                />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>
                {t("completionPhotoLabel")}
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                style={{ minHeight: "auto", padding: "4px 8px" }}
              />
              {uploadProgress !== null && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div className="upload-progress-track">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {t("uploading")} {uploadProgress}%
                  </span>
                </div>
              )}
            </div>
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
        {showSearchModal && (
          <PlaceSearchModal
            mapConfig={mapConfig}
            onSelect={(res) => {
              setLocation(res.name);
              setAddress(res.address);
              setLatitude(res.lat);
              setLongitude(res.lon);
              setShowSearchModal(false);
            }}
            onClose={() => setShowSearchModal(false)}
            t={t}
            isGasStation
          />
        )}
      </>
    );
  }

  return (
    <li className="list-item" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>{log.date.slice(0, 10)}</span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn-action" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" className="btn-action btn-action-danger" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      <div>
        {formatDistance(log.odometer)} · {log.liters}{volumeUnit} · {formatCurrency(log.cost)}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span>{t("unitPrice")} {formatCurrency(Math.round(log.cost / log.liters))}/{volumeUnit}</span>
        <span>· {log.fullTank ? t("fullTank") : t("partialTank")}</span>
        {log.location && <span>· {log.location}</span>}
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
      {(log.address || (log.latitude !== null && log.longitude !== null)) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {log.address && (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {log.address}
            </span>
          )}
          {log.latitude !== null && log.longitude !== null && (
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              style={{
                minHeight: 26,
                height: 26,
                fontSize: 12,
                padding: "0 8px",
                background: showMap ? "var(--color-primary)" : "var(--color-surface)",
                color: showMap ? "var(--color-text-on-primary)" : "var(--color-primary)",
                border: "1px solid var(--color-border-light)",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <MapPinIcon size={12} /> {showMap ? t("hideTripMap") : t("showTripMap")}
            </button>
          )}
        </div>
      )}
      {showMap && log.latitude !== null && log.longitude !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden" }}>
            <LastLocationMap
              lat={log.latitude}
              lon={log.longitude}
              provider={mapProvider}
              kakaoAppKey={mapConfig.kakaoAppKey}
              naverClientId={mapConfig.naverClientId}
              tmapAppKey={mapConfig.tmapAppKey}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <NavLaunchButtons
              compact
              destination={{ lat: log.latitude, lon: log.longitude, name: log.location || log.address || "" }}
              labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }}
            />
          </div>
        </div>
      )}
      <AttachmentList attachments={log.attachments} t={t} />
    </li>
  );
}

function AttachmentList({
  attachments,
  editable = false,
  onRemove,
  onDeleted,
  t,
  showToast,
  confirm,
}: {
  attachments: { id: string; filePath: string; mimeType: string }[];
  editable?: boolean;
  onRemove?: (id: string) => void;
  onDeleted?: () => void;
  t: Translator;
  showToast?: (message: string, type?: "success" | "error") => void;
  confirm?: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  if (!attachments || attachments.length === 0) return null;

  async function handleDelete(id: string) {
    if (onRemove) {
      onRemove(id);
      return;
    }
    if (!confirm || !showToast || !onDeleted) return;
    if (!(await confirm(t("confirmDelete")))) return;
    const res = await apiFetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      onDeleted();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((att) => {
        const token = getToken();
        const fileUrl = `${API_URL}/api/attachments/file/${att.filePath}${token ? `?token=${token}` : ""}`;
        const isImage = att.mimeType.startsWith("image/");

        return (
          <div key={att.id} style={{ position: "relative" }}>
            <a
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
            {editable && (
              <button
                type="button"
                onClick={() => handleDelete(att.id)}
                aria-label={t("delete")}
                title={t("delete")}
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  width: 28,
                  height: 28,
                  minHeight: 28,
                  padding: 0,
                  borderRadius: "50%",
                  border: "2px solid var(--color-surface)",
                  background: "var(--color-danger)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
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
  formatDistance,
  showToast,
  confirm,
  mapConfig,
}: {
  vehicleId: string;
  record: MaintenanceRecord;
  onChanged: () => void;
  t: Translator;
  formatCurrency: (amount: number) => string;
  formatDistance: (km: number) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  mapConfig: MapProvidersConfig;
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

  const [attachments, setAttachments] = useState(record.attachments);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [address, setAddress] = useState(record.address || "");
  const [latitude, setLatitude] = useState<number | null>(record.latitude);
  const [longitude, setLongitude] = useState<number | null>(record.longitude);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [frequentShops, setFrequentShops] = useState<Array<{ shop: string; address: string | null; latitude: number | null; longitude: number | null }>>([]);
  const [geocoding, setGeocoding] = useState(false);

  async function handleAddressBlur() {
    if (!address.trim() || !(mapConfig.kakaoAppKey || mapConfig.naverClientId)) return;
    setGeocoding(true);
    try {
      const result = await geocodeAddress(mapConfig, address);
      if (result) {
        setLatitude(result.lat);
        setLongitude(result.lon);
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    } finally {
      setGeocoding(false);
    }
  }

  useEffect(() => {
    if (!editing) return;

    setDate(record.date.slice(0, 10));
    setOdometer(String(record.odometer));
    setCategory(record.category);
    setCost(record.cost !== null ? String(record.cost) : "");
    setShop(record.shop ?? "");
    setNotes(record.notes ?? "");
    setAttachments(record.attachments);
    setDeletedAttachmentIds([]);
    setNewFile(null);
    setUploadProgress(null);
    setAddress(record.address || "");
    setLatitude(record.latitude);
    setLongitude(record.longitude);

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

    apiFetch(`/api/vehicles/${vehicleId}/maintenance-records/frequent-shops`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFrequentShops(data));
  }, [editing, vehicleId, record]);

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
          shop: shop.trim() === "" ? null : shop,
          notes: notes.trim() === "" ? null : notes,
          latitude: latitude !== null ? latitude : undefined,
          longitude: longitude !== null ? longitude : undefined,
          address: address.trim() === "" ? null : address,
        }),
      });
      if (res.ok) {
        if (deletedAttachmentIds.length > 0) {
          await Promise.all(
            deletedAttachmentIds.map((id) =>
              apiFetch(`/api/attachments/${id}`, { method: "DELETE" }),
            ),
          );
        }

        if (newFile) {
          const formData = new FormData();
          formData.append("file", newFile);
          setUploadProgress(0);
          await uploadFileWithProgress(
            `/api/attachments?maintenanceRecordId=${record.id}`,
            formData,
            setUploadProgress,
          );
          setUploadProgress(null);
        }

        setEditing(false);
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } catch (err) {
      showToast(t("toastError"), "error");
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
      <>
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
            <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%" }}>
              <input
                placeholder={t("shop")}
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                style={{ flex: 1, marginBottom: 0, height: "48px", minHeight: "48px" }}
              />
              {(mapConfig.kakaoAppKey || mapConfig.naverClientId) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSearchModal(true)}
                  style={{
                    height: "48px",
                    minHeight: "48px",
                    width: "48px",
                    minWidth: "48px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <SearchIcon size={18} />
                </button>
              )}
            </div>
            {frequentShops.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "4px 0 8px 4px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", alignSelf: "center" }}>자주 감:</span>
                {frequentShops.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setShop(item.shop);
                      setAddress(item.address || "");
                      setLatitude(item.latitude);
                      setLongitude(item.longitude);
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "16px",
                      background: "var(--color-surface-secondary)",
                      border: "1px solid var(--color-border-light)",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                      minHeight: "auto",
                      width: "auto",
                    }}
                  >
                    {item.shop}
                  </button>
                ))}
              </div>
            )}
            <input
              placeholder={t("addressOptional")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={handleAddressBlur}
              style={{ fontSize: "13px", height: "40px", minHeight: "40px" }}
            />
            {geocoding && (
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "-4px 0 8px 4px" }}>
                {t("geocoding")}
              </p>
            )}
            <input
              placeholder={t("notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {(record.attachments.length > 0 || attachments.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>
                  {t("attachmentLabel")}
                </label>
                <AttachmentList
                  attachments={attachments}
                  editable
                  onRemove={(id) => {
                    setAttachments((prev) => prev.filter((a) => a.id !== id));
                    setDeletedAttachmentIds((prev) => [...prev, id]);
                  }}
                  t={t}
                  showToast={showToast}
                  confirm={confirm}
                />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>
                {t("completionPhotoLabel")}
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                style={{ minHeight: "auto", padding: "4px 8px" }}
              />
              {uploadProgress !== null && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div className="upload-progress-track">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {t("uploading")} {uploadProgress}%
                  </span>
                </div>
              )}
            </div>
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
        {showSearchModal && (
          <PlaceSearchModal
            mapConfig={mapConfig}
            onSelect={(res) => {
              setShop(res.name);
              setAddress(res.address);
              setLatitude(res.lat);
              setLongitude(res.lon);
              setShowSearchModal(false);
            }}
            onClose={() => setShowSearchModal(false)}
            t={t}
          />
        )}
      </>
    );
  }

  return (
    <li className="list-item" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CategoryBadge category={record.category} t={t} />
          <span>{record.date.slice(0, 10)}</span>
        </span>
        <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn-action" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" className="btn-action btn-action-danger" onClick={handleDelete}>
            {t("delete")}
          </button>
        </span>
      </div>
      <div>
        {formatDistance(record.odometer)} · {formatItemLabel(t, record.type)}
        {record.cost !== null ? ` · ${formatCurrency(record.cost)}` : ""}
      </div>
      {(record.shop || record.notes) && (
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {record.shop && <span>{t("shop")}: {record.shop}</span>}
          {record.shop && record.notes && <span>·</span>}
          {record.notes && <span>{record.notes}</span>}
        </div>
      )}
      {(record.address || (record.latitude !== null && record.longitude !== null)) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
          {record.address ? (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {record.address}
            </span>
          ) : <span />}
          {record.latitude !== null && record.longitude !== null && (
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              style={{
                minHeight: 26,
                height: 26,
                fontSize: 12,
                padding: "0 8px",
                background: showMap ? "var(--color-primary)" : "var(--color-surface)",
                color: showMap ? "var(--color-text-on-primary)" : "var(--color-primary)",
                border: "1px solid var(--color-border-light)",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <MapPinIcon size={12} /> {showMap ? t("hideTripMap") : t("showTripMap")}
            </button>
          )}
        </div>
      )}
      {showMap && record.latitude !== null && record.longitude !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden" }}>
            <LastLocationMap
              lat={record.latitude}
              lon={record.longitude}
              provider={pickDefaultProvider(mapConfig)}
              kakaoAppKey={mapConfig.kakaoAppKey}
              naverClientId={mapConfig.naverClientId}
              tmapAppKey={mapConfig.tmapAppKey}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <NavLaunchButtons
              compact
              destination={{ lat: record.latitude, lon: record.longitude, name: record.shop || record.address || "" }}
              labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }}
            />
          </div>
        </div>
      )}
      <AttachmentList attachments={record.attachments} t={t} />
    </li>
  );
}


function TripSection({
  vehicleId,
  t,
  formatDistance,
  formatDateTime,
  mapConfig,
  showToast,
  confirm,
}: {
  vehicleId: string;
  t: Translator;
  formatDistance: (km: number) => string;
  formatDateTime: (iso: string) => string;
  mapConfig: MapProvidersConfig;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const CHUNK_SIZE = 5;
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripOffset, setTripOffset] = useState(0);
  const [hasMoreTrips, setHasMoreTrips] = useState(true);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripPointsCache, setTripPointsCache] = useState<Record<string, SpeedPoint[]>>({});
  const [tripAddressCache, setTripAddressCache] = useState<Record<string, string | null>>({});
  const [mapProvider, setMapProvider] = useState<MapProvider>("osm");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tripSearch, setTripSearch] = useState("");
  const [debouncedTripSearch, setDebouncedTripSearch] = useState("");
  const [tripDateFilter, setTripDateFilter] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTripSearch(tripSearch), 300);
    return () => clearTimeout(timer);
  }, [tripSearch]);

  // 도착 위치 주소는 트립 목록이 로드된 뒤 좌표를 역지오코딩해서 채운다.
  useEffect(() => {
    if (!mapConfig.kakaoAppKey && !mapConfig.naverClientId) return;
    trips.forEach((trip) => {
      if (trip.id in tripAddressCache) return;
      if (trip.endLatitude === null || trip.endLatitude === undefined || trip.endLongitude === null || trip.endLongitude === undefined) {
        return;
      }
      setTripAddressCache((prev) => ({ ...prev, [trip.id]: undefined as unknown as string | null }));
      reverseGeocode(mapConfig, trip.endLatitude, trip.endLongitude).then((address) => {
        setTripAddressCache((prev) => ({ ...prev, [trip.id]: address }));
      });
    });
  }, [trips, mapConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function loadTrips(reset = false, searchOverride?: string, dateOverride?: string) {
    const currentOffset = reset ? 0 : tripOffset;
    const effectiveSearch = searchOverride !== undefined ? searchOverride : debouncedTripSearch;
    const effectiveDate = dateOverride !== undefined ? dateOverride : tripDateFilter;
    const params = new URLSearchParams({
      vehicleId,
      limit: String(CHUNK_SIZE),
      offset: String(currentOffset),
    });
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (effectiveDate) params.set("date", effectiveDate);
    const res = await apiFetch(`/api/trips?${params.toString()}`);
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
    loadTrips(true, debouncedTripSearch, tripDateFilter);
  }, [vehicleId, debouncedTripSearch, tripDateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadSummary() {
    apiFetch(`/api/trips/summary?vehicleId=${vehicleId}&period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setSummary);
  }

  async function handleDeleteTrip(tripId: string) {
    if (!(await confirm(t("confirmDelete")))) return;
    const res = await apiFetch(`/api/trips/${tripId}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      if (selectedTripId === tripId) setSelectedTripId(null);
      setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
      loadSummary();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  function handleTripNotesUpdated(tripId: string, notes: string | null) {
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? { ...trip, notes } : trip)));
  }

  useEffect(() => {
    loadSummary();
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

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={t("searchTripPlaceholder")}
          value={tripSearch}
          onChange={(e) => setTripSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 160,
            minHeight: 38,
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid var(--color-border-light)",
            padding: "0 12px",
            outline: "none",
          }}
        />
        <input
          type="date"
          value={tripDateFilter}
          onChange={(e) => setTripDateFilter(e.target.value)}
          style={{
            minHeight: 38,
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid var(--color-border-light)",
            padding: "0 12px",
            outline: "none",
          }}
        />
        {tripDateFilter && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setTripDateFilter("")}
            style={{ minHeight: 38, fontSize: 13, flexShrink: 0 }}
          >
            {t("tripDateFilterClear")}
          </button>
        )}
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
            {trips.map((trip) => (
              <TripRow
                key={trip.id}
                trip={trip}
                vehicle={vehicle}
                isSelected={selectedTripId === trip.id}
                onToggleMap={() => {
                  const next = selectedTripId === trip.id ? null : trip.id;
                  setSelectedTripId(next);
                  if (next) loadTripPoints(trip);
                }}
                tripPoints={tripPointsCache[trip.id]}
                tripAddress={tripAddressCache[trip.id]}
                mapProvider={mapProvider}
                mapConfig={mapConfig}
                t={t}
                formatDistance={formatDistance}
                formatDateTime={formatDateTime}
                onDelete={() => handleDeleteTrip(trip.id)}
                onNotesUpdated={handleTripNotesUpdated}
                showToast={showToast}
              />
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

function TripRow({
  trip,
  vehicle,
  isSelected,
  onToggleMap,
  tripPoints,
  tripAddress,
  mapProvider,
  mapConfig,
  t,
  formatDistance,
  formatDateTime,
  onDelete,
  onNotesUpdated,
  showToast,
}: {
  trip: Trip;
  vehicle: Vehicle | null;
  isSelected: boolean;
  onToggleMap: () => void;
  tripPoints: SpeedPoint[] | undefined;
  tripAddress: string | null | undefined;
  mapProvider: MapProvider;
  mapConfig: MapProvidersConfig;
  t: Translator;
  formatDistance: (km: number) => string;
  formatDateTime: (iso: string) => string;
  onDelete: () => void;
  onNotesUpdated: (tripId: string, notes: string | null) => void;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(trip.notes || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNotes(trip.notes || "");
  }, [trip.notes]);

  async function handleSaveNotes(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() === "" ? null : notes }),
      });
      if (res.ok) {
        const updated = await res.json();
        onNotesUpdated(trip.id, updated.notes);
        setEditing(false);
        showToast(t("toastSaved"), "success");
      } else {
        showToast(t("toastError"), "error");
      }
    } catch {
      showToast(t("toastError"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  const durationSec = trip.endTime
    ? Math.round((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
    : null;

  let fuelConsumedStr = "";
  if (trip.startFuelLevel !== null && trip.startFuelLevel !== undefined && trip.endFuelLevel !== null && trip.endFuelLevel !== undefined) {
    const fuelDiff = trip.startFuelLevel - trip.endFuelLevel;
    if (fuelDiff > 0) {
      const isEv = vehicle?.fuelType === "ELECTRIC";
      if (isEv) {
        const capacity = parseFloat(vehicle?.batteryCapacity || "");
        if (!isNaN(capacity) && capacity > 0) {
          const kwh = (fuelDiff / 100) * capacity;
          fuelConsumedStr = `${t("batteryConsumed", { value: fuelDiff.toFixed(1) })} (${kwh.toFixed(1)} kWh)`;
        } else {
          fuelConsumedStr = t("batteryConsumed", { value: fuelDiff.toFixed(1) });
        }
      } else {
        fuelConsumedStr = t("fuelConsumed", { value: fuelDiff.toFixed(1) });
      }
    } else if (fuelDiff < 0) {
      const isEv = vehicle?.fuelType === "ELECTRIC";
      if (isEv) {
        fuelConsumedStr = t("batteryCharged", { value: Math.abs(fuelDiff).toFixed(1) });
      } else {
        fuelConsumedStr = t("fuelIncreased", { value: Math.abs(fuelDiff).toFixed(1) });
      }
    }
  }

  return (
    <li className="list-item" style={{ display: "block" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{formatDateTime(trip.startTime)}</span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {!editing && (
              <button type="button" className="btn-action" onClick={() => setEditing(true)}>
                {t("edit")}
              </button>
            )}
            <button type="button" className="btn-action btn-action-danger" onClick={onDelete}>
              {t("delete")}
            </button>
          </div>
        </div>
        <div>
          {trip.distanceKm !== null ? formatDistance(trip.distanceKm) : "-"}
          {durationSec !== null && ` · ${formatDuration(durationSec, t)}`}
        </div>
        {fuelConsumedStr && (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{fuelConsumedStr}</div>
        )}
        {editing ? (
          <form onSubmit={handleSaveNotes} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              placeholder={t("tripNotesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ fontSize: 13, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={submitting}>
                {submitting ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setNotes(trip.notes || "");
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
          trip.notes && (
            <div style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "pre-wrap" }}>{trip.notes}</div>
          )
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {tripAddress ? (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tripAddress}
            </span>
          ) : <span />}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onToggleMap}
              style={{
                minHeight: 26,
                height: 26,
                fontSize: 12,
                padding: "0 8px",
                background: isSelected ? "var(--color-primary)" : "var(--color-surface)",
                color: isSelected ? "var(--color-text-on-primary)" : "var(--color-primary)",
                border: "1px solid var(--color-border-light)",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <MapPinIcon size={12} /> {isSelected ? t("hideTripMap") : t("showTripMap")}
            </button>
          </div>
        </div>
      </div>
      {isSelected && (
        !trip.routePolyline ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "8px 0 0" }}>{t("noRouteData")}</p>
        ) : tripPoints === undefined ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "8px 0 0" }}>{t("loading")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden" }}>
              <TripRouteMap
                points={tripPoints}
                provider={mapProvider}
                kakaoAppKey={mapConfig.kakaoAppKey}
                naverClientId={mapConfig.naverClientId}
                tmapAppKey={mapConfig.tmapAppKey}
                noRouteLabel={t("noRouteData")}
              />
            </div>
            {trip.endLatitude !== null && trip.endLatitude !== undefined && trip.endLongitude !== null && trip.endLongitude !== undefined && (
              <div style={{ display: "flex", gap: 8 }}>
                <NavLaunchButtons
                  compact
                  destination={{ lat: trip.endLatitude, lon: trip.endLongitude, name: tripAddress || "" }}
                  labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }}
                />
              </div>
            )}
          </div>
        )
      )}
    </li>
  );
}
