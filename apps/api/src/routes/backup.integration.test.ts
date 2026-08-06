import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const execFileAsync = promisify(execFile);

// POST /api/backup/restore wipes every table in whatever DATABASE_URL points to before
// reinserting the backup's contents. Run against a real dev database by mistake and this
// deletes it. vitest.integration.config.ts is the only thing that loads this file, and CI
// only points that config at a disposable per-job Postgres container — but a stray local
// `vitest run` with the wrong env could still reach a real DB, so refuse unless the URL
// unambiguously names a throwaway test database.
function assertSafeToWipeDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to run backup restore tests: DATABASE_URL does not look like a disposable test database (${url}). ` +
        "This suite deletes all rows in every backed-up table.",
    );
  }
}

async function buildArchive(dbData: Record<string, unknown>): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "garage-backup-test-"));
  try {
    await writeFile(path.join(dir, "db.json"), JSON.stringify(dbData), "utf8");
    const archivePath = path.join(dir, "archive.tar.gz");
    await execFileAsync("tar", ["-czf", archivePath, "-C", dir, "db.json"]);
    return await readFile(archivePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function multipartRestoreRequest(archive: Buffer) {
  const boundary = `----garageBackupTest${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\n`),
    Buffer.from(`Content-Type: application/gzip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postRestore(app: FastifyInstance, token: string, archive: Buffer) {
  const { body, contentType } = multipartRestoreRequest(archive);
  return app.inject({
    method: "POST",
    url: "/api/backup/restore",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
}

describe("backup export/restore round trip", () => {
  let app: FastifyInstance;
  const password = "test-password-123";
  const suffix = randomUUID();
  let adminId: string;
  let adminToken: string;
  let vehicleId: string;
  let fuelLogId: string;
  let maintenanceRecordId: string;

  beforeAll(async () => {
    assertSafeToWipeDatabase();
    app = await buildApp();

    const passwordHash = await bcrypt.hash(password, 10);

    // 일부러 대소문자를 섞은 이메일 — 복원 시 소문자 정규화 로직도 함께 검증한다.
    const admin = await prisma.user.create({
      data: { name: "Backup Admin", email: `Backup-${suffix}@Example.com`, passwordHash, role: "ADMIN" },
    });
    adminId = admin.id;
    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN" });

    const vehicle = await prisma.vehicle.create({
      data: { name: `Backup Test Vehicle ${suffix}`, apiToken: randomUUID(), odometer: 12_345, createdByUserId: adminId },
    });
    vehicleId = vehicle.id;

    await prisma.userVehicleAccess.create({ data: { userId: adminId, vehicleId, canViewLocation: true } });

    const fuelLog = await prisma.fuelLog.create({
      data: {
        vehicleId,
        userId: adminId,
        date: new Date("2026-01-01T00:00:00.000Z"),
        odometer: 12_000,
        liters: 40,
        cost: 66_000,
        fullTank: true,
        location: "Backup Test Station",
      },
    });
    fuelLogId = fuelLog.id;

    const maintenanceRecord = await prisma.maintenanceRecord.create({
      data: { vehicleId, date: new Date("2026-01-02T00:00:00.000Z"), odometer: 12_100, type: "engineOil", cost: 50_000 },
    });
    maintenanceRecordId = maintenanceRecord.id;

    // 이전에 실제로 있었던 버그: attachments는 fuelLogs/maintenanceRecords *다음*에
    // 삽입돼야 한다(그 테이블들의 id를 참조하므로). 두 종류 다 만들어 그 순서를 검증한다.
    await prisma.attachment.create({ data: { filePath: "backup-test/receipt.jpg", mimeType: "image/jpeg", fuelLogId } });
    await prisma.attachment.create({
      data: { filePath: "backup-test/invoice.pdf", mimeType: "application/pdf", maintenanceRecordId },
    });

    await prisma.reminder.create({ data: { vehicleId, type: "engineOilFilter", dueOdometer: 15_000, status: "PENDING" } });
    await prisma.consumablePart.create({
      data: { vehicleId, partType: "engineOilFilter", installedDate: new Date("2026-01-02T00:00:00.000Z"), installedOdometer: 12_100 },
    });
    await prisma.trip.create({
      data: { vehicleId, startTime: new Date("2026-01-03T00:00:00.000Z"), endTime: new Date("2026-01-03T01:00:00.000Z"), distanceKm: 42 },
    });
    await prisma.telemetryRaw.create({ data: { vehicleId, source: "test", lat: 37.5, lon: 127.0, odometer: 12_050 } });
    await prisma.pushSubscription.create({
      data: { userId: adminId, endpoint: `https://push.example.com/${suffix}`, p256dh: "key", auth: "auth" },
    });
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  it("round-trips every backed-up table through export and restore", async () => {
    const exportRes = await app.inject({
      method: "GET",
      url: "/api/backup/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers["content-type"]).toBe("application/gzip");
    const archive = exportRes.rawPayload;
    expect(archive.length).toBeGreaterThan(0);

    const restoreRes = await postRestore(app, adminToken, archive);
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json()).toEqual({ success: true });

    // 이 잡은 이 테스트 파일 하나만 격리된 DB에서 실행하므로(vitest.integration.config.ts의
    // fileParallelism: false), export 시점 이후로 restore가 지웠다가 되채운 테이블에는
    // 정확히 이 fixture들만 남아 있어야 한다 — 개수를 정확히 비교할 수 있다.
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.vehicle.count()).resolves.toBe(1);
    await expect(prisma.userVehicleAccess.count()).resolves.toBe(1);
    await expect(prisma.fuelLog.count()).resolves.toBe(1);
    await expect(prisma.maintenanceRecord.count()).resolves.toBe(1);
    await expect(prisma.attachment.count()).resolves.toBe(2);
    await expect(prisma.reminder.count()).resolves.toBe(1);
    await expect(prisma.consumablePart.count()).resolves.toBe(1);
    await expect(prisma.trip.count()).resolves.toBe(1);
    await expect(prisma.telemetryRaw.count()).resolves.toBe(1);
    await expect(prisma.pushSubscription.count()).resolves.toBe(1);

    const restoredAdmin = await prisma.user.findUnique({ where: { id: adminId } });
    expect(restoredAdmin?.email).toBe(`backup-${suffix}@example.com`);
    expect(restoredAdmin?.role).toBe("ADMIN");

    const restoredVehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(restoredVehicle?.odometer).toBe(12_345);
    expect(restoredVehicle?.createdByUserId).toBe(adminId);

    const restoredFuelLog = await prisma.fuelLog.findUnique({ where: { id: fuelLogId } });
    expect(restoredFuelLog?.liters).toBe(40);
    expect(restoredFuelLog?.cost).toBe(66_000);

    const attachments = await prisma.attachment.findMany();
    expect(attachments.map((a) => a.fuelLogId).filter(Boolean)).toEqual([fuelLogId]);
    expect(attachments.map((a) => a.maintenanceRecordId).filter(Boolean)).toEqual([maintenanceRecordId]);
  });

  it("rejects a restore whose only conflict is email letter-casing, without touching existing data", async () => {
    const usersBefore = await prisma.user.count();

    const archive = await buildArchive({
      users: [
        { id: randomUUID(), name: "Dup One", email: "Dup@Example.com", passwordHash: "x", role: "GENERAL", status: "ACTIVE" },
        { id: randomUUID(), name: "Dup Two", email: "dup@example.com", passwordHash: "x", role: "GENERAL", status: "ACTIVE" },
      ],
    });

    const res = await postRestore(app, adminToken, archive);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("dup@example.com");
    // 검증은 트랜잭션을 열기 전에 일어난다 — 거부됐다면 기존 데이터는 그대로여야 한다.
    await expect(prisma.user.count()).resolves.toBe(usersBefore);
  });

  it("rejects a restore request with no file part", async () => {
    const boundary = `----garageBackupTestNoFile${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="note"\r\n\r\n`),
      Buffer.from("no file in this request"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});
