"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, uploadFileWithProgress } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import type { ConsumablePart } from "../../../../lib/types";
import type { TranslationKey } from "../../../../lib/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Tab = "fuel" | "maintenance";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function QuickLogPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("fuel");

  const tabs: { key: Tab; label: string }[] = [
    { key: "fuel", label: t("quickLogFuel") },
    { key: "maintenance", label: t("quickLogMaintenance") },
  ];

  return (
    <section>
      <h1>{t("quickLogHeading")}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            style={{
              background: tab === tb.key ? "#18523f" : "#eee",
              color: tab === tb.key ? "#fff" : "#333",
              flex: 1,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "fuel" && <QuickFuelForm vehicleId={vehicleId} t={t} />}
      {tab === "maintenance" && <QuickMaintenanceForm vehicleId={vehicleId} t={t} />}
    </section>
  );
}

function QuickFuelForm({ vehicleId, t }: { vehicleId: string; t: Translator }) {
  const { showToast } = useToast();
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [date, setDate] = useState(today());
  const [fullTank, setFullTank] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Opinet convenience states
  const [vehicle, setVehicle] = useState<any>(null);
  const [opinetConfigured, setOpinetConfigured] = useState(false);
  const [stations, setStations] = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [location, setLocation] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    // Load vehicle details to know fuelType
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);

    // Load last odometer
    apiFetch(`/api/vehicles/${vehicleId}/odometer`)
      .then((res) => (res.ok ? res.json() : { odometer: 0 }))
      .then((data) => {
        if (data.odometer > 0) setOdometer(String(data.odometer));
      });

    // 오피넷이 미연동 상태면 목(mock) 데이터를 실제 가격으로 착각할 수 있어
    // "주변 주유소 찾기" 기능 자체를 숨긴다.
    apiFetch("/api/opinet/configured")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setOpinetConfigured(!!data.configured));
  }, [vehicleId]);

  // 오피넷은 sort=1(거리순)로 조회하므로 목록의 첫 항목이 가장 가까운 주유소다.
  function applyStation(station: { id: string; name: string; price: number }) {
    setSelectedStationId(station.id);
    setLocation(station.name);
    setUnitPrice(String(station.price));

    // Live recalculation based on whatever was typed last
    if (cost && Number(cost) > 0) {
      setLiters(String((Number(cost) / station.price).toFixed(2)));
    } else if (liters && Number(liters) > 0) {
      setCost(String(Math.round(Number(liters) * station.price)));
    }
  }

  async function handleFindStations() {
    if (!navigator.geolocation) {
      showToast(t("toastError"), "error");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const fType = vehicle?.fuelType || "GASOLINE";
        try {
          const res = await apiFetch(`/api/opinet/stations?lat=${latitude}&lon=${longitude}&fuelType=${fType}`);
          if (res.ok) {
            const data = await res.json();
            setStations(data);
            if (data.length > 0) applyStation(data[0]);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLocLoading(false);
        }
      },
      (error) => {
        console.error(error);
        // Fallback to Seoul Center for local development/fallback
        const fType = vehicle?.fuelType || "GASOLINE";
        apiFetch(`/api/opinet/stations?lat=37.5665&lon=126.9780&fuelType=${fType}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            setStations(data);
            if (data.length > 0) applyStation(data[0]);
          })
          .finally(() => setLocLoading(false));
      }
    );
  }

  function handleStationSelect(stationId: string) {
    const station = stations.find((s) => s.id === stationId);
    if (station) applyStation(station);
  }

  function handleLitersChange(val: string) {
    setLiters(val);
    if (unitPrice && val && Number(val) > 0 && Number(unitPrice) > 0) {
      setCost(String(Math.round(Number(val) * Number(unitPrice))));
    }
  }

  function handleCostChange(val: string) {
    setCost(val);
    if (unitPrice && val && Number(val) > 0 && Number(unitPrice) > 0) {
      setLiters(String((Number(val) / Number(unitPrice)).toFixed(2)));
    }
  }

  function handleUnitPriceChange(val: string) {
    setUnitPrice(val);
    if (val && Number(val) > 0) {
      const numericPrice = Number(val);
      if (cost && Number(cost) > 0) {
        setLiters(String((Number(cost) / numericPrice).toFixed(2)));
      } else if (liters && Number(liters) > 0) {
        setCost(String(Math.round(Number(liters) * numericPrice)));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!odometer || !liters || !cost) {
      setError(t("requiredField"));
      return;
    }
    setSubmitting(true);
    setSaved(false);
    try {
      const res = await apiFetch("/api/fuel-logs", {
        method: "POST",
        body: JSON.stringify({
          vehicleId,
          date,
          odometer: Number(odometer),
          liters: Number(liters),
          cost: Number(cost),
          fullTank,
          location: location || undefined,
        }),
      });
      if (res.ok) {
        const record = await res.json();
        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          setUploadProgress(0);
          await uploadFileWithProgress(`/api/attachments?fuelLogId=${record.id}`, formData, setUploadProgress);
          setUploadProgress(null);
        }
        setLiters("");
        setCost("");
        setUnitPrice("");
        setLocation("");
        setSelectedStationId("");
        setStations([]);
        setDate(today());
        setFullTank(true);
        setFile(null);
        setFileKey(Date.now());
        setSaved(true);
        showToast(t("toastSaved"), "success");
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
        type="number"
        placeholder={t("odometer")}
        value={odometer}
        onChange={(e) => setOdometer(e.target.value)}
        autoFocus
      />

      {opinetConfigured && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleFindStations}
            disabled={locLoading || !vehicle || vehicle.fuelType === "ELECTRIC"}
            style={{ padding: "0 12px", minHeight: 36, fontSize: 13, background: "#18523f", color: "#fff", flexShrink: 0 }}
          >
            {locLoading ? t("loading") : t("detectLocation")}
          </button>

          {stations.length > 0 && (
            <select
              value={selectedStationId}
              onChange={(e) => handleStationSelect(e.target.value)}
              style={{ flex: 1, minHeight: 36, fontSize: 13, padding: "0 8px" }}
            >
              <option value="" disabled>{t("selectStation")}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.brandLabel}] {s.name} - {s.price}원 ({s.distance}m)
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <input
        placeholder={t("gasStation")}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      <input
        type="number"
        placeholder={t("unitPrice")}
        value={unitPrice}
        onChange={(e) => handleUnitPriceChange(e.target.value)}
      />

      <input
        type="number"
        step="0.01"
        placeholder={t("liters")}
        value={liters}
        onChange={(e) => handleLitersChange(e.target.value)}
      />

      <input
        type="number"
        placeholder={t("cost")}
        value={cost}
        onChange={(e) => handleCostChange(e.target.value)}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
        <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("attachmentLabel")}</label>
        <input
          key={fileKey}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
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

      <button type="button" onClick={() => setShowMore((v) => !v)} style={{ background: "transparent", color: "#18523f" }}>
        {showMore ? t("fewerFields") : t("moreFields")}
      </button>

      {showMore && (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={fullTank}
              onChange={(e) => setFullTank(e.target.checked)}
              style={{ minHeight: "auto", width: "auto" }}
            />
            {t("fullTank")}
          </label>
        </>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? t("saving") : t("save")}
      </button>
      {error && <p className="field-error">{error}</p>}
      {saved && <p>{t("saved")}</p>}
    </form>
  );
}

function QuickMaintenanceForm({ vehicleId, t }: { vehicleId: string; t: Translator }) {
  const [odometer, setOdometer] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState("");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { showToast } = useToast();

  // Linked schedule selection states
  const [parts, setParts] = useState<any[]>([]);
  const [selectedPartType, setSelectedPartType] = useState("");
  const [customType, setCustomType] = useState("");

  useEffect(() => {
    // Load last odometer
    apiFetch(`/api/vehicles/${vehicleId}/odometer`)
      .then((res) => (res.ok ? res.json() : { odometer: 0 }))
      .then((data) => {
        if (data.odometer > 0) setOdometer(String(data.odometer));
      });

    // Load consumable parts list (schedule tasks)
    apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setParts);
  }, [vehicleId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const finalType = selectedPartType === "CUSTOM" || !selectedPartType ? customType : selectedPartType;
    if (!odometer || !finalType.trim()) {
      setError(t("requiredField"));
      return;
    }

    setSubmitting(true);
    setSaved(false);

    try {
      const res = await apiFetch("/api/maintenance-records", {
        method: "POST",
        body: JSON.stringify({
          vehicleId,
          date,
          odometer: Number(odometer),
          type: finalType,
          cost: cost ? Number(cost) : undefined,
          shop: shop || undefined,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        const record = await res.json();
        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          setUploadProgress(0);
          await uploadFileWithProgress(
            `/api/attachments?maintenanceRecordId=${record.id}`,
            formData,
            setUploadProgress,
          );
          setUploadProgress(null);
        }
        setSelectedPartType("");
        setCustomType("");
        setDate(today());
        setCost("");
        setShop("");
        setNotes("");
        setFile(null);
        setFileKey(Date.now());
        setSaved(true);
        showToast(t("toastSaved"), "success");

        // Reload consumable parts to update their schedule indicators
        apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`)
          .then((res) => (res.ok ? res.json() : []))
          .then(setParts);
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
        type="number"
        placeholder={t("odometer")}
        value={odometer}
        onChange={(e) => setOdometer(e.target.value)}
        autoFocus
      />

      <select
        value={selectedPartType}
        onChange={(e) => {
          setSelectedPartType(e.target.value);
          if (e.target.value !== "CUSTOM") {
            setCustomType("");
          }
        }}
      >
        <option value="" disabled>{t("selectMaintenanceTask")}</option>
        {parts.map((p) => (
          <option key={p.id} value={p.partType}>
            {t(p.partType as any)}
          </option>
        ))}
        <option value="CUSTOM">{t("customInput")}</option>
      </select>

      {(selectedPartType === "CUSTOM" || !selectedPartType) && (
        <input
          placeholder={t("maintenanceType")}
          value={customType}
          onChange={(e) => setCustomType(e.target.value)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
        <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("attachmentLabel")}</label>
        <input
          key={fileKey}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
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

      <button type="button" onClick={() => setShowMore((v) => !v)} style={{ background: "transparent", color: "#18523f" }}>
        {showMore ? t("fewerFields") : t("moreFields")}
      </button>

      {showMore && (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            type="number"
            placeholder={t("cost")}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <input placeholder={t("shop")} value={shop} onChange={(e) => setShop(e.target.value)} />
          <input placeholder={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? t("saving") : t("save")}
      </button>
      {error && <p className="field-error">{error}</p>}
      {saved && <p>{t("saved")}</p>}
    </form>
  );
}
