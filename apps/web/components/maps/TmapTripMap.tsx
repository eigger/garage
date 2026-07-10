"use client";

import { useEffect, useRef, useState } from "react";
import type { SpeedPoint } from "../../lib/maps/polyline";
import { buildSpeedSegments, circleMarkerDataUri } from "../../lib/maps/polyline";
import { loadTmapSdk } from "../../lib/maps/loadSdk";

export function TmapTripMap({ points, appKey }: { points: SpeedPoint[]; appKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

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

        for (const seg of buildSpeedSegments(points)) {
          new Tmapv2.Polyline({
            path: seg.path.map((p) => new Tmapv2.LatLng(p.lat, p.lon)),
            strokeColor: seg.color,
            strokeWeight: 4,
            map,
          });
        }

        // 출발(초록)/도착(빨강) 지점을 색상으로 구분해 경로 방향성을 표시한다.
        new Tmapv2.Marker({ position: path[0], icon: circleMarkerDataUri("#10b981"), map });
        new Tmapv2.Marker({ position: path[path.length - 1], icon: circleMarkerDataUri("#ef4444"), map });

        const bounds = new Tmapv2.LatLngBounds();
        for (const ll of path) bounds.extend(ll);
        map.fitBounds(bounds);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, points]);

  if (error) {
    return <p style={{ fontSize: 13, color: "#a12a24" }}>{error}</p>;
  }

  return (
    <div
      ref={containerRef}
      style={{ height: 240, width: "100%", borderRadius: 8, background: "#f1f5f9" }}
    />
  );
}

type TmapApi = {
  LatLng: new (lat: number, lon: number) => object;
  LatLngBounds: new () => { extend: (ll: object) => void };
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => { fitBounds: (b: object) => void };
  Polyline: new (opts: Record<string, unknown>) => object;
  Marker: new (opts: Record<string, unknown>) => object;
};
