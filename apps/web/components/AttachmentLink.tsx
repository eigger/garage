"use client";

import type { CSSProperties, ReactNode } from "react";
import { openAttachment, useAttachmentBlobUrl } from "../lib/attachmentFile";
import { useToast } from "../lib/toast-context";
import { useSettings } from "../lib/i18n/settings-context";
import { FileTextIcon } from "./icons";

// 첨부 파일을 새 탭으로 여는 링크. 로그인 토큰을 URL에 싣지 않고 헤더로 받아 연다(lib/attachmentFile.ts).
// imageStyle을 주면 이미지 첨부는 미리보기 썸네일로 그린다(같은 blob을 클릭 시 재사용).
export function AttachmentLink({
  filePath,
  mimeType,
  style,
  imageStyle,
  children,
}: {
  filePath: string;
  mimeType: string;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
  children?: ReactNode;
}) {
  const { showToast } = useToast();
  const { t } = useSettings();
  const showImage = imageStyle !== undefined && mimeType.startsWith("image/");
  const { url: blobUrl, failed } = useAttachmentBlobUrl(filePath, showImage);

  return (
    // 토큰이 필요한 파일이라 일반 링크로 열 수 없다 — 가운데 클릭·새 탭 열기가 앱 페이지를 열지 않도록
    // 링크가 아니라 버튼으로 노출한다.
    <a
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer", ...style }}
      onKeyDown={async (e) => {
        if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
        e.preventDefault();
        if (!(await openAttachment(filePath, blobUrl))) showToast(t("attachmentOpenFailed"), "error");
      }}
      onClick={async (e) => {
        e.preventDefault();
        if (!(await openAttachment(filePath, blobUrl))) showToast(t("attachmentOpenFailed"), "error");
      }}
    >
      {showImage && !failed ? (
        blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blobUrl} alt="Attachment" style={imageStyle} />
        ) : (
          <span style={{ ...imageStyle, display: "inline-block" }} aria-busy="true" />
        )
      ) : (
        (children ?? <FileTextIcon />)
      )}
    </a>
  );
}
