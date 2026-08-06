"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { PageLoader } from "../../../../components/PageLoader";
import { NearbyStationsCard } from "../../../../components/NearbyStationsCard";
import { CheonanCardPanel } from "../../../../components/CheonanCardPanel";
import { useMapProviders } from "../../../../lib/maps/useMapProviders";
import type { Vehicle } from "../../../../lib/types";

type MainTab = "nearby" | "cheonan";
type GeoState =
  | { status: "idle" | "loading" }
  | { status: "ready"; lat: number; lon: number }
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

  const isElectric = vehicle?.fuelType === "ELECTRIC";
  const showCheonanTab = !!cheonanEnabled && !isElectric;
  const requestedTab = searchParams.get("tab");

  // 천안 탭이 없거나 꺼진 상태인데 ?tab=cheonan이면 URL만 nearby로 정리
  useEffect(() => {
    if (loading || cheonanEnabled === null) return;
    if (requestedTab === "cheonan" && !showCheonanTab) {
      router.replace(`/vehicles/${vehicleId}/stations`, { scroll: false });
    }
  }, [loading, cheonanEnabled, requestedTab, showCheonanTab, router, vehicleId]);

  const activeTab: MainTab =
    requestedTab === "cheonan" && showCheonanTab ? "cheonan" : "nearby";

  const requestBrowserLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "unsupported" });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "ready",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        // PERMISSION_DENIED = 1
        setGeo({ status: err.code === 1 ? "denied" : "error" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  // 주변 탭 진입 시 한 번 브라우저 GPS 요청 (거절/오류는 재시도 버튼으로만)
  useEffect(() => {
    if (loading || !vehicle) return;
    if (activeTab !== "nearby") return;
    if (geo.status !== "idle") return;
    requestBrowserLocation();
  }, [loading, vehicle, activeTab, geo.status, requestBrowserLocation]);

  function setTab(tab: MainTab) {
    const qs = tab === "cheonan" ? "?tab=cheonan" : "";
    router.replace(`/vehicles/${vehicleId}/stations${qs}`, { scroll: false });
  }

  if (loading || !vehicle) return <PageLoader />;

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
          {(geo.status === "idle" || geo.status === "loading") && (
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
                  onClick={requestBrowserLocation}
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
          {geo.status === "ready" && (
            <NearbyStationsCard
              key={`${vehicleId}:${geo.lat.toFixed(5)}:${geo.lon.toFixed(5)}`}
              vehicleId={vehicleId}
              fuelType={vehicle.fuelType}
              lat={geo.lat}
              lon={geo.lon}
              mapConfig={mapConfig}
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
