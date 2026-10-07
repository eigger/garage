"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

// 첨부 파일 주소에 `?token=<90일짜리 로그인 JWT>`를 붙이면 토큰이 서버 접근 로그, 브라우저 히스토리,
// 공유한 링크에 그대로 남는다. 대신 Authorization 헤더로 받아서 blob URL로 연다.
export async function fetchAttachmentBlobUrl(filePath: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/attachments/file/${encodeURIComponent(filePath)}`);
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

// 새 탭을 클릭 이벤트 안에서 먼저 열어 두어야 모바일 팝업 차단에 걸리지 않는다.
// 새 창을 못 열면(팝업 차단 등) 현재 화면을 blob 문서로 바꾸지 않고 실패로 알린다 — 작성 중이던 상태가 날아간다.
export async function openAttachment(filePath: string, cachedUrl?: string | null): Promise<boolean> {
  const win = window.open("", "_blank");
  if (!win) return false;
  const url = cachedUrl ?? (await fetchAttachmentBlobUrl(filePath));
  if (!url) {
    win.close();
    return false;
  }
  win.location.href = url;
  // 방금 만든(캐시가 아닌) URL은 새 탭이 문서를 읽을 시간을 준 뒤 해제한다.
  if (!cachedUrl) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function useAttachmentBlobUrl(
  filePath: string,
  enabled = true,
): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: string | null = null;
    fetchAttachmentBlobUrl(filePath).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      setState({ url: u, failed: u === null });
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [filePath, enabled]);
  return state;
}
