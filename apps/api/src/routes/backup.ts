import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { mkdir, writeFile, readFile, rm, readdir, copyFile, link, stat } from "fs/promises";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

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

  // GET /api/backup/export
  app.get("/export", async (request, reply) => {
    const tempDirName = `backup_${Date.now()}`;
    const tempDir = path.join(UPLOAD_DIR, tempDirName);
    const filesDir = path.join(tempDir, "files");
    const archivePath = path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);

    const cleanup = () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    };

    // 빌드는 첨부가 많으면 분 단위인데, 정리 핸들러는 빌드가 끝나야 걸린다. 그동안
    // 탭을 닫으면 이미 지나간 close 이벤트는 다시 오지 않아 사본과 아카이브가 그대로
    // 남는다 — 누를 때마다 쌓인다. 요청이 끊긴 것을 빌드 전부터 지켜본다.
    let clientGone = false;
    request.raw.on("close", () => {
      clientGone = true;
    });

    try {
      // 1. Gather all database records
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

      // 2. Create temp backup directory structure
      await mkdir(filesDir, { recursive: true });

      // 3. Write db.json
      // TelemetryRaw.id는 BigInt라 JSON.stringify가 기본적으로 직렬화하지 못한다 — 문자열로 변환.
      const jsonReplacer = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
      await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, jsonReplacer, 2), "utf8");

      // 4. Copy all existing uploaded files in UPLOAD_DIR into filesDir
      if (existsSync(UPLOAD_DIR)) {
        const items = await readdir(UPLOAD_DIR, { withFileTypes: true });
        for (const item of items) {
          // Skip temp directory and any other tar.gz files to avoid recursive backup
          if (item.isDirectory() && item.name === tempDirName) continue;
          if (item.isFile() && item.name.endsWith(".tar.gz")) continue;

          if (item.isFile()) {
            await linkOrCopy(path.join(UPLOAD_DIR, item.name), path.join(filesDir, item.name));
          }
        }
      }

      // 5. Compress into tar.gz
      // Using -C to change directory to tempDir and compress the contents (not the folder itself)
      await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);

      const archiveStat = await stat(archivePath);

      if (clientGone) {
        app.log.warn({ bytes: archiveStat.size }, "Backup export abandoned before delivery; discarding archive");
        cleanup();
        reply.hijack();
        reply.raw.destroy();
        return reply;
      }

      // 6. 아카이브를 스트림으로 흘려보낸다.
      //    예전에는 readFile()로 통째로 읽어 Buffer로 보냈다 — 상한이 없는 쪽이라
      //    첨부가 쌓인 인스턴스에서는 그대로 프로세스를 죽이는 길이었다.
      //    사본은 아카이브가 나온 시점에 이미 쓸모가 없으므로 여기서 바로 버린다.
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      const stream = createReadStream(archivePath);
      const dropArchive = () => {
        rm(archivePath, { force: true }).catch(() => {});
      };
      stream.on("close", dropArchive);
      stream.on("error", dropArchive);
      reply.raw.on("close", dropArchive);

      return reply
        .header("Content-Type", "application/gzip")
        // 길이를 알려야 브라우저가 진행률을 그리고, 길이 없는 chunked 응답을 통째로
        // 버퍼링하는 프록시에 걸리지 않는다.
        .header("Content-Length", String(archiveStat.size))
        .header("Content-Disposition", `attachment; filename="garage_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`)
        .send(stream);
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      cleanup();
      return reply.code(500).send({ error: `Backup export failed: ${err.message || err}` });
    }
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
