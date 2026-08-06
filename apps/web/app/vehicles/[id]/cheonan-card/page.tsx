"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { OPINET_PROD_LABELS, type CheonanCardStationsResponse, type OpinetProdCd } from "@garage/shared";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { PageLoader } from "../../../../components/PageLoader";
import { NavLaunchButtons } from "../../../../components/NavLaunchButtons";
import type { Vehicle } from "../../../../lib/types";

type SortMode = "price" | "distance";
type DistanceFilter = 5 | 10 | 20 | "all";

// A3: preparing(첫 동기화 ~35s+)과 refreshing(가격만 ~15s) 재시도 예산을 분리한다.
const PREPARING_MAX_RETRIES = 12; // ~60s
const REFRESHING_MAX_RETRIES = 6; // ~30s
const RETRY_INTERVAL_MS = 5000;

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

export default function CheonanCardPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t, locale, formatDistance } = useSettings();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [data, setData] = useState<CheonanCardStationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sort, setSort] = useState<SortMode>("price");
  const [maxKm, setMaxKm] = useState<DistanceFilter>("all");
  const [retryExhausted, setRetryExhausted] = useState(false);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
  }, [vehicleId]);

  const load = useCallback(async () => {
    const configRes = await apiFetch("/api/cheonan-card/config");
    if (!configRes.ok) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    const config = await configRes.json();
    setEnabled(!!config.enabled);
    if (!config.enabled) {
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
  }, [vehicle, sort, maxKm]);

  useEffect(() => {
    if (vehicle === null) return;
    setLoading(true);
    load();
  }, [vehicle, load]);

  useEffect(() => {
    if (!data) return;
    if (data.status === "fresh") {
      retriesRef.current = 0;
      setRetryExhausted(false);
      return;
    }
    if (data.status !== "preparing" && data.status !== "refreshing") return;
    const maxRetries = data.status === "preparing" ? PREPARING_MAX_RETRIES : REFRESHING_MAX_RETRIES;
    if (retriesRef.current >= maxRetries) {
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

  if (loading && !data) return <PageLoader />;

  if (enabled === false) {
    return (
      <section className="card" style={{ marginTop: 8 }}>
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{t("cheonanCardDisabled")}</p>
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
      .sort()[0] ?? data?.pricesSyncedAt ?? null;

  const nearestM = data?.stations.reduce<number | null>((min, s) => {
    if (s.distanceM == null) return min;
    if (min == null || s.distanceM < min) return s.distanceM;
    return min;
  }, null);

  const tooFar = nearestM != null && nearestM > 30_000;

  return (
    <section className="card" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("cheonanCardTitle")}</h2>
          {data && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {t("cheonanCardPriceAsOf", {
                count: data.stations.length,
                time: formatAsOfTime(headerTimeIso, locale),
              })}
              {data.status === "refreshing" && (
                <span style={{ marginLeft: 8, color: "var(--color-primary)" }}>· {t("cheonanCardRefreshing")}</span>
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

      {tooFar && nearestM != null && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          {t("cheonanCardTooFarNotice", { km: formatDistance(nearestM / 1000) })}
        </p>
      )}

      {data?.status === "preparing" && data.stations.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          {retryExhausted ? t("cheonanCardRetryLater") : t("cheonanCardPreparing")}
        </p>
      )}

      {data && data.status !== "preparing" && data.stations.length === 0 && data.unmatched.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{t("cheonanCardEmpty")}</p>
      )}

      {data && data.stations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.stations.map((station, i) => {
            const primary = station.prices.find((p) => p.prodCd === data.primaryProdCd);
            const secondary = station.prices.filter((p) => p.prodCd !== data.primaryProdCd);
            const tradeAt = primary?.tradeAt ?? station.prices[0]?.tradeAt ?? null;
            return (
              <div key={`${station.id}-${station.konaSeq}`} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <StationBadge number={i + 1} />
                    <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {station.brandLabel ? `[${station.brandLabel}] ` : ""}
                      {station.name}
                    </strong>
                  </span>
                  {station.distanceM != null && (
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>
                      {formatDistance(station.distanceM / 1000)}
                    </span>
                  )}
                </div>

                {station.primaryPrice != null && primary ? (
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-primary)", margin: "4px 0 2px" }}>
                    {prodLabel(primary.prodCd)} {primary.price.toLocaleString()}원
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 2px" }}>
                    {t("cheonanCardFuelNotSold")}
                  </div>
                )}

                {secondary.length > 0 && (
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
                    {formatAsOfTime(tradeAt, locale)} 기준
                  </div>
                )}

                {station.lat != null && station.lon != null && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <NavLaunchButtons
                      compact
                      destination={{ lat: station.lat, lon: station.lon, name: station.name }}
                      labels={{ tmap: t("navLaunchTmap"), kakao: t("navLaunchKakao"), naver: t("navLaunchNaver") }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.unmatched.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
            {t("cheonanCardNoPriceSection")}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.unmatched.map((m) => (
              <div key={m.konaSeq} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                <strong style={{ fontSize: 13 }}>{m.name}</strong>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.address}</div>
                {m.tel && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.tel}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
