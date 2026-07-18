"use client";

import { useEffect, useRef, useState } from "react";
import type { SpeedPoint } from "../../lib/maps/polyline";
import { ROUTE_ARROW_COUNT, arrowMarkerDataUri, buildSpeedSegments, circleMarkerDataUri, sampleForArrows } from "../../lib/maps/polyline";
import { loadNaverMaps } from "../../lib/maps/loadSdk";
import { RecenterButton } from "./RecenterButton";

export function NaverTripMap({ points, clientId }: { points: SpeedPoint[]; clientId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ fitBounds: (b: object) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
        mapRef.current = map;

        for (const seg of buildSpeedSegments(points)) {
          new naver.Polyline({
            map,
            path: seg.path.map((p) => new naver.LatLng(p.lat, p.lon)),
            strokeColor: seg.color,
            strokeWeight: 4,
          });
        }

        // 경로 전체에서 몇 개만 골라 진행 방향 화살표를 표시한다 (전 구간에 찍으면 지저분해짐).
        for (const a of sampleForArrows(points, ROUTE_ARROW_COUNT)) {
          new naver.Marker({
            map,
            position: new naver.LatLng(a.point.lat, a.point.lon),
            icon: { url: arrowMarkerDataUri(a.bearing, "#18523f"), size: new naver.Size(20, 20) },
          });
        }

        // 출발(초록)/도착(빨강) 지점을 색상으로 구분해 경로 방향성을 표시한다.
        new naver.Marker({ map, position: path[0], icon: { url: circleMarkerDataUri("#10b981"), size: new naver.Size(20, 20) } });
        new naver.Marker({ map, position: path[path.length - 1], icon: { url: circleMarkerDataUri("#ef4444"), size: new naver.Size(20, 20) } });

        const bounds = new naver.LatLngBounds(path[0], path[path.length - 1]);
        for (const ll of path) {
          bounds.extend(ll);
        }
        map.fitBounds(bounds);
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, points]);

  function handleRecenter() {
    const naver = (window as { naver?: { maps: NaverMapsApi } }).naver?.maps;
    if (!naver || !mapRef.current || points.length === 0) return;
    const path = points.map((p) => new naver.LatLng(p.lat, p.lon));
    const bounds = new naver.LatLngBounds(path[0], path[path.length - 1]);
    for (const ll of path) {
      bounds.extend(ll);
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

type NaverMapsApi = {
  Map: new (el: HTMLElement, opts: { center: object; zoom: number }) => { fitBounds: (b: object) => void };
  LatLng: new (lat: number, lon: number) => object;
  LatLngBounds: new (a: object, b: object) => { extend: (ll: object) => void };
  Polyline: new (opts: { map: object; path: object[]; strokeColor: string; strokeWeight: number }) => object;
  Marker: new (opts: { map: object; position: object; icon: { url: string; size: object } }) => object;
  Size: new (width: number, height: number) => object;
};
