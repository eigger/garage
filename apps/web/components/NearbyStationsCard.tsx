"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";
import { useSettings } from "../lib/i18n/settings-context";
import { reverseGeocode } from "../lib/maps/geocode";
import type { MapProvidersConfig } from "../lib/maps/types";
import { NavLaunchButtons } from "./NavLaunchButtons";
import type { StationMarker } from "./maps/LastLocationMap";
import type { OpinetStationSummary, EvChargerSummary, ChargerStatus } from "@garage/shared";
import type { FuelType } from "../lib/types";
import type { TranslationKey } from "../lib/i18n/translations";

type NearbyStationsCardProps = {
  fuelType: FuelType | null;
  lat: number;
  lon: number;
  mapConfig: MapProvidersConfig;
  onResultsChange?: (stations: StationMarker[]) => void;
};

type SortMode = "distance" | "price";

const STATUS_COLOR: Record<ChargerStatus, string> = {
  AVAILABLE: "var(--color-success)",
  CHARGING: "var(--color-warning, #d97706)",
  RESERVED: "var(--color-text-muted)",
  OUT_OF_SERVICE: "var(--color-danger)",
  UNKNOWN: "var(--color-text-muted)",
};

const STATUS_LABEL_KEY: Record<ChargerStatus, TranslationKey> = {
  AVAILABLE: "chargerStatusAvailable",
  CHARGING: "chargerStatusCharging",
  RESERVED: "chargerStatusReserved",
  OUT_OF_SERVICE: "chargerStatusOutOfService",
  UNKNOWN: "chargerStatusUnknown",
};

// 백엔드 typeLabel은 한글 고정 문자열이라 로케일 대응이 안 됨 — 코드(01~11) 기준으로
// 번역 키를 찾고, 새로 추가된 코드처럼 매핑이 없을 때만 백엔드 라벨로 폴백한다.
const CHGER_TYPE_LABEL_KEY: Record<string, TranslationKey> = {
  "01": "chgerTypeDcChademo",
  "02": "chgerTypeAcSlow",
  "03": "chgerTypeDcChademoAc3Phase",
  "04": "chgerTypeDcCombo",
  "05": "chgerTypeDcChademoCombo",
  "06": "chgerTypeDcChademoAc3PhaseCombo",
  "07": "chgerTypeAc3Phase",
  "08": "chgerTypeDcComboSlow",
  "09": "chgerTypeNacs",
  "10": "chgerTypeDcComboNacs",
  "11": "chgerTypeDcCombo2Bus",
};

export function NearbyStationsCard({ fuelType, lat, lon, mapConfig, onResultsChange }: NearbyStationsCardProps) {
  const { t } = useSettings();
  const isElectric = fuelType === "ELECTRIC";
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [gasStations, setGasStations] = useState<OpinetStationSummary[]>([]);
  const [gasCoords, setGasCoords] = useState<Record<string, { lat: number; lon: number }>>({});
  const [chargers, setChargers] = useState<EvChargerSummary[]>([]);

  async function handleSearch() {
    setLoading(true);
    setSearched(true);
    try {
      if (isElectric) {
        const address = await reverseGeocode(mapConfig, lat, lon);
        const url = `/api/ev-charger/stations?lat=${lat}&lon=${lon}${address ? `&address=${encodeURIComponent(address)}` : ""}`;
        const res = await apiFetch(url);
        const data: EvChargerSummary[] = res.ok ? await res.json() : [];
        setChargers(data);
        onResultsChange?.(data.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, name: s.name })));
      } else {
        const res = await apiFetch(`/api/opinet/stations?lat=${lat}&lon=${lon}&fuelType=${fuelType || "GASOLINE"}`);
        const data: OpinetStationSummary[] = res.ok ? await res.json() : [];
        setGasStations(data);

        // 요약 응답에는 좌표가 없어 네비 연동 + 지도 표기를 위해 실좌표가 있는 항목만 상세 조회로 보강한다.
        const entries = await Promise.all(
          data
            .filter((s) => !s.id.startsWith("MOCK_"))
            .slice(0, 15)
            .map(async (s) => {
              const detailRes = await apiFetch(`/api/opinet/stations/${s.id}`);
              if (!detailRes.ok) return null;
              const detail = await detailRes.json();
              return detail.lat !== null && detail.lon !== null
                ? ([s.id, { lat: detail.lat, lon: detail.lon }] as const)
                : null;
            })
        );
        const coordsMap = Object.fromEntries(entries.filter((e): e is readonly [string, { lat: number; lon: number }] => e !== null));
        setGasCoords(coordsMap);
        onResultsChange?.(
          data
            .filter((s) => coordsMap[s.id])
            .map((s) => ({ id: s.id, lat: coordsMap[s.id].lat, lon: coordsMap[s.id].lon, name: s.name }))
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const sortedGasStations = [...gasStations].sort((a, b) =>
    sortMode === "price" ? a.price - b.price : a.distance - b.distance
  );

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {isElectric ? t("nearbyChargersTitle") : t("nearbyGasStationsTitle")}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isElectric && gasStations.length > 0 && (
            <div style={{ display: "flex", gap: 4 }}>
              {(["distance", "price"] as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    minHeight: "auto",
                    borderRadius: 6,
                    background: sortMode === mode ? "var(--color-primary)" : "var(--color-surface-secondary)",
                    color: sortMode === mode ? "var(--color-text-on-primary)" : "var(--color-text-secondary)",
                  }}
                >
                  {mode === "distance" ? t("sortDistance") : t("sortPrice")}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            style={{ fontSize: 12, padding: "4px 10px", minHeight: "auto", background: "var(--color-primary)", color: "var(--color-text-on-primary)" }}
          >
            {loading ? t("loading") : t("findNearbyButton")}
          </button>
        </div>
      </div>

      {!searched && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          {isElectric ? t("nearbyChargersHint") : t("nearbyGasStationsHint")}
        </p>
      )}

      {searched && !loading && isElectric && chargers.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("noNearbyResults")}</p>
      )}
      {searched && !loading && !isElectric && sortedGasStations.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("noNearbyResults")}</p>
      )}

      {isElectric && chargers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chargers.map((station) => (
            <div key={station.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station.name}</strong>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>{station.distance}m</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 6px" }}>{station.operator}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {station.connectors.map((c, i) => (
                  <span
                    key={`${c.chgerId}-${i}`}
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: `1px solid ${STATUS_COLOR[c.status]}`,
                      color: STATUS_COLOR[c.status],
                    }}
                  >
                    {t(CHGER_TYPE_LABEL_KEY[c.type] ?? "chgerTypeUnknown")} · {t(STATUS_LABEL_KEY[c.status])}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <NavLaunchButtons compact destination={{ lat: station.lat, lon: station.lon, name: station.name }} labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isElectric && sortedGasStations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sortedGasStations.map((station) => {
            const coords = gasCoords[station.id];
            return (
              <div key={station.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    [{station.brandLabel}] {station.name}
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>{station.distance}m</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-primary)", margin: "2px 0 8px" }}>
                  {station.price.toLocaleString()}원
                </div>
                {coords && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <NavLaunchButtons compact destination={{ lat: coords.lat, lon: coords.lon, name: station.name }} labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
