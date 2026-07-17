"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch, uploadFileWithProgress } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import type { ConsumablePart, Vehicle } from "../../../../lib/types";
import type { RecordCategory } from "../../../../lib/types";
import { formatItemLabel } from "../../../../lib/i18n/itemLabel";
import type { TranslationKey } from "../../../../lib/i18n/translations";
import { AlertIcon, TrashIcon, SearchIcon } from "../../../../components/icons";
import { fuelVolumeUnit } from "../../../../lib/fuelEfficiency";
import type { OpinetStationSummary } from "@garage/shared";
import { useMapProviders } from "../../../../lib/maps/useMapProviders";
import { geocodeAddress } from "../../../../lib/maps/geocode";
import { PlaceSearchModal } from "../../../../components/PlaceSearchModal";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Tab = "fuel" | "maintenance";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function QuickLogPage() {
  return (
    <Suspense fallback={null}>
      <QuickLogPageInner />
    </Suspense>
  );
}

function QuickLogPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const vehicleId = params.id;
  const { t } = useSettings();
  const initialTab = searchParams.get("tab") === "maintenance" ? "maintenance" : "fuel";
  const initialType = searchParams.get("type");
  const [tab, setTab] = useState<Tab>(initialTab);

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
              background: tab === tb.key ? "var(--color-primary)" : "var(--color-surface-secondary)",
              color: tab === tb.key ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
              flex: 1,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "fuel" && <QuickFuelForm vehicleId={vehicleId} t={t} />}
      {tab === "maintenance" && <QuickMaintenanceForm vehicleId={vehicleId} t={t} initialType={initialType} />}
    </section>
  );
}

