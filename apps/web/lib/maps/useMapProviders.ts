"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { MapProvidersConfig } from "./types";

export function useMapProviders(): MapProvidersConfig {
  const [config, setConfig] = useState<MapProvidersConfig>({
    providers: ["osm"],
    kakaoAppKey: null,
    naverClientId: null,
    tmapAppKey: null,
  });

  useEffect(() => {
    apiFetch("/api/map/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MapProvidersConfig | null) => {
        if (data) setConfig(data);
      })
      .catch(() => {});
  }, []);

  return config;
}
