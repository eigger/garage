"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSettings } from "../../../lib/i18n/settings-context";
import { SettingsBar } from "../../settings-bar";
import { fuelTypeLabelKey } from "../../../lib/fuelType";
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

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
    ...(isAdmin
      ? [
          { href: `${basePath}/access`, label: t("navAccess") },
          { href: `${basePath}/integration`, label: t("navIntegration") },
        ]
      : []),
  ];

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      {vehicle && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>
            {vehicle.name} {vehicle.plate ? `(${vehicle.plate})` : ""}
            {vehicle.fuelType ? ` · ${t(fuelTypeLabelKey(vehicle.fuelType))}` : ""}
          </h1>
          {allVehicles.length > 1 && (
            <select
              value={vehicleId}
              onChange={(e) => handleSwitchVehicle(e.target.value)}
              aria-label={t("switchVehicle")}
              style={{ minHeight: 36, fontSize: 13, padding: "0 8px", flexShrink: 0 }}
            >
              {allVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </option>
              ))}
            </select>
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
        }}
      >
        {tabs.map((tab) => {
          const active = tab.href === basePath ? pathname === basePath : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: "8px 12px",
                fontSize: 14,
                whiteSpace: "nowrap",
                borderBottom: active ? "2px solid #18523f" : "2px solid transparent",
                color: active ? "#18523f" : "#666",
                fontWeight: active ? 600 : 400,
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
