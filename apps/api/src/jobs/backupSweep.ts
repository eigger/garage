import path from "node:path";
import { sweepExpiredBackupJobs } from "../lib/backupJobs.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 받아 가지 않은 백업 아카이브를 걷는다.
 *
 * 예전에는 내보내기가 응답 안에서 끝나 `finally`가 늘 지웠다. 이제는 다운로드를
 * 기다리느라 응답 밖에서 살아남으므로, 아무도 받지 않은 tar.gz를 치울 주체가 필요하다.
 */
export function startBackupJobSweep(): void {
  setInterval(() => {
    sweepExpiredBackupJobs(UPLOAD_DIR).catch((err) => console.error("[backup-sweep] failed", err));
  }, SWEEP_INTERVAL_MS).unref();
}
