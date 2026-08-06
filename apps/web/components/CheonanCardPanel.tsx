"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { OPINET_PROD_LABELS, type CheonanCardStationsResponse, type OpinetProdCd } from "@garage/shared";
import { apiFetch } from "../lib/api";
import { useSettings } from "../lib/i18n/settings-context";
import { PageLoader } from "./PageLoader";
import { NavLaunchButtons } from "./NavLaunchButtons";
import { MapPinIcon } from "./icons";
import { useMapProviders } from "../lib/maps/useMapProviders";
import { pickDefaultProvider } from "../lib/maps/types";
import type { StationMarker } from "./maps/LastLocationMap";
import type { Vehicle } from "../lib/types";

type SortMode = "price" | "distance";
type DistanceFilter = 5 | 10 | 20 | "all";
type ViewTab = "list" | "map";

// 계획서: 지도 마커는 화면에 보이는 상위 N개. 번호는 목록과 1:1.
const MAP_MARKER_LIMIT = 40;
// 차량 좌표가 없을 때 천안시청 근처로 맞춤
const CHEONAN_FALLBACK = { lat: 36.8151, lon: 127.1139 };

const MAX_RETRIES = 6;
const RETRY_INTERVAL_MS = 5000;

const LastLocationMap = dynamic(
  () => import("./maps/LastLocationMap").then((m) => ({ default: m.LastLocationMap })),
  { ssr: false },
);

