"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLon } from "../../lib/maps/polyline";
import { loadKakaoMaps } from "../../lib/maps/loadSdk";

export function KakaoTripMap({ points, appKey }: { points: LatLon[]; appKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    let cancelled = false;

    loadKakaoMaps(appKey)
      .then(() => {
        if (cancelled) return;
        const kakao = (window as { kakao?: { maps: KakaoMapsApi } }).kakao?.maps;
        if (!kakao) throw new Error("Kakao maps unavailable");

        const path = points.map((p) => new kakao.LatLng(p.lat, p.lon));
        const map = new kakao.Map(el, {
          center: path[0],
          level: 5,
        });
        new kakao.Polyline({
          path,
          strokeWeight: 4,
          strokeColor: "#18523f",
        }).setMap(map);

        const bounds = new kakao.LatLngBounds();
        for (const ll of path) bounds.extend(ll);
        map.setBounds(bounds);
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

type KakaoMapsApi = {
  Map: new (el: HTMLElement, opts: { center: object; level: number }) => { setBounds: (b: object) => void };
  LatLng: new (lat: number, lon: number) => object;
  LatLngBounds: new () => { extend: (ll: object) => void };
  Polyline: new (opts: { path: object[]; strokeWeight: number; strokeColor: string }) => {
    setMap: (map: object) => void;
  };
};
