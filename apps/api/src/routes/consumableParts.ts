import type { FastifyInstance } from "fastify";
import { consumablePartSchema, consumablePartUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { syncReminders } from "../jobs/reminders.js";
import { ensureAdminSchedule } from "../lib/adminSchedule.js";
import { awardCompletionXp } from "../lib/gamification.js";

export async function consumablePartRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId } = request.query as { vehicleId?: string };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await ensureAdminSchedule(vehicleId);

    return prisma.consumablePart.findMany({
      where: { vehicleId },
      orderBy: [{ category: "asc" }, { installedDate: "desc" }],
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = consumablePartSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, parsed.data.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const part = await prisma.$transaction(async (tx) => {
      return tx.consumablePart.create({ data: parsed.data });
    });

    await syncReminders(parsed.data.vehicleId);

    return reply.code(201).send(part);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = consumablePartUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.consumablePart.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "consumable part not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const { recordCompletion, completionCost, completionShop, completionNotes, ...updateData } =
      parsed.data;

    const part = await prisma.$transaction(async (tx) => {
      const updated = await tx.consumablePart.update({ where: { id }, data: updateData });

      if (recordCompletion) {
        await tx.maintenanceRecord.create({
          data: {
            vehicleId: updated.vehicleId,
            date: updated.installedDate,
            odometer: updated.installedOdometer,
            type: updated.partType,
            category: updated.category,
            cost: completionCost,
            shop: completionShop,
            notes: completionNotes,
          },
        });
      }

      return updated;
    });

    await syncReminders(part.vehicleId);

    if (recordCompletion) {
      await awardCompletionXp({
        vehicleId: part.vehicleId,
        itemName: part.partType,
        existing: {
          installedDate: existing.installedDate,
          installedOdometer: existing.installedOdometer,
          expectedLifeKm: existing.expectedLifeKm,
          expectedLifeMonths: existing.expectedLifeMonths,
        },
        completionOdometer: part.installedOdometer,
        completionCost,
        completionShop,
        completionNotes,
      });
    }

    return part;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.consumablePart.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "consumable part not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.consumablePart.delete({ where: { id } });
    });

    await syncReminders(existing.vehicleId);

    return reply.code(204).send();
  });
}
