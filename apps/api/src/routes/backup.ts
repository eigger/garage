import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { mkdir, writeFile, readFile, rm, readdir, copyFile, link, stat } from "fs/promises";

import {
  activeBackupJob,
  backupJobPercent,
  BackupJobCancelledError,
  createBackupJob,
  deleteBackupJob,
  getBackupJob,
  measureUploads,
  requestBackupJobCancel,
  updateBackupJob,
  type BackupJob,
} from "../lib/backupJobs.js";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** 아카이브가 자라는 속도를 재는 주기 */
const ARCHIVE_POLL_MS = 500;

/** 복원으로 받을 아카이브 상한. 전역 20MB는 영수증 한 장 기준이라 백업에는 턱없이 부족하다 */
const RESTORE_LIMIT_BYTES = 500 * 1024 * 1024;

/**
 * 백업 작업 디렉터리는 UPLOAD_DIR 안이라 늘 같은 파일시스템이다 — 바이트를 복사할
 * 이유가 없다. 하드링크는 크기와 무관하게 즉시고 자리를 차지하지 않는다. 복사하면
 * 백업 한 번이 원본만큼의 디스크를 더 먹는다.
 *
 * 링크가 안 되는 환경(파일시스템이 지원하지 않거나 경계를 넘는 경우)에서는 조용히
 * 복사로 되돌아간다 — 백업이 되는 것이 먼저다.
 */
export async function linkOrCopy(source: string, dest: string): Promise<void> {
  try {
    await link(source, dest);
  } catch {
    await copyFile(source, dest);
  }
}

