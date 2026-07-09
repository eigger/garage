"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLon } from "../../lib/maps/polyline";
import { loadNaverMaps } from "../../lib/maps/loadSdk";

export function NaverTripMap({ points, clientId }: { points: LatLon[]; clientId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || points.length === 0) return;

    let cancelled = false;

    loadNaverMaps(clientId)
      .then(() => {
        if (cancelled) return;
        const naver = (window as { naver?: { maps: NaverMapsApi } }).naver?.maps;
        if (!naver) throw new Error("Naver maps unavailable");

        const path = points.map((p) => new naver.LatLng(p.lat, p.lon));
        const map = new naver.Map(el, {
          center: path[0],
          zoom: 12,
        });
        new naver.Polyline({
          map,
          path,
          strokeColor: "#18523f",
          strokeWeight: 4,
        });

        const bounds = new naver.LatLngBounds(path[0], path[path.length - 1]);
        for (const ll of path) {
          bounds.extend(ll);
        }
        map.fitBounds(bounds);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, points]);

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

type NaverMapsApi = {
  Map: new (el: HTMLElement, opts: { center: object; zoom: number }) => { fitBounds: (b: object) => void };
  LatLng: new (lat: number, lon: number) => object;
  LatLngBounds: new (a: object, b: object) => { extend: (ll: object) => void };
  Polyline: new (opts: { map: object; path: object[]; strokeColor: string; strokeWeight: number }) => object;
};
