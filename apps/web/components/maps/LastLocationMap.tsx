"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapProvider } from "@garage/shared";
import { loadKakaoMaps, loadNaverMaps, loadTmapSdk } from "../../lib/maps/loadSdk";
import { numberedMarkerDataUri } from "../../lib/maps/polyline";
import { DARK_MAP_FILTER, OSM_TILE_DARK, OSM_TILE_LIGHT } from "../../lib/maps/darkMode";
import { useIsDarkMode } from "../../lib/useIsDarkMode";
import { RecenterButton } from "./RecenterButton";

const DEFAULT_ZOOM = 16;
const STATION_MARKER_COLOR = "#f59e0b";
/** 선택 강조 — 브랜드 primary에 가까운 녹색 */
const SELECTED_STATION_MARKER_COLOR = "#18523f";
/** Kakao Maps는 zoom이 아니라 level(작을수록 확대). DEFAULT_ZOOM≈16에 가까운 값. */
const KAKAO_DEFAULT_LEVEL = 3;

// number는 NearbyStationsCard의 리스트 순번(1부터)과 맞춰서, 지도 마커와 리스트 항목을
// 클릭/호버 없이도 번호로 바로 매칭할 수 있게 한다.
export type StationMarker = { id: string; lat: number; lon: number; name: string; number: number };

function markerColor(id: string, selectedStationId?: string | null): string {
  return id === selectedStationId ? SELECTED_STATION_MARKER_COLOR : STATION_MARKER_COLOR;
}

function markerSize(id: string, selectedStationId?: string | null): number {
  return id === selectedStationId ? 28 : 24;
}

function totalMapPoints(stations: StationMarker[], showOriginMarker: boolean): number {
  return stations.length + (showOriginMarker ? 1 : 0);
}

function LeafletRecenterControl({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  return <RecenterButton onClick={() => map.setView([lat, lon], DEFAULT_ZOOM)} />;
}

// 주유소/충전소 검색 결과가 생기면 차량 위치 + 결과 전체가 한 화면에 들어오도록 뷰를 맞춘다.
function LeafletInvalidateOnShow({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(id);
  }, [active, map]);
  return null;
}

function LeafletFitBounds({
  lat,
  lon,
  stations,
  includeOrigin,
}: {
  lat: number;
  lon: number;
  stations: StationMarker[];
  includeOrigin: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = stations.map((s) => [s.lat, s.lon]);
    if (includeOrigin) points.unshift([lat, lon]);
    if (points.length === 0) return;

    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      // 점 1개면 fitBounds가 최대 줌으로 붙는다 — setView로 DEFAULT_ZOOM 유지.
      if (points.length === 1) {
        map.setView(points[0], DEFAULT_ZOOM);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, stations, map, includeOrigin]);
  return null;
}

type StationMapExtras = {
  selectedStationId?: string | null;
  onStationClick?: (id: string) => void;
};

