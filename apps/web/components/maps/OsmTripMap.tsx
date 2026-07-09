"use client";

import { useEffect } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon } from "../../lib/maps/polyline";

function FitBounds({ points }: { points: LatLon[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    import("leaflet").then((L) => {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [24, 24] });
    });
  }, [map, points]);

  return null;
}

export function OsmTripMap({ points }: { points: LatLon[] }) {
  const center = points[0] ?? { lat: 37.5665, lon: 126.978 };
  const positions = points.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={13}
      style={{ height: 240, width: "100%", borderRadius: 8 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {positions.length > 0 && (
        <>
          <Polyline positions={positions} pathOptions={{ color: "#18523f", weight: 4 }} />
          <FitBounds points={points} />
        </>
      )}
    </MapContainer>
  );
}
