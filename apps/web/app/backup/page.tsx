"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch, getToken } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { PageLoader } from "../../components/PageLoader";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import { withBasePath } from "../../lib/base-path";

/**
 * 내보내기 진행 상황. 예전에는 버튼이 "저장 중..."으로 바뀐 채 아카이브가 다
 * 만들어질 때까지 아무 말도 못 했다. 이제 서버가 뒤에서 만들고 화면이 물어본다.
 */
type BackupJob = {
  jobId: string;
  phase: "database" | "files" | "archiving" | "ready" | "failed";
  percent: number;
  stagedBytes: number;
  archivedBytes: number;
  totalBytes: number;
  archiveBytes: number | null;
  error: string | null;
};

const JOB_POLL_MS = 1000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function BackupPage() {
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<BackupJob | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildingPhase = job && job.phase !== "ready" && job.phase !== "failed" ? job.phase : null;
  const pollingJobId = job && buildingPhase ? job.jobId : null;

  // 빌드가 도는 동안에만 물어본다. 응답마다 새 객체가 오므로 id로 건다 —
  // job 자체를 의존성에 두면 1초마다 타이머를 새로 걸게 된다.
  useEffect(() => {
    if (!pollingJobId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const res = await apiFetch(`/api/backup/export/jobs/${pollingJobId}`);
          if (!res.ok) throw new Error("gone");
          const next = (await res.json()) as BackupJob;
          if (!cancelled) setJob(next);
        } catch {
          // 작업이 사라졌다(재시작·스윕). 진행률을 영원히 붙잡고 있는 것보다
          // 화면을 처음 상태로 되돌려 다시 누르게 하는 편이 낫다.
          if (!cancelled) setJob(null);
        }
      })();
    }, JOB_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollingJobId]);

  useEffect(() => {
    if (job?.phase === "failed") {
      showToast(t("backupBuildFailed", { detail: job.error ?? "" }), "error");
      setJob(null);
    }
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !user) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <main className="container">
        <p style={{ color: "var(--color-danger)", fontWeight: "600" }}>Forbidden: Admin access only.</p>
      </main>
    );
  }

  async function handleExport() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/backup/export/jobs", { method: "POST" });
      const body = await res.json().catch(() => null);

      if (res.status === 409 && body?.jobId) {
        // 다른 탭·다른 관리자가 이미 만들고 있다. 그 진행률을 그대로 보여준다.
        showToast(t("backupAlreadyRunning"), "success");
        setJob(body as BackupJob);
        return;
      }
      if (!res.ok) {
        showToast(body?.error || t("toastError"), "error");
        return;
      }
      setJob(body as BackupJob);
    } catch (err) {
      console.error(err);
      showToast(t("toastError"), "error");
    } finally {
      setLoading(false);
    }
  }

  /**
   * 링크로 받는다. 예전에는 fetch로 받아 blob으로 만들어 저장했는데, 그러면
   * 아카이브가 브라우저 메모리에 통째로 올라온다 — 서버 쪽에서 같은 이유로 스트림으로
   * 바꾼 것과 같은 문제다. 브라우저 링크는 Authorization 헤더를 못 붙이므로
   * 첨부·리포트 링크가 이미 쓰는 `?token=` 폴백을 그대로 쓴다.
   */
  function downloadUrl(current: BackupJob): string {
    const token = getToken();
    return `${API_URL}/api/backup/export?jobId=${encodeURIComponent(current.jobId)}${
      token ? `&token=${encodeURIComponent(token)}` : ""
    }`;
  }

  async function handleDiscard() {
    if (!job) return;
    const { jobId } = job;
    setJob(null);
    await apiFetch(`/api/backup/export/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
  }

  function phaseLabel(current: BackupJob): string {
    if (current.phase === "database") return t("backupPhaseDatabase");
    // 담는 단계는 하드링크라 순식간이다 — 시간은 압축에서 간다
    if (current.phase === "archiving") {
      return t("backupPhaseArchiving", {
        done: formatBytes(Math.min(current.archivedBytes, current.totalBytes)),
        total: formatBytes(current.totalBytes),
      });
    }
    return t("backupPhaseFiles");
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
          window.location.href = withBasePath("/login");
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
      <h1>{t("backupHeading")}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
        {/* Export Card */}
        <section className="card">
          <h2>{t("backupExportButton").split(" (")[0]}</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "8px 0 16px" }}>
            내보내기를 실행하면 차량 데이터베이스 테이블 내용과 업로드된 모든 이미지/PDF 영수증 파일이 하나의 압축 파일로 다운로드됩니다.
          </p>
          {!job && (
            <button type="button" onClick={handleExport} disabled={loading}>
              {loading ? t("saving") : t("backupExportButton")}
            </button>
          )}

          {job && buildingPhase && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{t("backupBuildingTitle")}</p>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "var(--color-border)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${job.percent}%`,
                    borderRadius: 999,
                    background: "var(--color-primary)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
                {phaseLabel(job)} · {job.percent}%
              </p>
              <button type="button" onClick={handleDiscard} style={{ alignSelf: "flex-start" }}>
                {t("cancel")}
              </button>
            </div>
          )}

          {job?.phase === "ready" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{t("backupReadyTitle")}</p>
              <a
                href={downloadUrl(job)}
                // 성공하면 Content-Disposition 때문에 이동 없이 받아진다. 실패하면
                // JSON이 그대로 나가는데, target이 없으면 **이 화면이** 그 JSON으로
                // 이동해 버린다.
                target="_blank"
                rel="noopener"
                onClick={() => setJob(null)}
                style={{ alignSelf: "flex-start", fontWeight: 600, textDecoration: "underline" }}
              >
                {t("backupDownloadLink", { size: formatBytes(job.archiveBytes ?? 0) })}
              </a>
              <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
                {t("backupDownloadHint")}
              </p>
              <button type="button" onClick={handleDiscard} style={{ alignSelf: "flex-start" }}>
                {t("backupDiscardLabel")}
              </button>
            </div>
          )}
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
