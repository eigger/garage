"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapProvider } from "@garage/shared";
import { loadKakaoMaps, loadNaverMaps, loadTmapSdk } from "../../lib/maps/loadSdk";

function OsmLocationMap({ lat, lon }: { lat: number; lon: number }) {
  const [markerIcon, setMarkerIcon] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        className: "",
        html: `
          <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#18523f" stroke="#ffffff" stroke-width="1.5"/>
            </svg>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      setMarkerIcon(icon);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={16}
      style={{ height: "100%", width: "100%", zIndex: 1 }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markerIcon && (
        <Marker position={[lat, lon]} icon={markerIcon} />
      )}
    </MapContainer>
  );
}

function KakaoLocationMap({ lat, lon, appKey }: { lat: number; lon: number; appKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    loadKakaoMaps(appKey)
      .then(() => {
        if (cancelled) return;
        const kakao = (window as any).kakao?.maps;
        if (!kakao) throw new Error("Kakao maps unavailable");

        const position = new kakao.LatLng(lat, lon);
        const map = new kakao.Map(el, {
          center: position,
          level: 3,
        });

        const marker = new kakao.Marker({
          position,
        });
        marker.setMap(map);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, lat, lon]);

  if (error) return <p style={{ fontSize: 13, color: "#a12a24", margin: 8 }}>{error}</p>;
  return <div ref={containerRef} style={{ height: "100%", width: "100%", background: "#f1f5f9", borderRadius: 8 }} />;
}

function NaverLocationMap({ lat, lon, clientId }: { lat: number; lon: number; clientId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    loadNaverMaps(clientId)
      .then(() => {
        if (cancelled) return;
        const naver = (window as any).naver?.maps;
        if (!naver) throw new Error("Naver maps unavailable");

        const position = new naver.LatLng(lat, lon);
        const map = new naver.Map(el, {
          center: position,
          zoom: 16,
        });

        new naver.Marker({
          position,
          map,
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, lat, lon]);

  if (error) return <p style={{ fontSize: 13, color: "#a12a24", margin: 8 }}>{error}</p>;
  return <div ref={containerRef} style={{ height: "100%", width: "100%", background: "#f1f5f9", borderRadius: 8 }} />;
}

function TmapLocationMap({ lat, lon, appKey }: { lat: number; lon: number; appKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    loadTmapSdk(appKey)
      .then(() => {
        if (cancelled) return;
        const Tmapv2 = (window as any).Tmapv2;
        if (!Tmapv2) throw new Error("Tmap SDK unavailable");

        const position = new Tmapv2.LatLng(lat, lon);
        const map = new Tmapv2.Map(el, {
          center: position,
          width: "100%",
          height: "100%",
          zoom: 16,
        });

        new Tmapv2.Marker({
          position,
          map,
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, lat, lon]);

  if (error) return <p style={{ fontSize: 13, color: "#a12a24", margin: 8 }}>{error}</p>;
  return <div ref={containerRef} style={{ height: "100%", width: "100%", background: "#f1f5f9", borderRadius: 8 }} />;
}

type LastLocationMapProps = {
  lat: number;
  lon: number;
  provider: MapProvider;
  kakaoAppKey: string | null;
  naverClientId: string | null;
  tmapAppKey: string | null;
};

export function LastLocationMap({
  lat,
  lon,
  provider,
  kakaoAppKey,
  naverClientId,
  tmapAppKey,
}: LastLocationMapProps) {
  if (provider === "kakao" && kakaoAppKey) {
    return <KakaoLocationMap lat={lat} lon={lon} appKey={kakaoAppKey} />;
  }

  if (provider === "naver" && naverClientId) {
    return <NaverLocationMap lat={lat} lon={lon} clientId={naverClientId} />;
  }

  if (provider === "tmap" && tmapAppKey) {
    return <TmapLocationMap lat={lat} lon={lon} appKey={tmapAppKey} />;
  }

  return <OsmLocationMap lat={lat} lon={lon} />;
}