function QuickFuelForm({ vehicleId, t }: { vehicleId: string; t: Translator }) {
  const { showToast } = useToast();
  const { currency, locale, distanceUnit } = useSettings();
  const isKo = locale === "ko";
  const currencyUnit = currency === "KRW" ? "원" : "$";
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [date, setDate] = useState(today());
  const [fullTank, setFullTank] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [baseOdometer, setBaseOdometer] = useState<number>(0);

  // 윗줄(더하기): 천원 단위부터 큰 단위까지. 아랫줄(빼기+지우기): 잘못 눌렀을 때 바로
  // 되돌릴 수 있는 단위만 추려서 두 줄로 끝나게 한다.
  const presets = currency === "KRW"
    ? [
        { label: "+1,000", value: 1000 },
        { label: "+1만", value: 10000 },
        { label: "+3만", value: 30000 },
        { label: "+5만", value: 50000 },
      ]
    : [
        { label: "+$1", value: 1 },
        { label: "+$10", value: 10 },
        { label: "+$30", value: 30 },
        { label: "+$50", value: 50 },
      ];

  const correctionPresets = currency === "KRW"
    ? [
        { label: "-1,000", value: -1000 },
        { label: "-1만", value: -10000 },
        { label: "-3만", value: -30000 },
      ]
    : [
        { label: "-$1", value: -1 },
        { label: "-$10", value: -10 },
        { label: "-$30", value: -30 },
      ];

  function handleAddPreset(value: number) {
    const currentCost = Number(cost) || 0;
    const newCost = Math.max(0, currentCost + value);
    handleCostChange(String(newCost));
  }

  function handleClearCost() {
    setCost("");
    setLiters("");
  }

  // Opinet convenience states
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [opinetConfigured, setOpinetConfigured] = useState(false);
  const [stations, setStations] = useState<OpinetStationSummary[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [location, setLocation] = useState("");
  const [stationAddress, setStationAddress] = useState<string | null>(null);
  const [stationCoords, setStationCoords] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [unitPrice, setUnitPrice] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [frequentStations, setFrequentStations] = useState<Array<{ location: string; address: string | null; latitude: number | null; longitude: number | null }>>([]);
  const mapConfig = useMapProviders();
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    // Load vehicle details to know fuelType
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setVehicle(data);
        if (data) {
          setBaseOdometer(data.odometer);
          setOdometer(data.odometer > 0 ? String(data.odometer) : "");
        }
      });

    // 오피넷이 미연동 상태면 목(mock) 데이터를 실제 가격으로 착각할 수 있어
    // "주변 주유소 찾기" 기능 자체를 숨긴다.
    apiFetch("/api/opinet/configured")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setOpinetConfigured(!!data.configured));

    apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/frequent-stations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFrequentStations(data));
  }, [vehicleId]);

  // 오피넷은 sort=2(거리순)로 조회하므로 목록의 첫 항목이 가장 가까운 주유소다.
  async function applyStation(station: OpinetStationSummary) {
    setSelectedStationId(station.id);
    setLocation(station.name);
    setUnitPrice(String(station.price));
    setStationAddress(null);
    setStationCoords(null);

    if (opinetConfigured && !station.id.startsWith("MOCK_")) {
      const res = await apiFetch(`/api/opinet/stations/${station.id}`);
      if (res.ok) {
        const detail = await res.json();
        setStationAddress(detail.roadAddress || detail.address || null);
        if (detail.lat !== null && detail.lon !== null) {
          setStationCoords({ lat: detail.lat, lon: detail.lon, name: detail.name });
        }
      }
    }

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
            const data: OpinetStationSummary[] = await res.json();
            setStations(data);
            if (data.length > 0) await applyStation(data[0]);
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
          .then(async (data: OpinetStationSummary[]) => {
            setStations(data);
            if (data.length > 0) await applyStation(data[0]);
          })
          .finally(() => setLocLoading(false));
      }
    );
  }

  function handleStationSelect(stationId: string) {
    const station = stations.find((s) => s.id === stationId);
    if (station) void applyStation(station);
  }

  const [geocoding, setGeocoding] = useState(false);

  async function handleAddressBlur() {
    if (!stationAddress?.trim() || !(mapConfig.kakaoAppKey || mapConfig.naverClientId)) return;
    setGeocoding(true);
    try {
      const result = await geocodeAddress(mapConfig, stationAddress);
      if (result) {
        setStationCoords({ lat: result.lat, lon: result.lon, name: location });
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    } finally {
      setGeocoding(false);
    }
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
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs`, {
        method: "POST",
        body: JSON.stringify({
          date,
          odometer: Number(odometer),
          liters: Number(liters),
          cost: Number(cost),
          fullTank,
          location: location || undefined,
          latitude: stationCoords?.lat,
          longitude: stationCoords?.lon,
          address: stationAddress || undefined,
          opinetStationId:
            selectedStationId && !selectedStationId.startsWith("MOCK_") ? selectedStationId : undefined,
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
        setStationAddress(null);
        setStationCoords(null);
        setSelectedStationId("");
        setStations([]);
        setDate(today());
        setFullTank(true);
        setFile(null);
        setFileKey(Date.now());
        showToast(t("toastSaved"), "success");

        apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/frequent-stations`)
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => setFrequentStations(data));
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder={t("odometer")}
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          style={{ width: "100%", paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
          {distanceUnit}
        </span>
      </div>
      {Number(odometer) > 0 && Number(odometer) < baseOdometer && (
        <p style={{ color: "var(--badge-amber-accent)", fontSize: 13, margin: "-6px 0 2px", fontWeight: "500", display: "flex", alignItems: "center", gap: 4 }}>
          <AlertIcon size={14} /> {t("odometerWarning", { base: String(baseOdometer), unit: distanceUnit })}
        </p>
      )}

      {opinetConfigured && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={handleFindStations}
            disabled={locLoading || !vehicle || vehicle.fuelType === "ELECTRIC"}
            style={{ padding: "0 12px", minHeight: 44, fontSize: 14, background: "var(--color-primary)", color: "var(--color-text-on-primary)", width: "100%" }}
          >
            {locLoading ? t("loading") : t("detectLocation")}
          </button>

          {stations.length > 0 && (
            <select
              value={selectedStationId}
              onChange={(e) => handleStationSelect(e.target.value)}
              style={{ width: "100%", minHeight: 44, fontSize: 14, padding: "0 28px 0 8px" }}
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

      {stations.length === 0 && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%" }}>
          <input
            placeholder={t("gasStation")}
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setStationAddress(null);
              setStationCoords(null);
              setSelectedStationId("");
            }}
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
      )}
      {stations.length === 0 && frequentStations.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "-4px 0 8px 4px" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)", alignSelf: "center" }}>자주 감:</span>
          {frequentStations.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setLocation(item.location);
                setStationAddress(item.address);
                if (item.latitude !== null && item.longitude !== null) {
                  setStationCoords({
                    lat: item.latitude,
                    lon: item.longitude,
                    name: item.location,
                  });
                } else {
                  setStationCoords(null);
                }
                setSelectedStationId("");
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
        value={stationAddress || ""}
        onChange={(e) => setStationAddress(e.target.value)}
        onBlur={handleAddressBlur}
        style={{ fontSize: "13px", height: "40px", minHeight: "40px" }}
      />
      {geocoding && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>{t("geocoding")}</p>
      )}

      <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder={t("unitPrice")}
          value={unitPrice}
          onChange={(e) => handleUnitPriceChange(e.target.value)}
          style={{ width: "100%", paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
          {currencyUnit}
        </span>
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder={vehicle?.fuelType === "ELECTRIC" ? t("chargeAmount") : t("liters")}
          value={liters}
          onChange={(e) => handleLitersChange(e.target.value)}
          style={{ width: "100%", paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
          {fuelVolumeUnit(vehicle?.fuelType ?? null)}
        </span>
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder={t("cost")}
          value={cost}
          onChange={(e) => handleCostChange(e.target.value)}
          style={{ width: "100%", paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
          {currencyUnit}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${presets.length}, 1fr)`, gap: 6, marginTop: 4 }}>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handleAddPreset(p.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: 12,
              minHeight: 32,
              height: 32,
              background: "var(--chip-green-bg)",
              color: "var(--color-primary)",
              border: "1px solid var(--chip-green-border)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${correctionPresets.length + 1}, 1fr)`, gap: 6, marginTop: 6, marginBottom: 12 }}>
        {correctionPresets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handleAddPreset(p.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: 12,
              minHeight: 32,
              height: 32,
              background: "var(--chip-red-bg)",
              color: "var(--color-danger)",
              border: "1px solid var(--chip-red-border)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClearCost}
          style={{
            width: "100%",
            padding: "4px 6px",
            fontSize: 12,
            minHeight: 32,
            height: 32,
            background: "var(--chip-red-bg)",
            color: "var(--color-danger)",
            border: "1px solid var(--chip-red-border)",
            borderRadius: 4,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <TrashIcon size={13} /> {isKo ? "지우기" : "Clear"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
        <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("attachmentLabel")}</label>
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
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("uploading")} {uploadProgress}%</span>
          </div>
        )}
      </div>

      <button type="button" onClick={() => setShowMore((v) => !v)} style={{ background: "transparent", color: "var(--color-primary)" }}>
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
      {showSearchModal && (
        <PlaceSearchModal
          mapConfig={mapConfig}
          onSelect={(res) => {
            setLocation(res.name);
            setStationAddress(res.address);
            setStationCoords({
              lat: res.lat,
              lon: res.lon,
              name: res.name,
            });
            setSelectedStationId("");
            setShowSearchModal(false);
          }}
          onClose={() => setShowSearchModal(false)}
          t={t}
          isGasStation={true}
        />
      )}
    </form>
  );
}

function QuickMaintenanceForm({
  vehicleId,
  t,
  initialType,
}: {
  vehicleId: string;
  t: Translator;
  initialType?: string | null;
}) {
  const { currency, distanceUnit } = useSettings();
  const currencyUnit = currency === "KRW" ? "원" : "$";
  const [odometer, setOdometer] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState("");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [baseOdometer, setBaseOdometer] = useState<number>(0);
  const { showToast } = useToast();

  // Linked schedule selection states
  const [parts, setParts] = useState<ConsumablePart[]>([]);
  const [category, setCategory] = useState<RecordCategory>("MAINTENANCE");
  const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
  const [customType, setCustomType] = useState("");

  const mapConfig = useMapProviders();
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
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
    apiFetch(`/api/vehicles/${vehicleId}/maintenance-records/frequent-shops`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFrequentShops(data));
  }, [vehicleId]);

  useEffect(() => {
    // Load last odometer
    apiFetch(`/api/vehicles/${vehicleId}/odometer`)
      .then((res) => (res.ok ? res.json() : { odometer: 0 }))
      .then((data) => {
        if (data.odometer > 0) {
          setOdometer(String(data.odometer));
          setBaseOdometer(data.odometer);
        }
      });

    // Load consumable parts list (schedule tasks)
    apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConsumablePart[]) => {
        setParts(data);
        // 정비 알림에서 "빠른 입력"으로 넘어온 경우, 해당 정비 항목을 자동으로 선택한다.
        if (initialType) {
          const part = data.find((p) => p.partType === initialType);
          if (part) {
            setCategory(part.category);
            setSelectedPartTypes([part.partType]);
          }
        }
      });
  }, [vehicleId, initialType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const typesToSave: string[] = [];
    if (selectedPartTypes.length > 0) {
      typesToSave.push(...selectedPartTypes);
    }
    if (customType.trim()) {
      typesToSave.push(customType.trim());
    }

    if (!odometer || typesToSave.length === 0) {
      setError(t("requiredField"));
      return;
    }

    setSubmitting(true);

    try {
      let lastRecord: { id: string } | null = null;

      for (const finalType of typesToSave) {
        const matchedPart = parts.find((p) => p.partType === finalType);
        const recordCategory = matchedPart?.category ?? category;

        const res = await apiFetch(`/api/vehicles/${vehicleId}/maintenance-records`, {
          method: "POST",
          body: JSON.stringify({
            date,
            odometer: Number(odometer),
            type: finalType,
            category: recordCategory,
            cost: cost ? Number(cost) : undefined,
            shop: shop || undefined,
            notes: notes || undefined,
            latitude: latitude !== null ? latitude : undefined,
            longitude: longitude !== null ? longitude : undefined,
            address: address || undefined,
          }),
        });
        if (res.ok) {
          lastRecord = await res.json();
        } else {
          showToast(t("toastError"), "error");
          setSubmitting(false);
          return;
        }
      }

      if (file && lastRecord) {
        const formData = new FormData();
        formData.append("file", file);
        setUploadProgress(0);
        await uploadFileWithProgress(
          `/api/attachments?maintenanceRecordId=${lastRecord.id}`,
          formData,
          setUploadProgress,
        );
        setUploadProgress(null);
      }

      setSelectedPartTypes([]);
      setCustomType("");
      setDate(today());
      setCost("");
      setShop("");
      setNotes("");
      setAddress("");
      setLatitude(null);
      setLongitude(null);
      setFile(null);
      setFileKey(Date.now());
      showToast(t("toastCreated"), "success");

      apiFetch(`/api/vehicles/${vehicleId}/maintenance-records/frequent-shops`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setFrequentShops(data));

      // Reload consumable parts to update their schedule indicators
      apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setParts);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="form" noValidate>
        <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
          <input
            type="number"
            inputMode="numeric"
            placeholder={t("odometer")}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            style={{ width: "100%", paddingRight: 40 }}
          />
          <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
            {distanceUnit}
          </span>
        </div>
        {Number(odometer) > 0 && Number(odometer) < baseOdometer && (
          <p style={{ color: "var(--badge-amber-accent)", fontSize: 13, margin: "-6px 0 2px", fontWeight: "500", display: "flex", alignItems: "center", gap: 4 }}>
            <AlertIcon size={14} /> {t("odometerWarning", { base: String(baseOdometer), unit: distanceUnit })}
          </p>
        )}

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
                setSelectedPartTypes([]);
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

        {/* 다중 선택 체크박스 그리드 */}
        {parts.filter((p) => p.category === category).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            {parts
              .filter((p) => p.category === category)
              .map((p) => {
                const checked = selectedPartTypes.includes(p.partType);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${checked ? "var(--color-primary)" : "var(--color-border-light)"}`,
                      background: checked ? "var(--color-surface-hover)" : "var(--color-surface)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: checked ? "600" : "400",
                      color: checked ? "var(--color-primary)" : "var(--color-text-on-secondary)",
                      minHeight: "auto",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPartTypes((prev) => [...prev, p.partType]);
                        } else {
                          setSelectedPartTypes((prev) => prev.filter((t) => t !== p.partType));
                        }
                      }}
                      style={{ minHeight: "auto", width: "auto", accentColor: "var(--color-primary)" }}
                    />
                    {formatItemLabel(t, p.partType)}
                  </label>
                );
              })}
          </div>
        )}

        {/* 직접 입력 */}
        <input
          placeholder={t("maintenanceType")}
          value={customType}
          onChange={(e) => setCustomType(e.target.value)}
        />

        <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
          <input
            type="number"
            inputMode="numeric"
            placeholder={t("cost")}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={{ width: "100%", paddingRight: 40 }}
          />
          <span style={{ position: "absolute", right: 12, color: "var(--color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
            {currencyUnit}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-secondary)" }}>{t("attachmentLabel")}</label>
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
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("uploading")} {uploadProgress}%</span>
            </div>
          )}
        </div>

        <button type="button" onClick={() => setShowMore((v) => !v)} style={{ background: "transparent", color: "var(--color-primary)" }}>
          {showMore ? t("fewerFields") : t("moreFields")}
        </button>

        {showMore && (
          <>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <input placeholder={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? t("saving") : t("save")}
        </button>
        {error && <p className="field-error">{error}</p>}
      </form>

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