function OsmLocationMap({
  lat,
  lon,
  stations,
  isDark,
  showOriginMarker,
  active,
  selectedStationId,
  onStationClick,
}: {
  lat: number;
  lon: number;
  stations: StationMarker[];
  isDark: boolean;
  showOriginMarker: boolean;
  active: boolean;
} & StationMapExtras) {
  const [markerIcon, setMarkerIcon] = useState<any>(null);
  const [leaflet, setLeaflet] = useState<any>(null);
  const pinColor = isDark ? "#34d399" : "#18523f";
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        className: "",
        html: `
          <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="${pinColor}" stroke="#ffffff" stroke-width="1.5"/>
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
  }, [pinColor]);

  const tile = isDark ? OSM_TILE_DARK : OSM_TILE_LIGHT;

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%", zIndex: 1 }}
      scrollWheelZoom={true}
    >
      <TileLayer attribution={tile.attribution} url={tile.url} />
      {showOriginMarker && markerIcon && <Marker position={[lat, lon]} icon={markerIcon} />}
      {leaflet &&
        stations.map((s) => {
          const size = markerSize(s.id, selectedStationId);
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              eventHandlers={{
                click: () => onClickRef.current?.(s.id),
              }}
              icon={leaflet.icon({
                iconUrl: numberedMarkerDataUri(s.number, markerColor(s.id, selectedStationId)),
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              })}
            >
              <Popup>{s.name}</Popup>
            </Marker>
          );
        })}
      {showOriginMarker && <LeafletRecenterControl lat={lat} lon={lon} />}
      <LeafletFitBounds lat={lat} lon={lon} stations={stations} includeOrigin={showOriginMarker} />
      <LeafletInvalidateOnShow active={active} />
    </MapContainer>
  );
}

type StationMarkerHandle = { id: string; number: number; marker: any };

function KakaoLocationMap({
  lat,
  lon,
  appKey,
  stations,
  isDark,
  showOriginMarker,
  active,
  selectedStationId,
  onStationClick,
}: {
  lat: number;
  lon: number;
  appKey: string;
  stations: StationMarker[];
  isDark: boolean;
  showOriginMarker: boolean;
  active: boolean;
} & StationMapExtras) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const stationMarkersRef = useRef<StationMarkerHandle[]>([]);
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    // stations 변경으로 지도를 다시 만드는 경로 — 재생성이 끝날 때까지 ready를 내려
    // 실패 시 이전 지도의 컨트롤이 남지 않게 하고, 표시 직후 relayout이 다시 돌게 한다.
    setReady(false);
    stationMarkersRef.current = [];

    loadKakaoMaps(appKey)
      .then(() => {
        if (cancelled) return;
        const kakao = (window as any).kakao?.maps;
        if (!kakao) throw new Error("Kakao maps unavailable");

        const position = new kakao.LatLng(lat, lon);
        const map = new kakao.Map(el, {
          center: position,
          level: KAKAO_DEFAULT_LEVEL,
        });
        mapRef.current = map;

        if (showOriginMarker) {
          new kakao.Marker({ position }).setMap(map);
        }

        for (const s of stations) {
          const size = markerSize(s.id, selectedStationId);
          const marker = new kakao.Marker({
            position: new kakao.LatLng(s.lat, s.lon),
            image: new kakao.MarkerImage(
              numberedMarkerDataUri(s.number, markerColor(s.id, selectedStationId)),
              new kakao.Size(size, size),
            ),
          });
          marker.setMap(map);
          kakao.event.addListener(marker, "click", () => onClickRef.current?.(s.id));
          stationMarkersRef.current.push({ id: s.id, number: s.number, marker });
        }

        // 점 1개짜리 bounds는 최대 줌으로 붙는다 — 2개 이상일 때만 fitBounds.
        if (totalMapPoints(stations, showOriginMarker) >= 2) {
          const bounds = new kakao.LatLngBounds();
          if (showOriginMarker) bounds.extend(position);
          for (const s of stations) bounds.extend(new kakao.LatLng(s.lat, s.lon));
          map.setBounds(bounds);
        } else if (stations.length === 1) {
          map.setCenter(new kakao.LatLng(stations[0].lat, stations[0].lon));
          map.setLevel(KAKAO_DEFAULT_LEVEL);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // selectedStationId는 별도 effect에서 아이콘만 갱신 — 지도 remount 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, lat, lon, stations, showOriginMarker]);

  useEffect(() => {
    if (!ready) return;
    const kakao = (window as any).kakao?.maps;
    if (!kakao) return;
    for (const { id, number, marker } of stationMarkersRef.current) {
      const size = markerSize(id, selectedStationId);
      marker.setImage(
        new kakao.MarkerImage(
          numberedMarkerDataUri(number, markerColor(id, selectedStationId)),
          new kakao.Size(size, size),
        ),
      );
    }
  }, [selectedStationId, ready]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    const id = window.setTimeout(() => {
      mapRef.current?.relayout?.();
    }, 0);
    return () => window.clearTimeout(id);
  }, [active, ready]);

  function handleRecenter() {
    const kakao = (window as any).kakao?.maps;
    if (!kakao || !mapRef.current) return;
    mapRef.current.setCenter(new kakao.LatLng(lat, lon));
    mapRef.current.setLevel(KAKAO_DEFAULT_LEVEL);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          background: "var(--color-surface-secondary)",
          borderRadius: 8,
          filter: isDark ? DARK_MAP_FILTER : undefined,
        }}
      />
      {ready && showOriginMarker && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

function NaverLocationMap({
  lat,
  lon,
  clientId,
  stations,
  isDark,
  showOriginMarker,
  active,
  selectedStationId,
  onStationClick,
}: {
  lat: number;
  lon: number;
  clientId: string;
  stations: StationMarker[];
  isDark: boolean;
  showOriginMarker: boolean;
  active: boolean;
} & StationMapExtras) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const stationMarkersRef = useRef<StationMarkerHandle[]>([]);
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    setReady(false);
    stationMarkersRef.current = [];

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

        if (showOriginMarker) {
          new naver.Marker({ position, map });
        }

        for (const s of stations) {
          const size = markerSize(s.id, selectedStationId);
          const marker = new naver.Marker({
            map,
            position: new naver.LatLng(s.lat, s.lon),
            icon: {
              url: numberedMarkerDataUri(s.number, markerColor(s.id, selectedStationId)),
              size: new naver.Size(size, size),
            },
          });
          naver.Event.addListener(marker, "click", () => onClickRef.current?.(s.id));
          stationMarkersRef.current.push({ id: s.id, number: s.number, marker });
        }

        if (totalMapPoints(stations, showOriginMarker) >= 2) {
          const seed = stations[0]
            ? new naver.LatLng(stations[0].lat, stations[0].lon)
            : position;
          const bounds = new naver.LatLngBounds(seed, seed);
          if (showOriginMarker) bounds.extend(position);
          for (const s of stations) bounds.extend(new naver.LatLng(s.lat, s.lon));
          map.fitBounds(bounds);
        } else if (stations.length === 1) {
          map.setCenter(new naver.LatLng(stations[0].lat, stations[0].lon));
          map.setZoom(DEFAULT_ZOOM);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, lat, lon, stations, showOriginMarker]);

  useEffect(() => {
    if (!ready) return;
    const naver = (window as any).naver?.maps;
    if (!naver) return;
    for (const { id, number, marker } of stationMarkersRef.current) {
      const size = markerSize(id, selectedStationId);
      marker.setIcon({
        url: numberedMarkerDataUri(number, markerColor(id, selectedStationId)),
        size: new naver.Size(size, size),
      });
    }
  }, [selectedStationId, ready]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    const id = window.setTimeout(() => {
      mapRef.current?.autoResize?.();
    }, 0);
    return () => window.clearTimeout(id);
  }, [active, ready]);

  function handleRecenter() {
    const naver = (window as any).naver?.maps;
    if (!naver || !mapRef.current) return;
    mapRef.current.setCenter(new naver.LatLng(lat, lon));
    mapRef.current.setZoom(DEFAULT_ZOOM);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          background: "var(--color-surface-secondary)",
          borderRadius: 8,
          filter: isDark ? DARK_MAP_FILTER : undefined,
        }}
      />
      {ready && showOriginMarker && <RecenterButton onClick={handleRecenter} />}
    </div>
  );
}

function TmapLocationMap({
  lat,
  lon,
  appKey,
  stations,
  isDark,
  showOriginMarker,
  active,
  selectedStationId,
  onStationClick,
}: {
  lat: number;
  lon: number;
  appKey: string;
  stations: StationMarker[];
  isDark: boolean;
  showOriginMarker: boolean;
  active: boolean;
} & StationMapExtras) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const stationMarkersRef = useRef<StationMarkerHandle[]>([]);
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    setReady(false);
    stationMarkersRef.current = [];

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

        if (showOriginMarker) {
          new Tmapv2.Marker({ position, map });
        }

        for (const s of stations) {
          const marker = new Tmapv2.Marker({
            position: new Tmapv2.LatLng(s.lat, s.lon),
            icon: numberedMarkerDataUri(s.number, markerColor(s.id, selectedStationId)),
            iconSize: new Tmapv2.Size(markerSize(s.id, selectedStationId), markerSize(s.id, selectedStationId)),
            map,
          });
          marker.addListener("click", () => onClickRef.current?.(s.id));
          stationMarkersRef.current.push({ id: s.id, number: s.number, marker });
        }

        if (totalMapPoints(stations, showOriginMarker) >= 2) {
          const bounds = new Tmapv2.LatLngBounds();
          if (showOriginMarker) bounds.extend(position);
          for (const s of stations) bounds.extend(new Tmapv2.LatLng(s.lat, s.lon));
          map.fitBounds(bounds);
        } else if (stations.length === 1) {
          map.setCenter(new Tmapv2.LatLng(stations[0].lat, stations[0].lon));
          map.setZoom(DEFAULT_ZOOM);
        }

        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, lat, lon, stations, showOriginMarker]);

  useEffect(() => {
    if (!ready) return;
    const Tmapv2 = (window as any).Tmapv2;
    if (!Tmapv2) return;
    for (const { id, number, marker } of stationMarkersRef.current) {
      const size = markerSize(id, selectedStationId);
      try {
        marker.setIcon(numberedMarkerDataUri(number, markerColor(id, selectedStationId)));
        if (typeof marker.setIconSize === "function") {
          marker.setIconSize(new Tmapv2.Size(size, size));
        }
      } catch {
        // Tmap 버전에 따라 setIcon 시그니처가 다를 수 있다.
      }
    }
  }, [selectedStationId, ready]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    const el = containerRef.current;
    const id = window.setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      try {
        // Tmapv2.Map.resize는 (width, height)를 받는 시그니처로 알려져 있다.
        // 인자 없이 부르면 setTimeout 안에서 예외가 삼켜지지 않을 수 있어 크기를 명시한다.
        const w = el?.clientWidth ?? 0;
        const h = el?.clientHeight ?? 0;
        if (w > 0 && h > 0 && typeof map.resize === "function") {
          map.resize(w, h);
        }
      } catch {
        // Tmap 버전·환경에 따라 resize 시그니처가 다를 수 있다 — 실패해도 지도 자체는 유지.
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [active, ready]);

  function handleRecenter() {
    const Tmapv2 = (window as any).Tmapv2;
    if (!Tmapv2 || !mapRef.current) return;
    mapRef.current.setCenter(new Tmapv2.LatLng(lat, lon));
    mapRef.current.setZoom(DEFAULT_ZOOM);
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 8 }}>{error}</p>;
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          background: "var(--color-surface-secondary)",
          borderRadius: 8,
          filter: isDark ? DARK_MAP_FILTER : undefined,
        }}
      />
      {ready && showOriginMarker && <RecenterButton onClick={handleRecenter} />}
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
  /** false면 차량/원점 핀을 그리지 않는다(가맹 주유소만 표시할 때). 기본 true. */
  showOriginMarker?: boolean;
  /** display:none으로 숨겼다가 다시 보일 때 리사이즈. 기본 true. */
  active?: boolean;
  selectedStationId?: string | null;
  onStationClick?: (id: string) => void;
};

export function LastLocationMap({
  lat,
  lon,
  provider,
  kakaoAppKey,
  naverClientId,
  tmapAppKey,
  stations = [],
  showOriginMarker = true,
  active = true,
  selectedStationId = null,
  onStationClick,
}: LastLocationMapProps) {
  const isDark = useIsDarkMode();

  if (provider === "kakao" && kakaoAppKey) {
    return (
      <KakaoLocationMap
        lat={lat}
        lon={lon}
        appKey={kakaoAppKey}
        stations={stations}
        isDark={isDark}
        showOriginMarker={showOriginMarker}
        active={active}
        selectedStationId={selectedStationId}
        onStationClick={onStationClick}
      />
    );
  }

  if (provider === "naver" && naverClientId) {
    return (
      <NaverLocationMap
        lat={lat}
        lon={lon}
        clientId={naverClientId}
        stations={stations}
        isDark={isDark}
        showOriginMarker={showOriginMarker}
        active={active}
        selectedStationId={selectedStationId}
        onStationClick={onStationClick}
      />
    );
  }

  if (provider === "tmap" && tmapAppKey) {
    return (
      <TmapLocationMap
        lat={lat}
        lon={lon}
        appKey={tmapAppKey}
        stations={stations}
        isDark={isDark}
        showOriginMarker={showOriginMarker}
        active={active}
        selectedStationId={selectedStationId}
        onStationClick={onStationClick}
      />
    );
  }

  return (
    <OsmLocationMap
      lat={lat}
      lon={lon}
      stations={stations}
      isDark={isDark}
      showOriginMarker={showOriginMarker}
      active={active}
      selectedStationId={selectedStationId}
      onStationClick={onStationClick}
    />
  );
}
