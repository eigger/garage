"use client";

import { useEffect, useRef, useState } from "react";
import type { SpeedPoint } from "../../lib/maps/polyline";
import { ROUTE_ARROW_COUNT, arrowMarkerDataUri, buildSpeedSegments, circleMarkerDataUri, sampleForArrows } from "../../lib/maps/polyline";
import { loadTmapSdk } from "../../lib/maps/loadSdk";
import { RecenterButton } from "./RecenterButton";

export function TmapTripMap({ points, appKey }: { points: SpeedPoint[]; appKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ fitBounds: (b: object) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    let cancelled = false;

    loadTmapSdk(appKey)
      .then(() => {
        if (cancelled) return;
        const Tmapv2 = (window as { Tmapv2?: TmapApi }).Tmapv2;
        if (!Tmapv2) throw new Error("Tmap SDK unavailable");

        const path = points.map((p) => new Tmapv2.LatLng(p.lat, p.lon));
        const map = new Tmapv2.Map(el, {
          center: path[0],
          width: "100%",
          height: "240px",
          zoom: 15,
        });
        mapRef.current = map;

        for (const seg of buildSpeedSegments(points)) {
          new Tmapv2.Polyline({
            path: seg.path.map((p) => new Tmapv2.LatLng(p.lat, p.lon)),
            strokeColor: seg.color,
            strokeWeight: 4,
            map,
          });
        }

        // 경로 전체에서 몇 개만 골라 진행 방향 화살표를 표시한다 (전 구간에 찍으면 지저분해짐).
        for (const a of sampleForArrows(points, ROUTE_ARROW_COUNT)) {
          new Tmapv2.Marker({
            position: new Tmapv2.LatLng(a.point.lat, a.point.lon),
            icon: arrowMarkerDataUri(a.bearing, "#18523f"),
            map,
          });
        }

        // 출발(초록)/도착(빨강) 지점을 색상으로 구분해 경로 방향성을 표시한다.
        new Tmapv2.Marker({ position: path[0], icon: circleMarkerDataUri("#10b981"), map });
        new Tmapv2.Marker({ position: path[path.length - 1], icon: circleMarkerDataUri("#ef4444"), map });

        const bounds = new Tmapv2.LatLngBounds();
        for (const ll of path) bounds.extend(ll);
        map.fitBounds(bounds);
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, points]);

  function handleRecenter() {
    const Tmapv2 = (window as { Tmapv2?: TmapApi }).Tmapv2;
    if (!Tmapv2 || !mapRef.current || points.length === 0) return;
    const bounds = new Tmapv2.LatLngBounds();
    for (const p of points) {
      bounds.extend(new Tmapv2.LatLng(p.lat, p.lon));
    }
    mapRef.current.fitBounds(bounds);
  }

  if (error) {
    return <p style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</p>;
  }

  return (
    <div style={{ position: "relative", height: 240, width: "100%" }}>
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%", borderRadius: 8, background: "var(--color-surface-secondary)" }}
      />
      {ready && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

type TmapApi = {
  LatLng: new (lat: number, lon: number) => object;
  LatLngBounds: new () => { extend: (ll: object) => void };
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => { fitBounds: (b: object) => void };
  Polyline: new (opts: Record<string, unknown>) => object;
  Marker: new (opts: Record<string, unknown>) => object;
};