function StationBadge({ number, selected }: { number: number; selected?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: selected ? "#18523f" : "#f59e0b",
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

function formatAsOfTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(locale === "en" ? "en-US" : "ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function tabButtonStyle(active: boolean) {
  return {
    flex: 1,
    minHeight: 38,
    fontSize: 14,
    background: active ? "var(--color-primary)" : "var(--color-surface-secondary)",
    color: active ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
  } as const;
}

type CheonanCardPanelProps = {
  vehicleId: string;
  /** false면 카드 래퍼·제목을 생략(상위 탭 페이지에서 감쌀 때). 기본 true. */
  showChrome?: boolean;
  /** 상위(stations)에서 이미 조회한 값 — 넘기면 동일 API를 다시 치지 않는다. */
  vehicle?: Vehicle | null;
  enabled?: boolean | null;
};

export function CheonanCardPanel({
  vehicleId,
  showChrome = true,
  vehicle: vehicleProp,
  enabled: enabledProp,
}: CheonanCardPanelProps) {
  const { t, locale, formatDistance } = useSettings();
  const mapConfig = useMapProviders();
  const mapProvider = pickDefaultProvider(mapConfig);

  const [vehicleLocal, setVehicleLocal] = useState<Vehicle | null>(null);
  const [enabledLocal, setEnabledLocal] = useState<boolean | null>(null);
  const vehicle = vehicleProp !== undefined ? vehicleProp : vehicleLocal;
  const enabled = enabledProp !== undefined ? enabledProp : enabledLocal;
  const [data, setData] = useState<CheonanCardStationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("price");
  const [maxKm, setMaxKm] = useState<DistanceFilter>("all");
  const [viewTab, setViewTab] = useState<ViewTab>("list");
  const [mapMounted, setMapMounted] = useState(false);
  const [retryExhausted, setRetryExhausted] = useState(false);
  const [expandedMapId, setExpandedMapId] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const listItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (vehicleProp !== undefined) return;
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicleLocal);
  }, [vehicleId, vehicleProp]);

  useEffect(() => {
    if (enabledProp !== undefined) return;
    apiFetch("/api/cheonan-card/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((config: { enabled?: boolean } | null) => setEnabledLocal(!!config?.enabled))
      .catch(() => setEnabledLocal(false));
  }, [enabledProp]);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fuelType = vehicle?.fuelType || "GASOLINE";
    const qs = new URLSearchParams({ fuelType, sort });
    if (vehicle?.latitude != null && vehicle?.longitude != null) {
      qs.set("lat", String(vehicle.latitude));
      qs.set("lon", String(vehicle.longitude));
    }
    if (maxKm !== "all") qs.set("maxKm", String(maxKm));

    const res = await apiFetch(`/api/cheonan-card/stations?${qs}`);
    if (res.ok) {
      const body: CheonanCardStationsResponse = await res.json();
      setData(body);
    }
    setLoading(false);
  }, [enabled, vehicle, sort, maxKm]);

  useEffect(() => {
    if (enabled === null) return;
    if (enabled && vehicle === null) return;
    setLoading(true);
    load();
  }, [enabled, vehicle, load]);

  useEffect(() => {
    retriesRef.current = 0;
    setRetryExhausted(false);
  }, [sort, maxKm]);

  useEffect(() => {
    if (!data) return;
    if (data.status === "fresh") {
      retriesRef.current = 0;
      setRetryExhausted(false);
      return;
    }
    if (data.status !== "preparing" && data.status !== "refreshing") return;
    if (retriesRef.current >= MAX_RETRIES) {
      setRetryExhausted(true);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      retriesRef.current += 1;
      load();
    }, RETRY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, load]);

  useEffect(() => {
    if (viewTab === "map") setMapMounted(true);
  }, [viewTab]);

  useEffect(() => {
    if (!selectedStationId || viewTab !== "map") return;
    const el = listItemRefs.current.get(selectedStationId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStationId, viewTab]);

  const hasVehicleLocation = vehicle?.latitude != null && vehicle?.longitude != null;

  // 가격 폴링은 data 참조만 바꾸고 id/좌표/이름은 그대로다.
  // 문자열 키로 memo해야 지도 effect가 5초마다 재생성되지 않는다.
  const mapMarkerKey =
    data?.stations
      .slice(0, MAP_MARKER_LIMIT)
      .map((s) => `${s.id}:${s.lat}:${s.lon}:${s.brandLabel ?? ""}:${s.name}`)
      .join("|") ?? "";

  const mapMarkers: StationMarker[] = useMemo(() => {
    if (!data) return [];
    return data.stations.slice(0, MAP_MARKER_LIMIT).map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      name: s.brandLabel ? `[${s.brandLabel}] ${s.name}` : s.name,
      number: i + 1,
    }));
    // data는 mapMarkerKey가 바뀔 때만 함께 바뀐다 — 의도적으로 data를 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMarkerKey]);

  // 정렬·거리 필터로 목록(마커 집합)이 바뀌면 선택/펼침을 비운다.
  // 가격 폴링만으로는 mapMarkerKey가 안 바뀌므로 선택은 유지된다.
  useEffect(() => {
    setSelectedStationId(null);
    setExpandedMapId(null);
  }, [mapMarkerKey]);

  const nearestDistanceKey =
    data?.stations.map((s) => `${s.id}:${s.distanceM ?? ""}`).join("|") ?? "";

  const nearestM = useMemo(() => {
    if (!data?.stations.length) return null;
    let min: number | null = null;
    for (const s of data.stations) {
      if (s.distanceM == null) continue;
      if (min == null || s.distanceM < min) min = s.distanceM;
    }
    return min;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearestDistanceKey]);

  const tooFar = nearestM != null && nearestM > 30_000;

  const mapCenter = useMemo(() => {
    if (hasVehicleLocation && !tooFar) {
      return { lat: vehicle!.latitude!, lon: vehicle!.longitude! };
    }
    if (mapMarkers.length > 0) {
      const lat = mapMarkers.reduce((sum, s) => sum + s.lat, 0) / mapMarkers.length;
      const lon = mapMarkers.reduce((sum, s) => sum + s.lon, 0) / mapMarkers.length;
      return { lat, lon };
    }
    return CHEONAN_FALLBACK;
  }, [hasVehicleLocation, vehicle, mapMarkers, tooFar]);

  if (loading && !data) return <PageLoader />;

  if (enabled === false) {
    const disabledBody = (
      <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{t("cheonanCardDisabled")}</p>
    );
    if (!showChrome) return disabledBody;
    return (
      <section className="card" style={{ marginTop: 8 }}>
        {disabledBody}
      </section>
    );
  }

  const prodLabel = (prodCd: string) => {
    const entry = OPINET_PROD_LABELS[prodCd as OpinetProdCd];
    if (!entry) return prodCd;
    return locale === "en" ? entry.en : entry.ko;
  };

  const headerTimeIso =
    data?.stations
      .flatMap((s) => s.prices)
      .map((p) => p.tradeAt)
      .filter((x): x is string => !!x)
      .sort()[0] ?? data?.pricesSyncedAt ?? null;

  const mapTruncated = (data?.stations.length ?? 0) > MAP_MARKER_LIMIT;
  const showVehicleOnMap = hasVehicleLocation && !tooFar;
  const mapVisible = viewTab === "map";

  // 지도 탭 헤더용 — 목록 전체 수와 마커 수를 구분
  const mapHeaderCountLabel =
    data && mapVisible
      ? mapTruncated
        ? t("cheonanCardMapShownOfTotal", {
            shown: Math.min(MAP_MARKER_LIMIT, data.stations.length),
            total: data.stations.length,
          })
        : null
      : null;

  const content = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          {showChrome && <h2 style={{ margin: 0, fontSize: 16 }}>{t("cheonanCardTitle")}</h2>}
          {data && (
            <p style={{ margin: showChrome ? "4px 0 0" : 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              {t("cheonanCardPriceAsOf", {
                count: data.stations.length,
                time: formatAsOfTime(headerTimeIso, locale),
              })}
              {mapHeaderCountLabel && (
                <span style={{ marginLeft: 8 }}>· {mapHeaderCountLabel}</span>
              )}
              {data.status === "refreshing" && (
                <span style={{ marginLeft: 8, color: "var(--color-primary)" }}>· {t("cheonanCardRefreshing")}</span>
              )}
              {data.status === "preparing" && (
                <span style={{ marginLeft: 8, color: "var(--color-primary)" }}>· {t("cheonanCardPreparing")}</span>
              )}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["price", "distance"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSort(mode)}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                minHeight: "auto",
                borderRadius: 6,
                background: sort === mode ? "var(--color-primary)" : "var(--color-surface-secondary)",
                color: sort === mode ? "var(--color-text-on-primary)" : "var(--color-text-secondary)",
              }}
            >
              {mode === "distance" ? t("sortDistance") : t("sortPrice")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {([5, 10, 20, "all"] as DistanceFilter[]).map((f) => (
          <button
            key={String(f)}
            type="button"
            onClick={() => setMaxKm(f)}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              minHeight: "auto",
              borderRadius: 6,
              background: maxKm === f ? "var(--color-primary)" : "var(--color-surface-secondary)",
              color: maxKm === f ? "var(--color-text-on-primary)" : "var(--color-text-secondary)",
            }}
          >
            {f === "all" ? t("cheonanCardDistanceFilterAll") : `${f}km`}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(
          [
            { key: "list" as const, label: t("cheonanCardTabList") },
            { key: "map" as const, label: t("cheonanCardTabMap") },
          ] as const
        ).map((tb) => (
          <button key={tb.key} type="button" onClick={() => setViewTab(tb.key)} style={tabButtonStyle(viewTab === tb.key)}>
            {tb.label}
          </button>
        ))}
      </div>

      {tooFar && nearestM != null && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          {t("cheonanCardTooFarNotice", { km: formatDistance(nearestM / 1000) })}
        </p>
      )}

      {retryExhausted && data && data.status !== "fresh" && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          {t("cheonanCardRetryLater")}
        </p>
      )}

      {/* 지도 탭은 unmatched를 그리지 않으므로, 표시할 주유소가 없으면 화면이 완전히 비어버린다.
          목록 탭은 unmatched 섹션이 대신 채워주니 그때만 안내를 생략한다. */}
      {data && data.stations.length === 0 && (viewTab === "map" || data.unmatched.length === 0) && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("cheonanCardEmpty")}</p>
      )}

      {mapMounted && data && data.stations.length > 0 && (
        <div style={{ display: mapVisible ? "block" : "none" }}>
          {mapTruncated && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
              {t("cheonanCardMapTopN", { count: MAP_MARKER_LIMIT })}
            </p>
          )}
          {!showVehicleOnMap && hasVehicleLocation && tooFar && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
              {t("cheonanCardMapOmitFarVehicle")}
            </p>
          )}
          {!hasVehicleLocation && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
              {t("cheonanCardMapNoVehicleLocation")}
            </p>
          )}
          <div
            style={{
              height: 360,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--color-border)",
              marginBottom: 12,
            }}
          >
            <LastLocationMap
              lat={mapCenter.lat}
              lon={mapCenter.lon}
              provider={mapProvider}
              kakaoAppKey={mapConfig.kakaoAppKey}
              naverClientId={mapConfig.naverClientId}
              tmapAppKey={mapConfig.tmapAppKey}
              stations={mapMarkers}
              showOriginMarker={showVehicleOnMap}
              active={mapVisible}
              selectedStationId={selectedStationId}
              onStationClick={setSelectedStationId}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.stations.slice(0, MAP_MARKER_LIMIT).map((station, i) => {
              const selected = selectedStationId === station.id;
              return (
                <div
                  key={station.id}
                  ref={(el) => {
                    if (el) listItemRefs.current.set(station.id, el);
                    else listItemRefs.current.delete(station.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedStationId(station.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedStationId(station.id);
                    }
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    borderTop: i === 0 ? undefined : "1px solid var(--color-border)",
                    paddingTop: i === 0 ? 0 : 8,
                    margin: "0 -8px",
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingBottom: 4,
                    borderRadius: 6,
                    background: selected ? "var(--color-surface-secondary)" : undefined,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <StationBadge number={i + 1} selected={selected} />
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {station.brandLabel ? `[${station.brandLabel}] ` : ""}
                      {station.name}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>
                    {station.primaryPrice != null
                      ? `${station.primaryPrice.toLocaleString()}원`
                      : t("cheonanCardFuelNotSold")}
                    {station.distanceM != null ? ` · ${formatDistance(station.distanceM / 1000)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {data.unmatched.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
                {t("cheonanCardNoPriceSection")}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.unmatched.map((m) => (
                  <div key={m.seq} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                    <strong style={{ fontSize: 13 }}>{m.name}</strong>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.address}</div>
                    {m.tel && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.tel}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewTab === "list" && data && data.stations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.stations.map((station, i) => {
            const primary = station.prices.find((p) => p.prodCd === data.primaryProdCd);
            const secondary = station.prices.filter((p) => p.prodCd !== data.primaryProdCd);
            const tradeAt = primary?.tradeAt ?? station.prices[0]?.tradeAt ?? null;
            const pricesPending = data.status === "preparing" && station.prices.length === 0;
            const mapOpen = expandedMapId === station.id;
            return (
              <div key={station.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <StationBadge number={i + 1} />
                    <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {station.brandLabel ? `[${station.brandLabel}] ` : ""}
                      {station.name}
                    </strong>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {station.distanceM != null && (
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {formatDistance(station.distanceM / 1000)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedMapId((id) => (id === station.id ? null : station.id))}
                      style={{
                        minHeight: 26,
                        height: 26,
                        fontSize: 12,
                        padding: "0 8px",
                        background: mapOpen ? "var(--color-primary)" : "var(--color-surface)",
                        color: mapOpen ? "var(--color-text-on-primary)" : "var(--color-primary)",
                        border: "1px solid var(--color-border-light)",
                        borderRadius: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <MapPinIcon size={12} /> {mapOpen ? t("hideTripMap") : t("showTripMap")}
                    </button>
                  </span>
                </div>

                {pricesPending ? (
                  <div
                    style={{
                      height: 18,
                      width: 120,
                      margin: "6px 0",
                      borderRadius: 4,
                      background: "var(--color-surface-secondary)",
                    }}
                  />
                ) : station.primaryPrice != null && primary ? (
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-primary)", margin: "4px 0 2px" }}>
                    {prodLabel(primary.prodCd)} {primary.price.toLocaleString()}원
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 2px" }}>
                    {t("cheonanCardFuelNotSold")}
                  </div>
                )}

                {!pricesPending && secondary.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
                    {secondary.map((p) => (
                      <span key={p.prodCd}>
                        {prodLabel(p.prodCd)} {p.price.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}

                {tradeAt && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
                    {t("cheonanCardItemAsOf", { time: formatAsOfTime(tradeAt, locale) })}
                  </div>
                )}

                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: mapOpen ? 0 : 6 }}>
                  {station.roadAddress ?? station.address}
                </div>

                {mapOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden" }}>
                      <LastLocationMap
                        lat={station.lat}
                        lon={station.lon}
                        provider={mapProvider}
                        kakaoAppKey={mapConfig.kakaoAppKey}
                        naverClientId={mapConfig.naverClientId}
                        tmapAppKey={mapConfig.tmapAppKey}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <NavLaunchButtons
                        compact
                        destination={{ lat: station.lat, lon: station.lon, name: station.name }}
                        labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewTab === "list" && data && data.unmatched.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
            {t("cheonanCardNoPriceSection")}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.unmatched.map((m) => (
              <div key={m.seq} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                <strong style={{ fontSize: 13 }}>{m.name}</strong>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.address}</div>
                {m.tel && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.tel}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (!showChrome) return content;

  return (
    <section className="card" style={{ marginTop: 8 }}>
      {content}
    </section>
  );
}
