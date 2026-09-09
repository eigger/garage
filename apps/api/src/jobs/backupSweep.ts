import path from "node:path";
import { sweepExpiredBackupJobs, sweepStaleBackupArtifacts } from "../lib/backupJobs.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 받아 가지 않은 백업 아카이브를 걷는다.
 *
 * 예전에는 내보내기가 응답 안에서 끝나 `finally`가 늘 지웠다. 이제는 다운로드를
 * 기다리느라 응답 밖에서 살아남으므로, 아무도 받지 않은 tar.gz를 치울 주체가 필요하다.
 */
async function sweep(): Promise<void> {
  await sweepExpiredBackupJobs(UPLOAD_DIR);
  // 작업 목록은 메모리에만 있다 — 재시작하면 디스크의 아카이브를 아무도 모른다.
  // 이름으로 나이를 재서 걷는다. 그래서 기동 시에도 한 번 돈다.
  const swept = await sweepStaleBackupArtifacts(UPLOAD_DIR);
  if (swept.length > 0) console.warn(`[backup-sweep] removed ${swept.length} stale artifact(s)`);
}

export function startBackupJobSweep(): void {
  sweep().catch((err) => console.error("[backup-sweep] initial run failed", err));
  setInterval(() => {
    sweep().catch((err) => console.error("[backup-sweep] failed", err));
  }, SWEEP_INTERVAL_MS).unref();
}
