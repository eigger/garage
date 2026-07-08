import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 영수증/보험증권/견적서 등을 fuelLog 또는 maintenanceRecord, 혹은 vehicle에 첨부한다.
  app.post("/", async (request, reply) => {
    const { fuelLogId, maintenanceRecordId, vehicleId: qVehicleId } = request.query as {
      fuelLogId?: string;
      maintenanceRecordId?: string;
      vehicleId?: string;
    };
    if (!fuelLogId && !maintenanceRecordId && !qVehicleId) {
      return reply.code(400).send({ error: "fuelLogId, maintenanceRecordId 또는 vehicleId가 필요합니다" });
    }

    const { sub, role } = request.user;

    let vehicleId: string | null = null;
    if (fuelLogId) {
      const record = await prisma.fuelLog.findUnique({ where: { id: fuelLogId } });
      if (!record) return reply.code(404).send({ error: "fuel log not found" });
      vehicleId = record.vehicleId;
    } else if (maintenanceRecordId) {
      const record = await prisma.maintenanceRecord.findUnique({
        where: { id: maintenanceRecordId },
      });
      if (!record) return reply.code(404).send({ error: "maintenance record not found" });
      vehicleId = record.vehicleId;
    } else if (qVehicleId) {
      vehicleId = qVehicleId;
    }

    if (!vehicleId || !(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "파일이 없습니다" });
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(400).send({ error: `지원하지 않는 파일 형식: ${file.mimetype}` });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(file.filename) || "";
    const storedName = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, storedName);

    await pipeline(file.file, createWriteStream(filePath));

    const attachment = await prisma.attachment.create({
      data: {
        filePath: storedName,
        mimeType: file.mimetype,
        fuelLogId: fuelLogId ?? null,
        maintenanceRecordId: maintenanceRecordId ?? null,
        vehicleId: qVehicleId ?? null,
      },
    });

    return reply.code(201).send(attachment);
  });

  // 파일 다운로드 및 스트리밍 엔드포인트
  app.get("/file/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // 경로 탐색 공격 방지
    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

    const attachment = await prisma.attachment.findFirst({
      where: { filePath: safeName },
    });
    if (!attachment) return reply.code(404).send({ error: "file not found" });

    // 첨부된 리소스를 기준으로 차량 권한(사용자별 접근성) 확인
    const { sub, role } = request.user;
    let vehicleId: string | null = null;
    if (attachment.fuelLogId) {
      const record = await prisma.fuelLog.findUnique({ where: { id: attachment.fuelLogId } });
      if (record) vehicleId = record.vehicleId;
    } else if (attachment.maintenanceRecordId) {
      const record = await prisma.maintenanceRecord.findUnique({
        where: { id: attachment.maintenanceRecordId },
      });
      if (record) vehicleId = record.vehicleId;
    } else if (attachment.vehicleId) {
      vehicleId = attachment.vehicleId;
    }

    if (!vehicleId || !(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: "file on disk not found" });
    }

    reply.type(attachment.mimeType);
    return createReadStream(filePath);
  });
}
