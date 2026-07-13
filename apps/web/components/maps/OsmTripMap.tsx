"use client";

import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon, SpeedPoint } from "../../lib/maps/polyline";
import { buildSpeedSegments, sampleForArrows } from "../../lib/maps/polyline";
import { RecenterButton } from "./RecenterButton";

function fitToPoints(map: ReturnType<typeof useMap>, points: LatLon[]) {
  if (points.length === 0) return;
  import("leaflet").then((L) => {
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24] });
  });
}

function FitBounds({ points }: { points: LatLon[] }) {
  const map = useMap();

  useEffect(() => {
    fitToPoints(map, points);
  }, [map, points]);

  return null;
}

function LeafletRecenterControl({ points }: { points: LatLon[] }) {
  const map = useMap();
  return <RecenterButton onClick={() => fitToPoints(map, points)} />;
}

// 진행 방향을 나타내는 화살표 마커 (leaflet은 서버사이드에서 L.divIcon을 만들 수 없어 동적 로드가 필요).
function ArrowMarkers({ points }: { points: LatLon[] }) {
  const [icons, setIcons] = useState<{ point: LatLon; bearing: number; icon: any }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      const arrows = sampleForArrows(points, 6).map((a) => ({
        ...a,
        icon: L.divIcon({
          className: "",
          html: `<div style="transform: rotate(${a.bearing}deg); color: #18523f; font-size: 18px; line-height: 1;">▲</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }));
      setIcons(arrows);
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  if (!icons) return null;
  return (
    <>
      {icons.map((a, i) => (
        <Marker key={i} position={[a.point.lat, a.point.lon]} icon={a.icon} interactive={false} />
      ))}
    </>
  );
}

export function OsmTripMap({ points }: { points: SpeedPoint[] }) {
  const center = points[0] ?? { lat: 37.5665, lon: 126.978 };
  const start = points[0];
  const end = points[points.length - 1];
  const segments = buildSpeedSegments(points);

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={13}
      style={{ height: 240, width: "100%", borderRadius: 8 }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.length > 0 && (
        <>
          {segments.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg.path.map((p) => [p.lat, p.lon] as [number, number])}
              pathOptions={{ color: seg.color, weight: 4 }}
            />
          ))}
          <ArrowMarkers points={points} />
          <CircleMarker center={[start.lat, start.lon]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#10b981", fillOpacity: 1 }} />
          <CircleMarker center={[end.lat, end.lon]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#ef4444", fillOpacity: 1 }} />
          <FitBounds points={points} />
          <LeafletRecenterControl points={points} />
        </>
      )}
    </MapContainer>
  );
}
