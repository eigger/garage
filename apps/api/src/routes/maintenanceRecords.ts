import type { FastifyInstance } from "fastify";
import { maintenanceRecordSchema, maintenanceRecordUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { syncReminders } from "../jobs/reminders.js";

export async function maintenanceRecordRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId, limit, offset, search } = request.query as {
      vehicleId?: string;
      limit?: string;
      offset?: string;
      search?: string;
    };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    const whereClause: any = { vehicleId };
    if (search) {
      whereClause.OR = [
        { type: { contains: search, mode: "insensitive" } },
        { shop: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    return prisma.maintenanceRecord.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      include: { attachments: true },
      take: parsedLimit,
      skip: parsedOffset,
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = maintenanceRecordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, parsed.data.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.create({ data: parsed.data });

      // 정비 기록 추가 시 동일한 타입의 정비 스케줄 항목(ConsumablePart)도 자동으로 완료 처리(동기화)
      await tx.consumablePart.updateMany({
        where: {
          vehicleId: parsed.data.vehicleId,
          partType: parsed.data.type,
        },
        data: {
          installedDate: new Date(parsed.data.date),
          installedOdometer: parsed.data.odometer,
        },
      });

      // 차량 오도미터 동기화
      const vehicle = await tx.vehicle.findUnique({
        where: { id: parsed.data.vehicleId },
        select: { odometer: true },
      });

      if (vehicle && parsed.data.odometer > vehicle.odometer) {
        await tx.vehicle.update({
          where: { id: parsed.data.vehicleId },
          data: { odometer: parsed.data.odometer },
        });
      }

      return rec;
    });

    await syncReminders(parsed.data.vehicleId);

    return reply.code(201).send(record);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = maintenanceRecordUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "maintenance record not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.update({ where: { id }, data: parsed.data });

      if (parsed.data.date !== undefined || parsed.data.odometer !== undefined || parsed.data.type !== undefined) {
        await tx.consumablePart.updateMany({
          where: {
            vehicleId: rec.vehicleId,
            partType: rec.type,
          },
          data: {
            installedDate: new Date(rec.date),
            installedOdometer: rec.odometer,
          },
        });
      }

      // 차량 오도미터 동기화
      if (parsed.data.odometer !== undefined) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: rec.vehicleId },
          select: { odometer: true },
        });

        if (vehicle && parsed.data.odometer > vehicle.odometer) {
          await tx.vehicle.update({
            where: { id: rec.vehicleId },
            data: { odometer: parsed.data.odometer },
          });
        }
      }

      return rec;
    });

    await syncReminders(record.vehicleId);
    return record;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "maintenance record not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.maintenanceRecord.delete({ where: { id } });
    });

    await syncReminders(existing.vehicleId);
    return reply.code(204).send();
  });
}
