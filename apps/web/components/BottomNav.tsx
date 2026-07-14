"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/i18n/settings-context";
import { getLastVehicleId } from "../lib/lastVehicle";
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
  const { t } = useSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastVehicleId, setLastVehicleIdState] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; updateAvailable: boolean } | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastVehicleIdState(getLastVehicleId());
  }, [pathname]);

  // 지난 정비 스케줄 개수 — 차량 홈 화면의 배너를 없앤 대신 하단 네비 "정비 스케줄" 탭에
  // 숫자 배지로 표시한다. 페이지 이동 시마다 다시 불러와 확인/조치 후 반영되게 한다.
  useEffect(() => {
    if (!user) return;
    apiFetch("/api/reminders")
      .then((res) => (res.ok ? res.json() : []))
      .then((all: { isDue: boolean }[]) => {
        setDueCount(all.filter((r) => r.isDue).length);
      })
      .catch(() => {});
  }, [user, pathname]);

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

  const vehicleId = extractVehicleId(pathname) ?? lastVehicleId;
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
                <span className="icon" style={{ position: "relative" }}>
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
                {tab.label}
              </Link>
            );
          })}
          <button type="button" className={`bottom-nav-more ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen((v) => !v)}>
            <span className="icon" style={{ position: "relative" }}>
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
    </>
  );
}
