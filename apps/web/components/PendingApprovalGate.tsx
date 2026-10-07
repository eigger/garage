"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/i18n/settings-context";

// 승인 대기 계정은 로그인은 돼 있지만 데이터 API가 전부 403이라, 일반 화면을 그리면
// 어디를 눌러도 빈 목록과 에러만 보게 된다. 화면 전체를 안내로 대체한다.
export function PendingApprovalGate({ children }: { children: ReactNode }) {
  const { user, isPending, loadError, loading, retry, logout } = useAuth();
  const { t } = useSettings();
  const pathname = usePathname();

  // 로그인 화면은 오류 상태와 무관하게 그대로 보여준다(토큰이 깨졌을 때의 탈출구).
  if (loadError && !user && !loading && pathname !== "/login") {
    return (
      <main className="container">
        <h1>{t("authLoadErrorTitle")}</h1>
        <p>{t("authLoadErrorBody")}</p>
        <button type="button" onClick={retry}>
          {t("retry")}
        </button>{" "}
        <button type="button" onClick={logout}>
          {t("logout")}
        </button>
      </main>
    );
  }

  if (!user || !isPending || pathname === "/login") return <>{children}</>;

  return (
    <main className="container">
      <h1>{t("pendingApprovalTitle")}</h1>
      <p>{t("pendingApprovalBody")}</p>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
        {user.name} ({user.email})
      </p>
      <button type="button" onClick={logout}>
        {t("logout")}
      </button>
    </main>
  );
}
