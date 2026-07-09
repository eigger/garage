"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { SettingsBar } from "../settings-bar";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/bootstrap/status`)
      .then((res) => (res.ok ? res.json() : { needsBootstrap: false }))
      .then((data: { needsBootstrap: boolean }) => setNeedsBootstrap(data.needsBootstrap))
      .catch(() => setNeedsBootstrap(false))
      .finally(() => setCheckingBootstrap(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t("loginError"));
        return;
      }
      const data = await res.json();
      await login(data.token);
      router.push("/");
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/bootstrap/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 409) {
          setNeedsBootstrap(false);
          setError(t("loginError"));
          return;
        }
        setError(data?.error ? t("toastError") : t("connectionError"));
        return;
      }

      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        setError(t("loginError"));
        return;
      }
      const data = await loginRes.json();
      await login(data.token);
      router.push("/");
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  if (checkingBootstrap) {
    return (
      <main className="container">
        <SettingsBar />
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <SettingsBar />
      <h1>{t("appTitle")}</h1>
      {needsBootstrap ? (
        <>
          <p>{t("bootstrapAdminIntro")}</p>
          <form onSubmit={handleBootstrapSubmit} className="form">
            <input
              type="text"
              autoComplete="name"
              placeholder={t("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t("saving") : t("createFirstAdmin")}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </>
      ) : (
        <>
          <p>{t("loginIntro")}</p>
          <form onSubmit={handleSubmit} className="form">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t("loggingIn") : t("loginButton")}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </>
      )}
    </main>
  );
}
