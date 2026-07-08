import type { FastifyInstance } from "fastify";
import { maintenanceRecordSchema, maintenanceRecordUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { syncReminders } from "../jobs/reminders.js";

export async function maintenanceRecordRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId } = request.query as { vehicleId?: string };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return prisma.maintenanceRecord.findMany({
      where: { vehicleId },
      orderBy: { date: "desc" },
      include: { attachments: true },
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
