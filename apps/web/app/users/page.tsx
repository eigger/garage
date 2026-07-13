"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import type { User } from "../../lib/types";

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "GENERAL">("GENERAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && user && !isAdmin) router.replace("/");
  }, [authLoading, user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsers() {
    const res = await apiFetch("/api/auth/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (user && isAdmin) loadUsers();
  }, [user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError(t("requiredField"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        showToast(t("toastError"), "error");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
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
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <main className="container">
      <h1>{t("usersHeading")}</h1>

      <ul className="list">
        {users.map((u) => (
          <li key={u.id} className="list-item">
            {u.name} ({u.email}) — {u.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}
          </li>
        ))}
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
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="form-select"
          value={role}
          onChange={(e) => setRole(e.target.value as "ADMIN" | "GENERAL")}
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
