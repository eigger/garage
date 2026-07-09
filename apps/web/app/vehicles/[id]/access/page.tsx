"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import type { User, VehicleAccess } from "../../../../lib/types";
import type { TranslationKey } from "../../../../lib/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export default function VehicleAccessPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t } = useSettings();

  return <VehicleAccessSection vehicleId={vehicleId} t={t} />;
}

function VehicleAccessSection({ vehicleId, t }: { vehicleId: string; t: Translator }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [access, setAccess] = useState<VehicleAccess[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [usersRes, accessRes] = await Promise.all([
      apiFetch("/api/auth/users"),
      apiFetch(`/api/vehicles/${vehicleId}/access`),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (accessRes.ok) setAccess(await accessRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setHasAccess(userId: string, hasAccess: boolean) {
    const res = hasAccess
      ? await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
          method: "PUT",
          body: JSON.stringify({ canViewLocation: false }),
        })
      : await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastSaved"), "success");
    } else {
      showToast(t("toastError"), "error");
    }
    await load();
  }

  async function setCanViewLocation(userId: string, canViewLocation: boolean) {
    const res = await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ canViewLocation }),
    });
    if (res.ok) {
      showToast(t("toastSaved"), "success");
    } else {
      showToast(t("toastError"), "error");
    }
    await load();
  }

  if (loading) return null;

  const generalUsers = users.filter((u) => u.role === "GENERAL");

  return (
    <section>
      <h2>{t("vehicleAccessHeading")}</h2>
      {generalUsers.length === 0 ? (
        <p>{t("noGeneralUsers")}</p>
      ) : (
        <ul className="list">
          {generalUsers.map((u) => {
            const entry = access.find((a) => a.userId === u.id);
            const hasAccess = !!entry;
            return (
              <li
                key={u.id}
                className="list-item"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
              >
                <span>
                  {u.name} ({u.email})
                </span>
                <span style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={hasAccess}
                      onChange={(e) => setHasAccess(u.id, e.target.checked)}
                      style={{ minHeight: "auto", width: "auto" }}
                    />
                    {t("accessAllowed")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={entry?.canViewLocation ?? false}
                      disabled={!hasAccess}
                      onChange={(e) => setCanViewLocation(u.id, e.target.checked)}
                      style={{ minHeight: "auto", width: "auto" }}
                    />
                    {t("viewLocationAllowed")}
                  </label>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
