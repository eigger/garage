"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { PageLoader } from "../../components/PageLoader";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import type { ManagedUser, Role, Vehicle } from "../../lib/types";

// 관리자가 계정을 수정·삭제할 때 서버가 막는 경우들(마지막 관리자, 본인 강등, 중복 이메일)은
// 사용자가 고칠 수 있는 실패라, 일반 "저장 실패" 대신 이유를 그대로 보여준다.
function errorMessageKey(status: number, error: unknown) {
  if (status === 409) return "emailAlreadyUsed" as const;
  if (typeof error === "string") {
    if (error === "last admin") return "lastAdminError" as const;
    if (error === "cannot delete yourself") return "cannotDeleteSelf" as const;
    if (error.startsWith("cannot change your own")) return "cannotEditSelfRole" as const;
  }
  return "saveError" as const;
}

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("GENERAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && user && !isAdmin) router.replace("/");
  }, [authLoading, user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsers() {
    const [usersRes, vehiclesRes] = await Promise.all([
      apiFetch("/api/auth/users"),
      apiFetch("/api/vehicles"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (vehiclesRes.ok) setVehicles(await vehiclesRes.json());
    setLoading(false);
  }

  useEffect(() => {
    if (user && isAdmin) loadUsers();
  }, [user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchUser(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/auth/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        showToast(t(errorMessageKey(res.status, data?.error)), "error");
        return false;
      }
      showToast(t("toastSaved"), "success");
      await loadUsers();
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteUser(target: ManagedUser, isReject: boolean) {
    const lines = [
      isReject
        ? t("rejectUserConfirm")
        : t("deleteUserConfirm", { name: target.name }),
    ];
    if (target.hyundaiLinkedVehicleNames.length > 0) {
      lines.push(
        t("deleteUserHyundaiWarning", {
          vehicles: target.hyundaiLinkedVehicleNames.join(", "),
        }),
      );
    }
    if (!(await confirm(lines.join("\n\n")))) return;

    setBusyId(target.id);
    try {
      const res = await apiFetch(`/api/auth/users/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        showToast(t(errorMessageKey(res.status, data?.error)), "error");
        return;
      }
      showToast(t("toastDeleted"), "success");
      await loadUsers();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(targetId: string) {
    if (resetPassword.length < 8) {
      showToast(t("passwordTooShort"), "error");
      return;
    }
    setBusyId(targetId);
    try {
      const res = await apiFetch(`/api/auth/users/${targetId}/password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      if (!res.ok) {
        showToast(t("toastError"), "error");
        return;
      }
      setResetPassword("");
      showToast(t("toastSaved"), "success");
    } finally {
      setBusyId(null);
    }
  }

  async function setVehicleAccess(
    userId: string,
    vehicleId: string,
    hasAccess: boolean,
    canViewLocation: boolean,
  ) {
    setBusyId(userId);
    try {
      const res = hasAccess
        ? await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, {
            method: "PUT",
            body: JSON.stringify({ canViewLocation }),
          })
        : await apiFetch(`/api/vehicles/${vehicleId}/access/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        showToast(t("toastError"), "error");
        return;
      }
      showToast(t("toastSaved"), "success");
      await loadUsers();
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError(t("requiredField"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordConfirmMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      if (!res.ok) {
        setError(t(res.status === 409 ? "emailAlreadyUsed" : "saveError"));
        showToast(t("toastError"), "error");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setRole("GENERAL");
      showToast(t("toastCreated"), "success");
      await loadUsers();
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (user && isAdmin && loading)) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }

  if (!user || !isAdmin) return null;

  const pendingUsers = users.filter((u) => u.status === "PENDING");
  const activeUsers = users.filter((u) => u.status === "ACTIVE");

  return (
    <main className="container">
      <h1>{t("usersHeading")}</h1>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>
          {t("pendingUsersHeading")}
          {pendingUsers.length > 0 && ` (${pendingUsers.length})`}
        </h2>
        {pendingUsers.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>
            {t("noPendingUsers")}
          </p>
        ) : (
          <ul className="list">
            {pendingUsers.map((u) => (
              <li
                key={u.id}
                className="list-item"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong>{u.name}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{u.email}</span>
                </span>
                <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn-action"
                    disabled={busyId === u.id}
                    onClick={() => patchUser(u.id, { status: "ACTIVE" })}
                  >
                    {t("approve")}
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action-danger"
                    disabled={busyId === u.id}
                    onClick={() => handleDeleteUser(u, true)}
                  >
                    {t("reject")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className="list">
        {activeUsers.map((u) => {
          const expanded = expandedId === u.id;
          const isSelf = u.id === user.id;
          return (
            <li key={u.id} className="list-item" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{u.name}</strong>{" "}
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {u.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}
                  </span>
                  <br />
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{u.email}</span>
                  <br />
                  <span style={{ fontSize: 12, color: "var(--color-text-muted-2)" }}>
                    {t("userVehiclesLabel")}:{" "}
                    {u.role === "ADMIN"
                      ? t("roleAdmin")
                      : u.vehicleAccess.length === 0
                        ? t("userNoVehicles")
                        : u.vehicleAccess.map((v) => v.vehicleName).join(", ")}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => {
                    setExpandedId(expanded ? null : u.id);
                    setResetPassword("");
                  }}
                  style={{ flexShrink: 0 }}
                >
                  {expanded ? t("cancel") : t("edit")}
                </button>
              </div>

              {expanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
                    {t("userRole")}
                  </label>
                  <select
                    className="form-select"
                    value={u.role}
                    disabled={isSelf || busyId === u.id}
                    onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                  >
                    <option value="GENERAL">{t("roleGeneral")}</option>
                    <option value="ADMIN">{t("roleAdmin")}</option>
                  </select>
                  {isSelf && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                      {t("cannotEditSelfRole")}
                    </p>
                  )}

                  {/* 관리자는 전 차량에 접근하므로 배정할 것이 없다 — 일반 사용자에게만 노출한다. */}
                  {u.role === "GENERAL" && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>{t("assignVehicles")}</div>
                      {vehicles.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
                          {t("noVehiclesToAssign")}
                        </p>
                      ) : (
                        vehicles.map((v) => {
                          const entry = u.vehicleAccess.find((a) => a.vehicleId === v.id);
                          const hasAccess = !!entry;
                          return (
                            <div
                              key={v.id}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0" }}
                            >
                              <span style={{ fontSize: 14 }}>{v.name}</span>
                              <span style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={hasAccess}
                                    disabled={busyId === u.id}
                                    onChange={(e) =>
                                      setVehicleAccess(u.id, v.id, e.target.checked, false)
                                    }
                                    style={{ minHeight: "auto", width: "auto" }}
                                  />
                                  {t("accessAllowed")}
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={entry?.canViewLocation ?? false}
                                    disabled={!hasAccess || busyId === u.id}
                                    onChange={(e) =>
                                      setVehicleAccess(u.id, v.id, true, e.target.checked)
                                    }
                                    style={{ minHeight: "auto", width: "auto" }}
                                  />
                                  {t("viewLocationAllowed")}
                                </label>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{t("resetPassword")}</div>
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 6px" }}>
                      {t("resetPasswordDesc")}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("newPassword")}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn-action"
                        disabled={busyId === u.id || resetPassword.length === 0}
                        onClick={() => handleResetPassword(u.id)}
                        style={{ flexShrink: 0 }}
                      >
                        {t("save")}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-action btn-action-danger"
                      disabled={isSelf || busyId === u.id}
                      onClick={() => handleDeleteUser(u, false)}
                    >
                      {t("deleteUser")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h2>{t("addUser")}</h2>
      <form onSubmit={handleSubmit} className="form" noValidate>
        <input
          placeholder={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t("confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <select
          className="form-select"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="GENERAL">{t("roleGeneral")}</option>
          <option value="ADMIN">{t("roleAdmin")}</option>
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? t("saving") : t("save")}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </main>
  );
}
