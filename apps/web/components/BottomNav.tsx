"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastVehicleIdState(getLastVehicleId());
  }, [pathname]);

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
                  <tab.Icon />
                </span>
                {tab.label}
              </Link>
            );
          })}
          <button type="button" className={`bottom-nav-more ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((v) => !v)}>
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
                    backgroundColor: "#ff4d4f",
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
                    backgroundColor: "#ff4d4f",
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
