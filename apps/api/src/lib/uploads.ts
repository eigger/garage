import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// 기록·차량을 지우면 Attachment 행은 cascade로 사라지지만 디스크의 파일은 그대로 남아,
// 고아 파일이 쌓이고 백업에도 계속 실려 간다. 지우기 전에 경로를 모아 두었다가
// DB 삭제가 성공한 뒤에 파일을 정리한다(DB가 실패하면 파일은 건드리지 않는다).
export async function collectAttachmentFiles(where: Prisma.AttachmentWhereInput): Promise<string[]> {
  const rows = await prisma.attachment.findMany({ where, select: { filePath: true } });
  return rows.map((r) => r.filePath);
}

export async function removeStoredFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map((p) =>
      // 저장된 값에서 파일명만 쓴다 — 경로 조작으로 업로드 폴더 밖을 지우지 못하게 한다.
      unlink(path.join(UPLOAD_DIR, path.basename(p))).catch(() => {
        // 이미 없는 파일은 무시한다. 정리 실패가 삭제 응답을 실패로 만들 이유는 없다.
      }),
    ),
  );
}
