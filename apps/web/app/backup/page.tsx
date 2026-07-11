"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import { SettingsBar } from "../settings-bar";

export default function BackupPage() {
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !user) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <main className="container">
        <SettingsBar />
        <p style={{ color: "var(--color-danger)", fontWeight: "600" }}>Forbidden: Admin access only.</p>
        <p>
          <Link href="/">{t("backToDashboard")}</Link>
        </p>
      </main>
    );
  }

  async function handleExport() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/backup/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `garage_backup_${new Date().toISOString().slice(0, 10)}.tar.gz`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast(t("toastSaved"), "success");
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || t("toastError"), "error");
      }
    } catch (err) {
      console.error(err);
      showToast(t("toastError"), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!(await confirm(t("backupWarning"), { confirmLabel: t("backupRestoreButton") }))) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch("/api/backup/restore", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        showToast(t("backupSuccess"), "success");
        // Clear tokens and redirect to login as database is fully restored.
        // A short delay lets the success toast be visible before the full page reload wipes it.
        localStorage.clear();
        setTimeout(() => {
          window.location.href = "/login";
        }, 1200);
      } else {
        const err = await res.json();
        showToast(err.error || t("toastError"), "error");
      }
    } catch (err) {
      console.error(err);
      showToast(t("toastError"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1>{t("backupHeading")}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
        {/* Export Card */}
        <section className="card">
          <h2>{t("backupExportButton").split(" (")[0]}</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "8px 0 16px" }}>
            내보내기를 실행하면 차량 데이터베이스 테이블 내용과 업로드된 모든 이미지/PDF 영수증 파일이 하나의 압축 파일로 다운로드됩니다.
          </p>
          <button type="button" onClick={handleExport} disabled={loading}>
            {loading ? t("saving") : t("backupExportButton")}
          </button>
        </section>

        {/* Restore Card */}
        <section className="card" style={{ border: "1px solid var(--color-danger)" }}>
          <h2 style={{ color: "var(--color-danger)" }}>{t("backupRestoreButton")}</h2>
          <p style={{ fontSize: 14, color: "var(--color-danger)", fontWeight: "600", margin: "8px 0 16px" }}>
            {t("backupWarning")}
          </p>
          <form onSubmit={handleRestore} className="form">
            <input
              type="file"
              accept=".tar.gz,application/gzip,application/x-gzip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              style={{ minHeight: "auto", padding: "8px" }}
            />
            <button
              type="submit"
              disabled={loading || !file}
              style={{
                marginTop: 16,
                backgroundColor: loading || !file ? "var(--color-disabled)" : "var(--color-danger)",
                borderColor: loading || !file ? "var(--color-disabled)" : "var(--color-danger)",
                color: "#fff",
              }}
            >
              {loading ? t("saving") : t("backupRestoreButton")}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
