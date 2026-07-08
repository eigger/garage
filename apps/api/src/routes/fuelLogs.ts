import type { FastifyInstance } from "fastify";
import { fuelLogSchema, fuelLogUpdateSchema } from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";

export async function fuelLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request, reply) => {
    const { vehicleId } = request.query as { vehicleId?: string };
    if (!vehicleId) return reply.code(400).send({ error: "vehicleId is required" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return prisma.fuelLog.findMany({
      where: { vehicleId },
      orderBy: { date: "desc" },
      include: { attachments: true },
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = fuelLogSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, parsed.data.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // 유류비 분담 정산의 기준이 되므로 실제로 기록을 입력한 사용자로 자동 지정한다.
    const fuelLog = await prisma.fuelLog.create({
      data: { ...parsed.data, userId: sub },
    });
    return reply.code(201).send(fuelLog);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = fuelLogUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.fuelLog.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "fuel log not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const fuelLog = await prisma.fuelLog.update({ where: { id }, data: parsed.data });
    return fuelLog;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.fuelLog.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "fuel log not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.fuelLog.delete({ where: { id } });
    return reply.code(204).send();
  });
}
