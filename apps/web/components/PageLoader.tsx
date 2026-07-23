"use client";

import { useSettings } from "../lib/i18n/settings-context";

type PageLoaderProps = {
  /** 스피너 아래 문구. 생략하면 기본 "불러오는 중..." 문구를 쓴다. null이면 숨긴다. */
  label?: string | null;
};

/**
 * 전체 화면 로딩 표시. 화면 중앙에 트랙 링 + accent 아크가 차분히 회전한다.
 * 화려한 모션 없이 트랙/둥근 라인캡/느린 회전으로 완성도를 낸다.
 */
export function PageLoader({ label }: PageLoaderProps) {
  const { t } = useSettings();
  const text = label === null ? null : label ?? t("loading");

  return (
    <div className="page-loader" role="status" aria-live="polite" aria-label={text ?? t("loading")}>
      <svg className="page-loader__ring" viewBox="0 0 50 50" aria-hidden="true">
        <circle className="page-loader__track" cx="25" cy="25" r="20" fill="none" strokeWidth="4" />
        <circle
          className="page-loader__arc"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="4"
          strokeDasharray="35 91"
        />
      </svg>
      {text !== null && <p className="page-loader__label">{text}</p>}
    </div>
  );
}
