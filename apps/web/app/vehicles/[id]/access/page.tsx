"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { useToast } from "../../../../lib/toast-context";
import { useConfirm } from "../../../../lib/confirm-context";
import { PageLoader } from "../../../../components/PageLoader";
import type { DirectoryUser, Vehicle, VehicleAccess } from "../../../../lib/types";

export default function VehicleAccessPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const router = useRouter();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [access, setAccess] = useState<VehicleAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [vehicleRes, directoryRes, accessRes] = await Promise.all([
      apiFetch(`/api/vehicles/${vehicleId}`),
      apiFetch("/api/auth/users/directory"),
      apiFetch(`/api/vehicles/${vehicleId}/access`),
    ]);
    // 관리 권한이 없으면 접근권한 조회 자체가 403이다 — 차량 화면으로 돌려보낸다.
    if (!accessRes.ok) {
      router.replace(`/vehicles/${vehicleId}`);
      return;
    }
    if (vehicleRes.ok) setVehicle(await vehicleRes.json());
    if (directoryRes.ok) setDirectory(await directoryRes.json());
    setAccess(await accessRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addMember(userId: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ canViewLocation: false }),
      });
      showToast(res.ok ? t("toastSaved") : t("toastError"), res.ok ? "success" : "error");
      setSelectedUserId("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!(await confirm(t("removeAccessConfirm")))) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
        method: "DELETE",
      });
      showToast(res.ok ? t("toastDeleted") : t("toastError"), res.ok ? "success" : "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setCanViewLocation(userId: string, canViewLocation: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ canViewLocation }),
      });
      showToast(res.ok ? t("toastSaved") : t("toastError"), res.ok ? "success" : "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader />;

  const sharedIds = new Set(access.map((a) => a.userId));
  const addable = directory.filter((d) => !sharedIds.has(d.id));
  const ownerId = vehicle?.createdByUserId ?? null;

  return (
    <section className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>{t("shareVehicleHeading")}</h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-muted)" }}>
        {t("shareVehicleDesc")}
      </p>

      {access.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>{t("noGeneralUsers")}</p>
      ) : (
        <ul className="list">
          {access.map((a) => (
            <li key={a.userId} className="list-item" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ minWidth: 0 }}>
                  {a.name}
                  {a.userId === ownerId && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
                      ({t("vehicleOwnerLabel")})
                    </span>
                  )}
                  <br />
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{a.email}</span>
                </span>
                {/* 등록자를 공유 목록에서 빼면 자기 차량이 목록에서 사라지므로 서버가 막는다. */}
                {a.userId !== ownerId && (
                  <button
                    type="button"
                    className="btn-action btn-action-danger"
                    disabled={busy}
                    onClick={() => removeMember(a.userId)}
                    style={{ flexShrink: 0 }}
                  >
                    {t("removeAccess")}
                  </button>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={a.canViewLocation}
                  disabled={busy}
                  onChange={(e) => setCanViewLocation(a.userId, e.target.checked)}
                  style={{ minHeight: "auto", width: "auto" }}
                />
                {t("viewLocationAllowed")}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>{t("addMember")}</div>
        {addable.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("noMembersToAdd")}
          </p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="form-select"
              value={selectedUserId}
              disabled={busy}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">{t("selectMember")}</option>
              {addable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedUserId}
              onClick={() => addMember(selectedUserId)}
              style={{ flexShrink: 0, width: "auto", minWidth: 72 }}
            >
              {t("save")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
