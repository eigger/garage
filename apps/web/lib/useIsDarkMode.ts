"use client";

import { useEffect, useState } from "react";
import { useSettings } from "./i18n/settings-context";

// "시스템"이면 OS 다크모드 설정을 실시간으로 따라가야 하므로 matchMedia 구독이 필요하다.
export function useIsDarkMode(): boolean {
  const { theme } = useSettings();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    function handleChange(e: MediaQueryListEvent) {
      setSystemDark(e.matches);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return theme === "system" ? systemDark : theme === "dark";
}
