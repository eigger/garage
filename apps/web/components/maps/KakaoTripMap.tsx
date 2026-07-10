"use client";

import { useEffect, useRef, useState } from "react";
import type { SpeedPoint } from "../../lib/maps/polyline";
import { buildSpeedSegments, circleMarkerDataUri } from "../../lib/maps/polyline";
import { loadKakaoMaps } from "../../lib/maps/loadSdk";

export function KakaoTripMap({ points, appKey }: { points: SpeedPoint[]; appKey: string }) {
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

        for (const seg of buildSpeedSegments(points)) {
          new kakao.Polyline({
            path: seg.path.map((p) => new kakao.LatLng(p.lat, p.lon)),
            strokeWeight: 4,
            strokeColor: seg.color,
          }).setMap(map);
        }

        // 출발(초록)/도착(빨강) 지점을 색상으로 구분해 경로 방향성을 표시한다.
        new kakao.Marker({
          position: path[0],
          image: new kakao.MarkerImage(circleMarkerDataUri("#10b981"), new kakao.Size(20, 20)),
        }).setMap(map);
        new kakao.Marker({
          position: path[path.length - 1],
          image: new kakao.MarkerImage(circleMarkerDataUri("#ef4444"), new kakao.Size(20, 20)),
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
  Marker: new (opts: { position: object; image?: object }) => { setMap: (map: object) => void };
  MarkerImage: new (src: string, size: object) => object;
  Size: new (width: number, height: number) => object;
};
