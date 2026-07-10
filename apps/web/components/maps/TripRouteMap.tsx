"use client";

import dynamic from "next/dynamic";
import type { MapProvider } from "@garage/shared";
import type { SpeedPoint } from "../../lib/maps/polyline";
import { KakaoTripMap } from "./KakaoTripMap";
import { NaverTripMap } from "./NaverTripMap";
import { TmapTripMap } from "./TmapTripMap";

const OsmTripMap = dynamic(() => import("./OsmTripMap").then((m) => ({ default: m.OsmTripMap })), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f5f9",
        borderRadius: 8,
        fontSize: 13,
        color: "#666",
      }}
    >
      …
    </div>
  ),
});

type TripRouteMapProps = {
  points: SpeedPoint[];
  provider: MapProvider;
  kakaoAppKey: string | null;
  naverClientId: string | null;
  tmapAppKey: string | null;
  noRouteLabel: string;
};

export function TripRouteMap({
  points,
  provider,
  kakaoAppKey,
  naverClientId,
  tmapAppKey,
  noRouteLabel,
}: TripRouteMapProps) {
  if (points.length === 0) {
    return <p style={{ fontSize: 13, color: "#666", margin: 0 }}>{noRouteLabel}</p>;
  }

  if (provider === "kakao" && kakaoAppKey) {
    return <KakaoTripMap points={points} appKey={kakaoAppKey} />;
  }

  if (provider === "naver" && naverClientId) {
    return <NaverTripMap points={points} clientId={naverClientId} />;
  }

  if (provider === "tmap" && tmapAppKey) {
    return <TmapTripMap points={points} appKey={tmapAppKey} />;
  }

  return <OsmTripMap points={points} />;
}
