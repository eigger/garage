"use client";

import { useEffect } from "react";

import { withBasePath } from "../lib/base-path";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // 프리픽스 아래에서 등록해야 스코프도 그 하위로 잡힌다.
    navigator.serviceWorker.register(withBasePath("/sw.js")).catch((err) => {
      console.warn("service worker 등록 실패", err);
    });
  }, []);

  return null;
}