export async function backupRoutes(app: FastifyInstance) {
  // Authenticate all routes in this file
  app.addHook("preHandler", app.authenticate);

  // Require admin role for all backup operations
  app.addHook("preHandler", async (request, reply) => {
    if (request.user.role !== "ADMIN") {
      return reply.code(403).send({ error: "forbidden: admin role required" });
    }
  });

  /**
   * 아카이브를 만든다. 요청 밖에서 돈다 — 응답을 붙잡고 만들던 시절에는 화면이
   * 버튼만 "저장 중..."으로 바꾼 채 몇 분씩 아무 말도 못 했다.
   */
  async function runBackupJob(job: BackupJob): Promise<void> {
    const tempDir = path.join(UPLOAD_DIR, job.tempDirName);
    const filesDir = path.join(tempDir, "files");
    const archivePath = path.join(UPLOAD_DIR, `${job.tempDirName}.tar.gz`);

    const abortIfCancelled = () => {
      if (getBackupJob(job.id)?.cancelRequested) throw new BackupJobCancelledError();
    };

    try {
      updateBackupJob(job.id, { phase: "database" });
      const [
        users,
        vehicles,
        access,
        trips,
        fuelLogs,
        maintenanceRecords,
        consumableParts,
        reminders,
        telemetry,
        attachments,
        presets,
        pushSubscriptions,
      ] = await Promise.all([
        prisma.user.findMany(),
        prisma.vehicle.findMany(),
        prisma.userVehicleAccess.findMany(),
        prisma.trip.findMany(),
        prisma.fuelLog.findMany(),
        prisma.maintenanceRecord.findMany(),
        prisma.consumablePart.findMany(),
        prisma.reminder.findMany(),
        prisma.telemetryRaw.findMany(),
        prisma.attachment.findMany(),
        prisma.maintenancePresetTemplate.findMany(),
        prisma.pushSubscription.findMany(),
      ]);

      const dbData = {
        users,
        vehicles,
        access,
        trips,
        fuelLogs,
        maintenanceRecords,
        consumableParts,
        reminders,
        telemetry,
        attachments,
        presets,
        pushSubscriptions,
      };

      await mkdir(filesDir, { recursive: true });
      // TelemetryRaw.id는 BigInt라 JSON.stringify가 기본적으로 직렬화하지 못한다 — 문자열로 변환.
      const jsonReplacer = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
      await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, jsonReplacer, 2), "utf8");

      abortIfCancelled();
      updateBackupJob(job.id, { phase: "files" });
      if (existsSync(UPLOAD_DIR)) {
        const items = await readdir(UPLOAD_DIR, { withFileTypes: true });
        for (const item of items) {
          // 작업 디렉터리와 이전 아카이브를 백업에 다시 담지 않는다
          if (!item.isFile() || item.name.endsWith(".tar.gz")) continue;

          const source = path.join(UPLOAD_DIR, item.name);
          const size = await stat(source).then((info) => info.size).catch(() => 0);
          await linkOrCopy(source, path.join(filesDir, item.name));
          const current = getBackupJob(job.id);
          if (current) current.stagedBytes += size;
          abortIfCancelled();
        }
      }

      abortIfCancelled();
      updateBackupJob(job.id, { phase: "archiving" });
      await archiveWithProgress(job, tempDir, archivePath);

      // 사본은 아카이브가 나온 시점에 쓸모가 없다
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      const archiveStat = await stat(archivePath);
      updateBackupJob(job.id, { phase: "ready", archiveBytes: archiveStat.size });
      app.log.info({ jobId: job.id, bytes: archiveStat.size }, "Backup archive built");
    } catch (err: any) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await rm(archivePath, { force: true }).catch(() => {});

      if (err instanceof BackupJobCancelledError || getBackupJob(job.id)?.cancelRequested) {
        // 취소는 실패가 아니다. 여기서 목록에서 뺀다 — 그전에 빼면 빌드가 도는 채로
        // 잠금이 풀려 두 번째 빌드가 시작된다.
        app.log.info({ jobId: job.id }, "Backup export cancelled");
        deleteBackupJob(job.id);
        return;
      }

      app.log.error(err, "Backup export failed");
      updateBackupJob(job.id, {
        phase: "failed",
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  /**
   * tar를 돌리면서 아카이브 파일이 자라는 것을 진행률로 삼는다. 담는 단계가
   * 하드링크라 순식간에 끝나므로, 여기에 진행률이 없으면 막대가 10%에서 멈춰 있다.
   * verbose 출력을 파싱하지 않는 이유는 GNU tar와 busybox tar의 형식이 다르고,
   * 알고 싶은 것이 파일 수가 아니라 바이트이기 때문이다.
   */
  async function archiveWithProgress(job: BackupJob, tempDir: string, archivePath: string): Promise<void> {
    const running = execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);

    const poll = setInterval(() => {
      void (async () => {
        // 압축 중에는 확인 지점이 여기뿐이다. 반쯤 쓴 아카이브는 취소 경로가 지운다.
        if (getBackupJob(job.id)?.cancelRequested) {
          running.child?.kill();
          return;
        }
        try {
          updateBackupJob(job.id, { archivedBytes: (await stat(archivePath)).size });
        } catch {
          /* 아직 안 만들어졌다 */
        }
      })();
    }, ARCHIVE_POLL_MS);

    try {
      await running;
    } finally {
      clearInterval(poll);
    }
    if (getBackupJob(job.id)?.cancelRequested) throw new BackupJobCancelledError();
  }

  function backupJobView(job: BackupJob) {
    return {
      jobId: job.id,
      phase: job.phase,
      percent: backupJobPercent(job),
      stagedBytes: job.stagedBytes,
      archivedBytes: job.archivedBytes,
      totalBytes: job.totalBytes,
      archiveBytes: job.archiveBytes,
      error: job.error,
    };
  }

  // POST /api/backup/export/jobs — 빌드를 시작하고 즉시 돌아온다
  app.post("/export/jobs", async (request, reply) => {
    const running = activeBackupJob();
    if (running) {
      // 빌드 하나가 tar 한 벌을 만든다. 둘이 겹치면 디스크가 두 배다.
      return reply.code(409).send({ ...backupJobView(running), error: "backup_already_running" });
    }

    const job = createBackupJob(request.user.sub, await measureUploads(UPLOAD_DIR));
    // 일부러 await하지 않는다 — 요청은 지금 돌려주고 빌드는 뒤에서 돈다.
    void runBackupJob(job);
    return backupJobView(job);
  });

  // GET /api/backup/export/jobs/:jobId — 진행률
  app.get("/export/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getBackupJob(jobId);
    if (!job || job.userId !== request.user.sub) {
      return reply.code(404).send({ error: "backup_job_not_found" });
    }
    return backupJobView(job);
  });

  // DELETE /api/backup/export/jobs/:jobId — 취소하거나 다 만든 아카이브를 버린다
  app.delete("/export/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getBackupJob(jobId);
    if (!job || job.userId !== request.user.sub) {
      return reply.code(404).send({ error: "backup_job_not_found" });
    }

    // 빌드 중이면 파일을 여기서 지우지 않는다 — 쓰고 있는 것을 지우면 tar가 깨진다.
    if (requestBackupJobCancel(job.id)) return { ok: true, cancelling: true };

    await rm(path.join(UPLOAD_DIR, `${job.tempDirName}.tar.gz`), { force: true }).catch(() => {});
    deleteBackupJob(job.id);
    return { ok: true, cancelling: false };
  });

  /**
   * GET /api/backup/export?jobId=... — **만들지 않는다.** 미리 만들어 둔 것을 흘려보낸다.
   *
   * 인증은 이 파일 위쪽의 훅이 그대로 건다. 브라우저 링크는 Authorization 헤더를
   * 붙일 수 없으므로 기존 `?token=` 폴백(app.ts의 resolveUser)을 탄다 — 첨부 파일·
   * 리포트 내보내기 링크가 이미 쓰는 경로와 같다.
   */
  app.get("/export", async (request, reply) => {
    const { jobId } = request.query as { jobId?: string };
    const job = jobId ? getBackupJob(jobId) : null;
    if (!job || job.userId !== request.user.sub) {
      return reply.code(404).send({ error: "backup_job_not_found" });
    }
    if (job.phase !== "ready") {
      return reply.code(409).send({ error: "backup_not_ready", phase: job.phase });
    }

    const archivePath = path.join(UPLOAD_DIR, `${job.tempDirName}.tar.gz`);
    let archiveStat;
    try {
      archiveStat = await stat(archivePath);
    } catch {
      // 스윕이 이미 걷어 갔다 — 작업만 남아 "받을 수 있다"고 거짓말하지 않게 지운다
      deleteBackupJob(job.id);
      return reply.code(409).send({ error: "backup_not_ready", phase: "gone" });
    }

    const stream = createReadStream(archivePath);
    const dropArchive = () => {
      rm(archivePath, { force: true }).catch(() => {});
      deleteBackupJob(job.id);
    };
    stream.on("close", dropArchive);
    stream.on("error", dropArchive);
    reply.raw.on("close", dropArchive);

    return reply
      .header("Content-Type", "application/gzip")
      // 길이를 알려야 브라우저가 진행률을 그리고, 길이 없는 chunked 응답을 통째로
      // 버퍼링하는 프록시에 걸린다.
      .header("Content-Length", String(archiveStat.size))
      .header("Content-Disposition", `attachment; filename="garage_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`)
      .send(stream);
  });

  // POST /api/backup/restore
  app.post("/restore", async (request, reply) => {
    // 전역 업로드 제한(20MB)은 영수증 한 장 기준이라 사진이 많이 포함된 백업 압축파일에는
    // 턱없이 부족하다 — 이 라우트에서만 훨씬 큰 제한을 적용한다.
    const file = await request.file({ limits: { fileSize: RESTORE_LIMIT_BYTES } });
    if (!file) {
      return reply.code(400).send({ error: "No backup file uploaded" });
    }

    const restoreTempDirName = `restore_${Date.now()}`;
    const restoreTempDir = path.join(UPLOAD_DIR, restoreTempDirName);
    const archivePath = path.join(UPLOAD_DIR, `${restoreTempDirName}.tar.gz`);

    try {
      // 1. Save uploaded file to temp archive
      //    toBuffer()는 아카이브 전체를 메모리에 올린다 — 상한이 500MB라 큰 백업을
      //    복원하면 그대로 프로세스가 죽는다. 디스크로 흘려보낸다.
      await mkdir(restoreTempDir, { recursive: true });
      await pipeline(file.file, createWriteStream(archivePath));
      if (file.file.truncated) {
        const limit = `${Math.floor(RESTORE_LIMIT_BYTES / 1024 / 1024)}MB`;
        return reply.code(413).send({ error: `Backup file is too large (limit ${limit})` });
      }

      // 2. Extract archive
      await execAsync(`tar -xzf "${archivePath}" -C "${restoreTempDir}"`);

      // 3. Read and parse db.json
      const dbJsonPath = path.join(restoreTempDir, "db.json");
      if (!existsSync(dbJsonPath)) {
        return reply.code(400).send({ error: "Invalid backup: db.json not found" });
      }

      const dbData = JSON.parse(await readFile(dbJsonPath, "utf8"));

      // 내보내기에서 TelemetryRaw.id(BigInt)를 문자열로 직렬화했으므로, 복원 시 다시 BigInt로 되돌린다.
      if (Array.isArray(dbData.telemetry)) {
        dbData.telemetry = dbData.telemetry.map((t: Record<string, unknown>) => ({
          ...t,
          id: BigInt(t.id as string | number),
        }));
      }

      // 이메일 소문자 정규화 이전에 만들어진 백업에는 대소문자가 섞인 주소가 들어있을 수 있다.
      // 로그인은 입력을 소문자로 맞춰 조회하므로, 그대로 복원하면 그 계정은 비밀번호가 맞아도
      // 영영 로그인되지 않는다 — 마이그레이션과 똑같이 여기서도 정규화한다.
      if (Array.isArray(dbData.users)) {
        dbData.users = dbData.users.map((u: Record<string, unknown>) => ({
          ...u,
          email: typeof u.email === "string" ? u.email.trim().toLowerCase() : u.email,
        }));

        // 정규화하면 서로 충돌하는 계정이 있으면 unique 위반으로 복원 전체가 실패한다.
        // 어떤 주소가 문제인지 알려주지 않으면 원인을 찾을 방법이 없다.
        const seen = new Map<string, number>();
        for (const u of dbData.users as Array<{ email?: string }>) {
          if (typeof u.email !== "string") continue;
          seen.set(u.email, (seen.get(u.email) ?? 0) + 1);
        }
        const conflicts = [...seen.entries()].filter(([, n]) => n > 1).map(([email]) => email);
        if (conflicts.length > 0) {
          return reply.code(400).send({
            error: `Backup contains accounts whose emails differ only by case: ${conflicts.join(", ")}. Remove or rename the duplicates in the backup before restoring.`,
          });
        }
      }

      // 4. Run DB transaction to restore data
      // We clear tables in reverse dependency order, and insert in correct order
      await prisma.$transaction(async (tx) => {
        // Clear all existing data
        await tx.pushSubscription.deleteMany();
        await tx.telemetryRaw.deleteMany();
        await tx.reminder.deleteMany();
        await tx.consumablePart.deleteMany();
        await tx.maintenanceRecord.deleteMany();
        await tx.fuelLog.deleteMany();
        await tx.trip.deleteMany();
        await tx.userVehicleAccess.deleteMany();
        await tx.attachment.deleteMany();
        await tx.vehicle.deleteMany();
        await tx.maintenancePresetTemplate.deleteMany();
        await tx.user.deleteMany();

        // Restore tables
        if (dbData.users?.length) {
          await tx.user.createMany({ data: dbData.users });
        }
        if (dbData.presets?.length) {
          await tx.maintenancePresetTemplate.createMany({ data: dbData.presets });
        }
        if (dbData.pushSubscriptions?.length) {
          await tx.pushSubscription.createMany({ data: dbData.pushSubscriptions });
        }
        if (dbData.vehicles?.length) {
          await tx.vehicle.createMany({ data: dbData.vehicles });
        }
        if (dbData.access?.length) {
          await tx.userVehicleAccess.createMany({ data: dbData.access });
        }
        if (dbData.trips?.length) {
          await tx.trip.createMany({ data: dbData.trips });
        }
        if (dbData.fuelLogs?.length) {
          await tx.fuelLog.createMany({ data: dbData.fuelLogs });
        }
        if (dbData.maintenanceRecords?.length) {
          await tx.maintenanceRecord.createMany({ data: dbData.maintenanceRecords });
        }
        // fuelLogId/maintenanceRecordId를 참조하므로 반드시 그 테이블들 이후에 삽입해야 한다
        // (원래 vehicles 직후에 있어서 외래키 제약 위반으로 복원이 실패하던 버그).
        if (dbData.attachments?.length) {
          await tx.attachment.createMany({ data: dbData.attachments });
        }
        if (dbData.consumableParts?.length) {
          await tx.consumablePart.createMany({ data: dbData.consumableParts });
        }
        if (dbData.reminders?.length) {
          await tx.reminder.createMany({ data: dbData.reminders });
        }
        if (dbData.telemetry?.length) {
          await tx.telemetryRaw.createMany({ data: dbData.telemetry });
        }
      });

      // 5. Restore files to UPLOAD_DIR
      //    여기도 같은 파일시스템이라 링크로 잇는다. 링크는 자리가 비어 있어야 걸리므로
      //    덮어쓸 자리는 먼저 지운다 — 기존 파일에 덧쓰지 않고 새로 만드는 편이,
      //    그 파일을 가리키는 다른 이름이 있을 때도 안전하다.
      const filesDir = path.join(restoreTempDir, "files");
      if (existsSync(filesDir)) {
        const restoredFiles = await readdir(filesDir);
        for (const filename of restoredFiles) {
          const dest = path.join(UPLOAD_DIR, filename);
          await rm(dest, { force: true }).catch(() => {});
          await linkOrCopy(path.join(filesDir, filename), dest);
        }
      }

      return { success: true };
    } catch (err: any) {
      app.log.error(err, "Backup restore failed");
      return reply.code(500).send({ error: `Restore failed: ${err.message || err}` });
    } finally {
      // Clean up temp directories
      rm(restoreTempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    }
  });
}
