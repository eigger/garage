"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
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
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
  }, [user, vehicleId]);

  if (authLoading) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user) return null;

  const basePath = `/vehicles/${vehicleId}`;
  const tabs = [
    { href: basePath, label: t("navOverview") },
    { href: `${basePath}/quick-log`, label: t("navQuickLog") },
    { href: `${basePath}/schedule`, label: t("navSchedule") },
    { href: `${basePath}/history`, label: t("navHistory") },
    ...(isAdmin ? [{ href: `${basePath}/access`, label: t("navAccess") }] : []),
  ];

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      {vehicle && (
        <h1>
          {vehicle.name} {vehicle.plate ? `(${vehicle.plate})` : ""}
          {vehicle.fuelType ? ` · ${t(fuelTypeLabelKey(vehicle.fuelType))}` : ""}
        </h1>
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
