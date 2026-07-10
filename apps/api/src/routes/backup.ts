import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile, rm, readdir, copyFile } from "fs/promises";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

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
            await copyFile(path.join(UPLOAD_DIR, item.name), path.join(filesDir, item.name));
          }
        }
      }

      // 5. Compress into tar.gz
      // Using -C to change directory to tempDir and compress the contents (not the folder itself)
      await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);

      const fileBuffer = await readFile(archivePath);

      // 6. Return streamed file
      reply
        .header("Content-Type", "application/gzip")
        .header("Content-Disposition", `attachment; filename="garage_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`)
        .send(fileBuffer);
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      return reply.code(500).send({ error: `Backup export failed: ${err.message || err}` });
    } finally {
      // Clean up temp folders and files asynchronously
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      rm(archivePath, { force: true }).catch(() => {});
    }
  });

  // POST /api/backup/restore
  app.post("/restore", async (request, reply) => {
    // 전역 업로드 제한(20MB)은 영수증 한 장 기준이라 사진이 많이 포함된 백업 압축파일에는
    // 턱없이 부족하다 — 이 라우트에서만 훨씬 큰 제한을 적용한다.
    const file = await request.file({ limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
    if (!file) {
      return reply.code(400).send({ error: "No backup file uploaded" });
    }

    const restoreTempDirName = `restore_${Date.now()}`;
    const restoreTempDir = path.join(UPLOAD_DIR, restoreTempDirName);
    const archivePath = path.join(UPLOAD_DIR, `${restoreTempDirName}.tar.gz`);

    try {
      // 1. Save uploaded file to temp archive
      await mkdir(restoreTempDir, { recursive: true });
      const buffer = await file.toBuffer();
      await writeFile(archivePath, buffer);

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

      // 4. Run DB transaction to restore data
      // We clear tables in reverse dependency order, and insert in correct order
      await prisma.$transaction(async (tx) => {
        // Clear all existing data
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
      const filesDir = path.join(restoreTempDir, "files");
      if (existsSync(filesDir)) {
        const restoredFiles = await readdir(filesDir);
        for (const filename of restoredFiles) {
          await copyFile(path.join(filesDir, filename), path.join(UPLOAD_DIR, filename));
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
