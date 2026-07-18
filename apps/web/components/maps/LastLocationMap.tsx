"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapProvider } from "@garage/shared";
import { loadKakaoMaps, loadNaverMaps, loadTmapSdk } from "../../lib/maps/loadSdk";
import { numberedMarkerDataUri } from "../../lib/maps/polyline";
import { RecenterButton } from "./RecenterButton";

const DEFAULT_ZOOM = 16;
const STATION_MARKER_COLOR = "#f59e0b";

// number는 NearbyStationsCard의 리스트 순번(1부터)과 맞춰서, 지도 마커와 리스트 항목을
// 클릭/호버 없이도 번호로 바로 매칭할 수 있게 한다.
export type StationMarker = { id: string; lat: number; lon: number; name: string; number: number };

function LeafletRecenterControl({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  return <RecenterButton onClick={() => map.setView([lat, lon], DEFAULT_ZOOM)} />;
}

// 주유소/충전소 검색 결과가 생기면 차량 위치 + 결과 전체가 한 화면에 들어오도록 뷰를 맞춘다.
function LeafletFitBounds({ lat, lon, stations }: { lat: number; lon: number; stations: StationMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length === 0) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      const bounds = L.latLngBounds([
        [lat, lon],
        ...stations.map((s): [number, number] => [s.lat, s.lon]),
      ]);
      map.fitBounds(bounds, { padding: [30, 30] });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, stations, map]);
  return null;
}

function OsmLocationMap({ lat, lon, stations }: { lat: number; lon: number; stations: StationMarker[] }) {
  const [markerIcon, setMarkerIcon] = useState<any>(null);
  const [leaflet, setLeaflet] = useState<any>(null);

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
      setLeaflet(L);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={DEFAULT_ZOOM}
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
      {leaflet &&
        stations.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lon]}
            icon={leaflet.icon({
              iconUrl: numberedMarkerDataUri(s.number, STATION_MARKER_COLOR),
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
          >
            <Popup>{s.name}</Popup>
          </Marker>
        ))}
      <LeafletRecenterControl lat={lat} lon={lon} />
      <LeafletFitBounds lat={lat} lon={lon} stations={stations} />
    </MapContainer>
  );
}

function KakaoLocationMap({ lat, lon, appKey, stations }: { lat: number; lon: number; appKey: string; stations: StationMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
        mapRef.current = map;

        const marker = new kakao.Marker({
          position,
        });
        marker.setMap(map);

        for (const s of stations) {
          new kakao.Marker({
            position: new kakao.LatLng(s.lat, s.lon),
            image: new kakao.MarkerImage(numberedMarkerDataUri(s.number, STATION_MARKER_COLOR), new kakao.Size(24, 24)),
          }).setMap(map);
        }

        if (stations.length > 0) {
          const bounds = new kakao.LatLngBounds();
          bounds.extend(position);
          for (const s of stations) bounds.extend(new kakao.LatLng(s.lat, s.lon));
          map.setBounds(bounds);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, lat, lon, stations]);

  function handleRecenter() {
    const kakao = (window as any).kakao?.maps;
    if (!kakao || !mapRef.current) return;
    mapRef.current.setCenter(new kakao.LatLng(lat, lon));
    mapRef.current.setLevel(3);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%", background: "var(--color-surface-secondary)", borderRadius: 8 }} />
      {ready && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

function NaverLocationMap({ lat, lon, clientId, stations }: { lat: number; lon: number; clientId: string; stations: StationMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
          zoom: DEFAULT_ZOOM,
        });
        mapRef.current = map;

        new naver.Marker({
          position,
          map,
        });

        for (const s of stations) {
          new naver.Marker({
            map,
            position: new naver.LatLng(s.lat, s.lon),
            icon: { url: numberedMarkerDataUri(s.number, STATION_MARKER_COLOR), size: new naver.Size(24, 24) },
          });
        }

        if (stations.length > 0) {
          const bounds = new naver.LatLngBounds(position, position);
          bounds.extend(position);
          for (const s of stations) bounds.extend(new naver.LatLng(s.lat, s.lon));
          map.fitBounds(bounds);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, lat, lon, stations]);

  function handleRecenter() {
    const naver = (window as any).naver?.maps;
    if (!naver || !mapRef.current) return;
    mapRef.current.setCenter(new naver.LatLng(lat, lon));
    mapRef.current.setZoom(DEFAULT_ZOOM);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%", background: "var(--color-surface-secondary)", borderRadius: 8 }} />
      {ready && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

function TmapLocationMap({ lat, lon, appKey, stations }: { lat: number; lon: number; appKey: string; stations: StationMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
          zoom: DEFAULT_ZOOM,
        });
        mapRef.current = map;

        new Tmapv2.Marker({
          position,
          map,
        });

        for (const s of stations) {
          new Tmapv2.Marker({
            position: new Tmapv2.LatLng(s.lat, s.lon),
            icon: numberedMarkerDataUri(s.number, STATION_MARKER_COLOR),
            map,
          });
        }

        if (stations.length > 0) {
          const bounds = new Tmapv2.LatLngBounds();
          bounds.extend(position);
          for (const s of stations) bounds.extend(new Tmapv2.LatLng(s.lat, s.lon));
          map.fitBounds(bounds);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, lat, lon, stations]);

  function handleRecenter() {
    const Tmapv2 = (window as any).Tmapv2;
    if (!Tmapv2 || !mapRef.current) return;
    mapRef.current.setCenter(new Tmapv2.LatLng(lat, lon));
    mapRef.current.setZoom(DEFAULT_ZOOM);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%", background: "var(--color-surface-secondary)", borderRadius: 8 }} />
      {ready && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

type LastLocationMapProps = {
  lat: number;
  lon: number;
  provider: MapProvider;
  kakaoAppKey: string | null;
  naverClientId: string | null;
  tmapAppKey: string | null;
  stations?: StationMarker[];
};

export function LastLocationMap({
  lat,
  lon,
  provider,
  kakaoAppKey,
  naverClientId,
  tmapAppKey,
  stations = [],
}: LastLocationMapProps) {
  if (provider === "kakao" && kakaoAppKey) {
    return <KakaoLocationMap lat={lat} lon={lon} appKey={kakaoAppKey} stations={stations} />;
  }

  if (provider === "naver" && naverClientId) {
    return <NaverLocationMap lat={lat} lon={lon} clientId={naverClientId} stations={stations} />;
  }

  if (provider === "tmap" && tmapAppKey) {
    return <TmapLocationMap lat={lat} lon={lon} appKey={tmapAppKey} stations={stations} />;
  }

  return <OsmLocationMap lat={lat} lon={lon} stations={stations} />;
}
