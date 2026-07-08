"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { SettingsBar } from "../settings-bar";

export default function ProfilePage() {
  const { user, requireAuth } = useAuth();
  const { t } = useSettings();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    requireAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const body: any = { name, email };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(t("profileUpdated"));
        setCurrentPassword("");
        setNewPassword("");
        // Reload page or auth to sync state
        window.location.reload();
      } else {
        const errData = await res.json();
        if (errData.error === "incorrect currentPassword") {
          setError(t("incorrectPassword"));
        } else {
          setError(t("passwordMismatch"));
        }
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1>{t("navProfile")}</h1>

      <form onSubmit={handleSubmit} className="form" style={{ maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t("name")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("emailPlaceholder")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={t("emailPlaceholder")}
          />
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: 15, borderBottom: "1px solid #eee", paddingBottom: 6 }}>
          {t("changePasswordHeading")}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("currentPassword")}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t("currentPassword")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: "600", color: "#444" }}>{t("newPassword")}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("newPassword")}
          />
        </div>

        {message && <p style={{ color: "green", fontSize: 14, margin: "12px 0 0" }}>✓ {message}</p>}
        {error && <p style={{ color: "red", fontSize: 14, margin: "12px 0 0" }}>✗ {error}</p>}

        <button type="submit" disabled={submitting} style={{ marginTop: 20 }}>
          {submitting ? t("saving") : t("save")}
        </button>
      </form>
    </main>
  );
}
