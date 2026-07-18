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

// 백엔드는 코드(01~11)만 내려주므로 여기서 로케일에 맞는 라벨로 번역한다.
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

const RESULT_LIMIT = 5;

// 지도 마커와 같은 색·숫자를 써서, provider별 클릭 이벤트 구현 없이도 리스트 항목과
// 지도 마커를 번호로 서로 대응시킬 수 있게 한다.
function StationBadge({ number }: { number: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#f59e0b",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

export function NearbyStationsCard({ fuelType, lat, lon, mapConfig, onResultsChange }: NearbyStationsCardProps) {
  const { t } = useSettings();
  const isElectric = fuelType === "ELECTRIC";
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [gasStations, setGasStations] = useState<OpinetStationSummary[]>([]);
  const [gasCoords, setGasCoords] = useState<Record<string, { lat: number; lon: number }>>({});
  const [chargers, setChargers] = useState<EvChargerSummary[]>([]);

  // 거리순/가격순은 각각 오피넷에 따로 조회한다 — 한 번 받아온 목록을 클라이언트에서
  // 재정렬하면, 상위 N개만 상세 조회(좌표)해둔 상태라 정렬을 바꿨을 때 원래 상위권 밖에
  // 있던 항목이 새로 보이면서 네비 버튼이 빠지는 문제가 있었다.
  async function handleSearch(mode: SortMode) {
    setLoading(true);
    setSearched(true);
    setSortMode(mode);
    try {
      if (isElectric) {
        const address = await reverseGeocode(mapConfig, lat, lon);
        const url = `/api/ev-charger/stations?lat=${lat}&lon=${lon}${address ? `&address=${encodeURIComponent(address)}` : ""}`;
        const res = await apiFetch(url);
        const all: EvChargerSummary[] = res.ok ? await res.json() : [];
        const data = all.slice(0, RESULT_LIMIT);
        setChargers(data);
        onResultsChange?.(data.map((s, i) => ({ id: s.id, lat: s.lat, lon: s.lon, name: s.name, number: i + 1 })));
      } else {
        const res = await apiFetch(`/api/opinet/stations?lat=${lat}&lon=${lon}&fuelType=${fuelType || "GASOLINE"}&sort=${mode}`);
        const all: OpinetStationSummary[] = res.ok ? await res.json() : [];
        const data = all.slice(0, RESULT_LIMIT);
        setGasStations(data);

        // 요약 응답에는 좌표가 없어 네비 연동 + 지도 표기를 위해 화면에 보이는 항목만 상세 조회로 보강한다.
        const entries = await Promise.all(
          data
            .filter((s) => !s.id.startsWith("MOCK_"))
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
        // 좌표가 없어 걸러지는 항목이 있어도(드물게 상세조회 실패 등) 리스트 순번(number)은
        // 원래 위치 그대로 유지해 지도 마커 번호와 항상 일치하게 한다.
        onResultsChange?.(
          data
            .map((s, i) => ({ station: s, number: i + 1 }))
            .filter(({ station: s }) => coordsMap[s.id])
            .map(({ station: s, number }) => ({ id: s.id, lat: coordsMap[s.id].lat, lon: coordsMap[s.id].lon, name: s.name, number }))
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {isElectric ? t("nearbyChargersTitle") : t("nearbyGasStationsTitle")}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isElectric && searched && (
            <div style={{ display: "flex", gap: 4 }}>
              {(["distance", "price"] as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSearch(mode)}
                  disabled={loading}
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
            onClick={() => handleSearch(sortMode)}
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
      {searched && !loading && !isElectric && gasStations.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("noNearbyResults")}</p>
      )}

      {isElectric && chargers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chargers.map((station, i) => (
            <div key={station.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <StationBadge number={i + 1} />
                  <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station.name}</strong>
                </span>
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

      {!isElectric && gasStations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {gasStations.map((station, i) => {
            const coords = gasCoords[station.id];
            return (
              <div key={station.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <StationBadge number={i + 1} />
                    <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      [{station.brandLabel}] {station.name}
                    </strong>
                  </span>
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
