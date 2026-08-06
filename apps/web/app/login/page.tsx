"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { PageLoader } from "../../components/PageLoader";

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
  const [bootstrapUnreachable, setBootstrapUnreachable] = useState(false);

  // API가 죽어 있을 때 이 조회를 '사용자가 있다'로 뭉개면, 설치가 실패한 상태가
  // 평범한 로그인 화면으로 위장돼 원인을 찾기 어렵다. 실패는 실패로 드러낸다.
  const checkBootstrap = useCallback(() => {
    setCheckingBootstrap(true);
    setBootstrapUnreachable(false);
    fetch(`${API_URL}/api/auth/bootstrap/status`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`bootstrap status ${res.status}`);
        const data: { needsBootstrap: boolean } = await res.json();
        setNeedsBootstrap(data.needsBootstrap);
      })
      .catch(() => setBootstrapUnreachable(true))
      .finally(() => setCheckingBootstrap(false));
  }, []);

  useEffect(() => {
    checkBootstrap();
  }, [checkBootstrap]);

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
      setError(t("passwordConfirmMismatch"));
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
        <PageLoader />
      </main>
    );
  }

  // 서버에 닿지 못하면 로그인 폼을 띄우지 않는다 — 아직 설치가 끝나지 않았거나 API가
  // 죽은 상태이고, 여기서 로그인 시도를 시켜봐야 실패만 반복된다.
  if (bootstrapUnreachable) {
    return (
      <main className="container">
        <h1>{t("appTitle")}</h1>
        <p style={{ color: "var(--color-danger)" }}>{t("connectionError")}</p>
        <button type="button" onClick={checkBootstrap}>
          {t("retry")}
        </button>
      </main>
    );
  }

  return (
    <main className="container">
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
