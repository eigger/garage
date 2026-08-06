"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import { PageLoader } from "../../../../components/PageLoader";
import { NearbyStationsCard } from "../../../../components/NearbyStationsCard";
import { CheonanCardPanel } from "../../../../components/CheonanCardPanel";
import { useMapProviders } from "../../../../lib/maps/useMapProviders";
import type { Vehicle } from "../../../../lib/types";

type MainTab = "nearby" | "cheonan";
type LocationSource = "vehicle" | "browser";

type GeoState =
  | { status: "idle" }
  | { status: "loading"; keepReady?: { lat: number; lon: number; source: LocationSource } }
  | { status: "ready"; lat: number; lon: number; source: LocationSource }
  | { status: "denied" | "unsupported" | "error" };

function tabButtonStyle(active: boolean) {
  return {
    flex: 1,
    minHeight: 40,
    fontSize: 14,
    background: active ? "var(--color-primary)" : "var(--color-surface-secondary)",
    color: active ? "var(--color-text-on-primary)" : "var(--color-text-on-secondary)",
  } as const;
}

function vehicleHasLocation(vehicle: Vehicle): vehicle is Vehicle & { latitude: number; longitude: number } {
  return vehicle.latitude != null && vehicle.longitude != null;
}

export default function StationsSearchPage() {
  return (
    <Suspense fallback={null}>
      <StationsSearchPageInner />
    </Suspense>
  );
}

function StationsSearchPageInner() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useSettings();
  const { showToast } = useToast();
  const mapConfig = useMapProviders();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cheonanEnabled, setCheonanEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`).then((res) => (res.ok ? res.json() : null)),
      apiFetch("/api/cheonan-card/config")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([v, config]) => {
      if (cancelled) return;
      setVehicle(v);
      setCheonanEnabled(!!config?.enabled);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  // 차량이 바뀌면 위치 원점도 다시 잡는다.
  useEffect(() => {
    setGeo({ status: "idle" });
  }, [vehicleId]);

  const isElectric = vehicle?.fuelType === "ELECTRIC";
  const showCheonanTab = !!cheonanEnabled && !isElectric;
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (loading || cheonanEnabled === null) return;
    if (requestedTab === "cheonan" && !showCheonanTab) {
      router.replace(`/vehicles/${vehicleId}/stations`, { scroll: false });
    }
  }, [loading, cheonanEnabled, requestedTab, showCheonanTab, router, vehicleId]);

  const activeTab: MainTab =
    requestedTab === "cheonan" && showCheonanTab ? "cheonan" : "nearby";

  const requestBrowserLocation = useCallback(
    (opts?: { soft?: boolean }) => {
      const soft = !!opts?.soft;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        if (soft) {
          showToast(t("stationsLocationUnsupported"), "error");
          return;
        }
        setGeo({ status: "unsupported" });
        return;
      }

      setGeo((prev) => {
        if (soft && prev.status === "ready") {
          return { status: "loading", keepReady: { lat: prev.lat, lon: prev.lon, source: prev.source } };
        }
        // 갱신 중 재클릭 — 기존 원점을 유지한 채 로딩만 계속
        if (soft && prev.status === "loading" && prev.keepReady) {
          return prev;
        }
        return { status: "loading" };
      });

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeo({
            status: "ready",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: "browser",
          });
        },
        (err) => {
          if (soft) {
            // 이미 쓸 수 있는 원점이 있으면 화면을 유지하고 토스트만.
            setGeo((prev) => {
              if (prev.status === "loading" && prev.keepReady) {
                return { status: "ready", ...prev.keepReady };
              }
              return prev.status === "ready" ? prev : { status: err.code === 1 ? "denied" : "error" };
            });
            showToast(t("stationsLocationRefreshFailed"), "error");
            return;
          }
          setGeo({ status: err.code === 1 ? "denied" : "error" });
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: soft ? 0 : 60_000 },
      );
    },
    [showToast, t],
  );

  // 주변 탭: 차량 GPS 우선, 없으면 브라우저 GPS 폴백
  useEffect(() => {
    if (loading || !vehicle) return;
    if (activeTab !== "nearby") return;
    if (geo.status !== "idle") return;

    if (vehicleHasLocation(vehicle)) {
      setGeo({
        status: "ready",
        lat: vehicle.latitude,
        lon: vehicle.longitude,
        source: "vehicle",
      });
      return;
    }
    requestBrowserLocation();
  }, [loading, vehicle, activeTab, geo.status, requestBrowserLocation]);

  function setTab(tab: MainTab) {
    const qs = tab === "cheonan" ? "?tab=cheonan" : "";
    router.replace(`/vehicles/${vehicleId}/stations${qs}`, { scroll: false });
  }

  if (loading || !vehicle) return <PageLoader />;

  const displayOrigin =
    geo.status === "ready"
      ? geo
      : geo.status === "loading" && geo.keepReady
        ? { status: "ready" as const, ...geo.keepReady }
        : null;
  const refreshing = geo.status === "loading" && !!geo.keepReady;
  const blockingLocate = geo.status === "idle" || (geo.status === "loading" && !geo.keepReady);

  return (
    <>
      <section className="card" style={{ marginTop: 8, marginBottom: 8 }}>
        <h1 style={{ margin: showCheonanTab ? "0 0 12px" : 0, fontSize: 18 }}>{t("navStationsSearch")}</h1>
        {showCheonanTab && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setTab("nearby")} style={tabButtonStyle(activeTab === "nearby")}>
              {t("stationsTabNearby")}
            </button>
            <button type="button" onClick={() => setTab("cheonan")} style={tabButtonStyle(activeTab === "cheonan")}>
              {t("stationsTabCheonan")}
            </button>
          </div>
        )}
      </section>

      {activeTab === "nearby" && (
        <>
          {blockingLocate && (
            <section className="card" style={{ marginTop: 8 }}>
              <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{t("stationsLocating")}</p>
            </section>
          )}
          {(geo.status === "denied" || geo.status === "unsupported" || geo.status === "error") && (
            <section className="card" style={{ marginTop: 8 }}>
              <p style={{ margin: "0 0 10px", color: "var(--color-text-muted)" }}>
                {geo.status === "unsupported" ? t("stationsLocationUnsupported") : t("stationsLocationDenied")}
              </p>
              {geo.status !== "unsupported" && (
                <button
                  type="button"
                  onClick={() => requestBrowserLocation()}
                  style={{
                    fontSize: 13,
                    padding: "6px 12px",
                    minHeight: "auto",
                    background: "var(--color-primary)",
                    color: "var(--color-text-on-primary)",
                  }}
                >
                  {t("stationsLocationRetry")}
                </button>
              )}
            </section>
          )}
          {displayOrigin && (
            <NearbyStationsCard
              key={vehicleId}
              vehicleId={vehicleId}
              fuelType={vehicle.fuelType}
              lat={displayOrigin.lat}
              lon={displayOrigin.lon}
              locationSource={displayOrigin.source}
              locationUpdatedAt={vehicle.locationUpdatedAt ?? null}
              mapConfig={mapConfig}
              refreshingLocation={refreshing}
              onRefreshBrowserLocation={() => requestBrowserLocation({ soft: true })}
            />
          )}
        </>
      )}

      {activeTab === "cheonan" && showCheonanTab && (
        <section className="card" style={{ marginTop: 8 }}>
          <CheonanCardPanel
            vehicleId={vehicleId}
            vehicle={vehicle}
            enabled={cheonanEnabled}
            showChrome={false}
          />
        </section>
      )}
    </>
  );
}
