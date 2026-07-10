"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSettings } from "../../../lib/i18n/settings-context";
import { SettingsBar } from "../../settings-bar";
import { fuelTypeLabelKey } from "../../../lib/fuelType";
import { setLastVehicleId } from "../../../lib/lastVehicle";
import { SettingsGearIcon, LockIcon, LinkIcon } from "../../../components/icons";
import type { Vehicle } from "../../../lib/types";

export default function VehicleLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsMenuOpen]);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // PWA 홈 화면 숏컷("빠른 입력")이 어느 차량으로 이동할지 알 수 있도록 마지막으로
  // 둘러본 차량을 기억해둔다.
  useEffect(() => {
    if (vehicleId) setLastVehicleId(vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
  }, [user, vehicleId]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/vehicles")
      .then((res) => (res.ok ? res.json() : []))
      .then(setAllVehicles);
  }, [user]);

  const basePath = `/vehicles/${vehicleId}`;

  function handleSwitchVehicle(nextId: string) {
    if (!nextId || nextId === vehicleId) return;
    const suffix = pathname?.startsWith(basePath) ? pathname.slice(basePath.length) : "";
    router.push(`/vehicles/${nextId}${suffix}`);
  }

  if (authLoading) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user) return null;

  const tabs = [
    { href: basePath, label: t("navOverview") },
    { href: `${basePath}/quick-log`, label: t("navQuickLog") },
    { href: `${basePath}/schedule`, label: t("navSchedule") },
    { href: `${basePath}/history`, label: t("navHistory") },
  ];

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      {vehicle && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, width: "100%" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(18px, 4.5vw, 24px)", wordBreak: "break-all", flex: "1 1 0%", minWidth: 0 }}>
            {vehicle.name} {vehicle.plate ? `(${vehicle.plate})` : ""}
            {vehicle.fuelType ? ` · ${t(fuelTypeLabelKey(vehicle.fuelType))}` : ""}
          </h1>
          {allVehicles.length > 1 && (
            <select
              value={vehicleId}
              onChange={(e) => handleSwitchVehicle(e.target.value)}
              aria-label={t("switchVehicle")}
              style={{ height: 36, minHeight: 36, fontSize: 13, padding: "0 28px 0 8px", flexShrink: 0 }}
            >
              {allVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <div ref={settingsMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setSettingsMenuOpen((v) => !v)}
                aria-label={t("vehicleManagementHeading")}
                style={{
                  width: 36,
                  height: 36,
                  minHeight: 36,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: settingsMenuOpen ? "#18523f" : "#eee",
                  color: settingsMenuOpen ? "#fff" : "#333",
                  borderRadius: 8,
                  border: "none",
                }}
              >
                <SettingsGearIcon />
              </button>
              {settingsMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    zIndex: 10,
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    minWidth: 160,
                    overflow: "hidden",
                  }}
                >
                  <Link
                    href={`${basePath}/access`}
                    onClick={() => setSettingsMenuOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 14, color: "#333", textDecoration: "none" }}
                  >
                    <LockIcon /> {t("navAccess")}
                  </Link>
                  <Link
                    href={`${basePath}/integration`}
                    onClick={() => setSettingsMenuOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 14, color: "#333", textDecoration: "none", borderTop: "1px solid #f0f0f0" }}
                  >
                    <LinkIcon /> {t("navIntegration")}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <nav
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #e5e5e5",
          marginBottom: 16,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
        className="no-scrollbar"
      >
        {tabs.map((tab) => {
          const active = tab.href === basePath ? pathname === basePath : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                whiteSpace: "nowrap",
                borderBottom: active ? "2px solid #18523f" : "2px solid transparent",
                color: active ? "#18523f" : "#666",
                fontWeight: active ? 600 : 400,
                flexShrink: 0,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </main>
  );
}
