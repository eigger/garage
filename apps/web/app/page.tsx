"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { useSettings } from "../lib/i18n/settings-context";
import { useAuth } from "../lib/auth-context";
import { SettingsBar } from "./settings-bar";
import type { Reminder, Vehicle } from "../lib/types";

export default function Home() {
  const { user, loading: authLoading, requireAuth, logout } = useAuth();
  const { t, formatDistance } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;

    async function load() {
      const [vehiclesRes, remindersRes] = await Promise.all([
        apiFetch("/api/vehicles"),
        apiFetch("/api/reminders"),
      ]);
      setVehicles(await vehiclesRes.json());
      setReminders(await remindersRes.json());
      setLoading(false);
    }

    load();
  }, [user]);

  const dueReminders = reminders.filter((r) => r.isDue);

  async function dismissReminder(id: string) {
    const res = await apiFetch(`/api/reminders/${id}/dismiss`, { method: "POST" });
    if (res.ok) setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  if (authLoading || (user && loading)) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="container">
      <SettingsBar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("appTitle")}</h1>
        <button onClick={logout} style={{ background: "transparent", color: "#18523f", minHeight: 32 }}>
          {t("logout")}
        </button>
      </div>
      <p>{t("appTagline")}</p>

      {dueReminders.length > 0 && (
        <section className="reminder-banner">
          <strong>{t("reminderBannerTitle", { count: dueReminders.length })}</strong>
          <ul className="list" style={{ marginTop: 8 }}>
            {dueReminders.map((r) => (
              <li
                key={r.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
              >
                <span>
                  {t("reminderItemDue", { vehicle: r.vehicleName, type: t(r.type as any) })}
                  {r.dueOdometer !== null && (
                    <>
                      {" — "}
                      {t("reminderDueOdometer", { distance: formatDistance(r.dueOdometer) })}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  style={{ minHeight: 32, flexShrink: 0 }}
                  onClick={() => dismissReminder(r.id)}
                >
                  {t("dismissReminder")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: "24px 0 8px" }}>{t("vehiclesHeading")}</h2>
        {user.role === "ADMIN" && (
          <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/vehicles">{t("manageVehicles")}</Link>
            <Link href="/users">{t("manageUsers")}</Link>
            <Link href="/maintenance-presets">{t("presetsHeading")}</Link>
            <Link href="/integrations">{t("navIntegrations")}</Link>
          </span>
        )}
      </div>

      {vehicles.length === 0 ? (
        <p>{t("noVehicles")}</p>
      ) : (
        <ul className="list">
          {vehicles.map((v) => (
            <li key={v.id} className="list-item">
              <Link href={`/vehicles/${v.id}`}>
                {v.name} {v.plate ? `(${v.plate})` : ""}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
