"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken, API_URL } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/i18n/settings-context";
import { getLastVehicleId } from "../lib/lastVehicle";
import { countScheduleStatuses } from "../lib/scheduleStatus";
import type { ConsumablePart } from "../lib/types";
import {
  HomeIcon,
  CalendarIcon,
  BoltIcon,
  HistoryIcon,
  MoreDotsIcon,
  CarIcon,
  UsersIcon,
  WrenchIcon,
  PlugIcon,
  TerminalIcon,
  LockIcon,
  LinkIcon,
  BarChartIcon,
  UserIcon,
  DatabaseIcon,
  LogoutIcon,
  AwardIcon,
  DownloadIcon,
} from "./icons";

// 차량 상세 화면(/vehicles/[id]/*)에 있을 때만 경로에서 차량 id를 뽑아낸다.
// 그 외 화면(대시보드 등)에서는 마지막으로 보던 차량으로 대신 이동시킨다.
function extractVehicleId(pathname: string | null): string | null {
  const match = pathname?.match(/^\/vehicles\/([^/]+)/);
  return match ? match[1] : null;
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const { t, locale } = useSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCategory, setExportCategory] = useState<"trips" | "maintenance" | "fuel">("trips");
  const [exportPeriod, setExportPeriod] = useState<"week" | "month" | "year" | "all">("all");
  const [lastVehicleId, setLastVehicleIdState] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; updateAvailable: boolean } | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastVehicleIdState(getLastVehicleId());
  }, [pathname]);

  const vehicleId = extractVehicleId(pathname) ?? lastVehicleId;

  // 지난 정비 스케줄 개수 — 정비 스케줄 화면과 항상 같은 숫자가 나오도록 리마인더(dismiss
  // 여부가 섞여 들어가는) 대신 스케줄 화면과 동일하게 소모품 데이터에서 직접 계산한다.
  useEffect(() => {
    if (!user || !vehicleId) {
      setDueCount(0);
      return;
    }
    Promise.all([
      apiFetch(`/api/consumable-parts?vehicleId=${vehicleId}`),
      apiFetch(`/api/vehicles/${vehicleId}/odometer`),
    ])
      .then(async ([partsRes, odoRes]) => {
        if (!partsRes.ok || !odoRes.ok) {
          setDueCount(0);
          return;
        }
        const parts: ConsumablePart[] = await partsRes.json();
        const odometer = (await odoRes.json()).odometer as number;
        setDueCount(countScheduleStatuses(parts, odometer).due);
      })
      .catch(() => setDueCount(0));
  }, [user, vehicleId]);

  useEffect(() => {
    if (!user) return;
    fetch("/health")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.updateAvailable === "boolean") {
          setUpdateInfo({
            latestVersion: data.latestVersion,
            updateAvailable: data.updateAvailable,
          });
        }
      })
      .catch((err) => console.error("Failed to check update:", err));
  }, [user]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (!user || pathname === "/login") return null;

  const basePath = vehicleId ? `/vehicles/${vehicleId}` : null;

  function go(href: string) {
    setMoreOpen(false);
    router.push(href);
  }

  const tabs: { key: string; href: string | null; label: string; Icon: typeof HomeIcon; primary?: boolean }[] = [
    { key: "home", href: "/", label: t("navHome"), Icon: HomeIcon },
    { key: "schedule", href: basePath ? `${basePath}/schedule` : null, label: t("navSchedule"), Icon: CalendarIcon },
    { key: "quicklog", href: basePath ? `${basePath}/quick-log` : null, label: t("navQuickLog"), Icon: BoltIcon, primary: true },
    { key: "history", href: basePath ? `${basePath}/history` : null, label: t("navHistory"), Icon: HistoryIcon },
  ];

  // 더보기 시트에서만 갈 수 있는 화면들 — 이 중 하나에 있으면 시트가 닫혀 있어도
  // "더보기" 탭을 현재 위치로 강조한다 (다른 탭 href와 안 겹치게 정확히 일치할 때만).
  const moreRoutes = [
    basePath ? `${basePath}/analytics` : null,
    basePath ? `${basePath}/level` : null,
    basePath ? `${basePath}/access` : null,
    basePath ? `${basePath}/integration` : null,
    "/vehicles",
    "/users",
    "/maintenance-presets",
    "/integrations",
    "/api-explorer",
    "/profile",
    "/backup",
  ].filter((r): r is string => r !== null);
  const moreActive = moreOpen || moreRoutes.some((r) => pathname === r);

  return (
    <>
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {tabs.map((tab) => {
            const active =
              tab.href !== null &&
              (tab.key === "home" ? pathname === "/" || pathname === basePath : pathname?.startsWith(tab.href));
            if (tab.primary) {
              return (
                <Link
                  key={tab.key}
                  href={tab.href ?? "#"}
                  className={`primary-tab ${active ? "active" : ""} ${!tab.href ? "disabled" : ""}`}
                  aria-disabled={!tab.href}
                >
                  <span className="icon-wrap">
                    <span className="icon">
                      <tab.Icon />
                    </span>
                  </span>
                  {tab.label}
                </Link>
              );
            }
            return (
              <Link
                key={tab.key}
                href={tab.href ?? "#"}
                className={`${active ? "active" : ""} ${!tab.href ? "disabled" : ""}`}
                aria-disabled={!tab.href}
              >
                <span className="icon">
                  <span style={{ position: "relative", display: "flex" }}>
                    <tab.Icon />
                    {tab.key === "schedule" && dueCount > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -10,
                          minWidth: 16,
                          height: 16,
                          padding: "0 4px",
                          borderRadius: 8,
                          background: "var(--color-danger)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1,
                        }}
                      >
                        {dueCount > 99 ? "99+" : dueCount}
                      </span>
                    )}
                  </span>
                </span>
                {tab.label}
              </Link>
            );
          })}
          <button type="button" className={`bottom-nav-more ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen((v) => !v)}>
            <span className="icon">
              <span style={{ position: "relative", display: "flex" }}>
                <MoreDotsIcon />
                {updateInfo?.updateAvailable && (
                  <span
                    title={`New version v${updateInfo.latestVersion} is available!`}
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "var(--color-danger)",
                    }}
                  />
                )}
              </span>
            </span>
            {t("navMore")}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet-card" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <strong
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--color-text-muted)",
                margin: "0 0 8px",
              }}
            >
              <MoreDotsIcon size={14} /> {t("navMoreMenuHeading")}
            </strong>

            {basePath && (
              <>
                <div className="sheet-group-label">{t("navVehicleMenuHeading")}</div>
                <div className="sheet-grid">
                  <button type="button" className="sheet-item" onClick={() => go(`${basePath}/analytics`)}>
                    <BarChartIcon size={20} /> {t("navAnalytics")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go(`${basePath}/level`)}>
                    <AwardIcon size={20} /> {t("navLevel")}
                  </button>
                  {isAdmin && (
                    <button type="button" className="sheet-item" onClick={() => go(`${basePath}/access`)}>
                      <LockIcon size={20} /> {t("navAccess")}
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="sheet-item" onClick={() => go(`${basePath}/integration`)}>
                      <LinkIcon size={20} /> {t("navIntegration")}
                    </button>
                  )}
                  <button type="button" className="sheet-item" onClick={() => { setMoreOpen(false); setExportOpen(true); }}>
                    <DownloadIcon size={20} /> {t("exportReportsHeading")}
                  </button>
                </div>
              </>
            )}

            {isAdmin && (
              <>
                <div className="sheet-group-label">{t("navMoreMenuHeading")}</div>
                <div className="sheet-grid">
                  <button type="button" className="sheet-item" onClick={() => go("/vehicles")}>
                    <CarIcon size={20} /> {t("manageVehicles")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/users")}>
                    <UsersIcon size={20} /> {t("manageUsers")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/maintenance-presets")}>
                    <WrenchIcon size={20} /> {t("presetsHeading")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/integrations")}>
                    <PlugIcon size={20} /> {t("navIntegrations")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/api-explorer")}>
                    <TerminalIcon size={20} /> {t("navApiExplorer")}
                  </button>
                </div>
              </>
            )}

            <div className="sheet-group-label">{t("navAccountMenuHeading")}</div>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/profile")}>
                <UserIcon size={20} /> {t("navProfile")}
              </button>
              {isAdmin && (
                <button type="button" className="sheet-item" onClick={() => go("/backup")}>
                  <DatabaseIcon size={20} /> {t("navBackupRestore")}
                </button>
              )}
              <button
                type="button"
                className="sheet-item"
                onClick={() => {
                  setMoreOpen(false);
                  logout();
                }}
              >
                <LogoutIcon size={20} /> {t("logout")}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--color-text-muted-2)",
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              v{process.env.APP_VERSION}
              {updateInfo?.updateAvailable && (
                <span
                  title={`New version v${updateInfo.latestVersion} is available!`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "var(--color-danger)",
                    color: "white",
                    fontSize: 10,
                    fontWeight: "bold",
                    borderRadius: 10,
                    padding: "2px 6px",
                    cursor: "help",
                  }}
                >
                  Update Available
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setExportOpen(false)}
        >
          <div
            style={{
              width: "90%",
              maxWidth: "400px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: 6 }}>
                <DownloadIcon size={18} /> {t("exportReportsHeading")}
              </h3>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-muted)",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  minHeight: "auto",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>&times;</span>
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", display: "block", marginBottom: "6px" }}>
                {t("exportCategoryLabel")}
              </label>
              <select
                value={exportCategory}
                onChange={(e) => setExportCategory(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: "14px",
                }}
              >
                <option value="trips">{t("exportCategoryTrips")}</option>
                <option value="maintenance">{t("exportCategoryMaintenance")}</option>
                <option value="fuel">{t("exportCategoryFuel")}</option>
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", display: "block", marginBottom: "6px" }}>
                {t("exportPeriodLabel")}
              </label>
              <select
                value={exportPeriod}
                onChange={(e) => setExportPeriod(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: "14px",
                }}
              >
                <option value="all">{t("exportPeriodAll")}</option>
                <option value="week">{t("exportPeriodWeek")}</option>
                <option value="month">{t("exportPeriodMonth")}</option>
                <option value="year">{t("exportPeriodYear")}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                const token = getToken();
                const url = `${API_URL}/api/vehicles/${vehicleId}/reports/export?category=${exportCategory}&period=${exportPeriod}&lang=${locale}${token ? `&token=${token}` : ""}`;
                window.open(url, "_blank");
                setExportOpen(false);
              }}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                background: "var(--color-primary)",
                color: "#fff",
                fontWeight: "600",
                cursor: "pointer",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <DownloadIcon size={16} /> {t("exportDownloadButton")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
