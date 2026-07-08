import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { canAccessVehicle } from "../lib/access.js";

export async function reminderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 대시보드 배지용: 접근 가능한 모든 차량의 PENDING 리마인더 중
  // 실제로 기한(거리 또는 기간)이 지난 것만 "due: true"로 표시한다.
  app.get("/", async (request) => {
    const { sub, role } = request.user;

    const vehicles =
      role === "ADMIN"
        ? await prisma.vehicle.findMany({ select: { id: true, name: true } })
        : await prisma.vehicle.findMany({
            where: { access: { some: { userId: sub } } },
            select: { id: true, name: true },
          });

    const now = new Date();
    const result = [];

    for (const vehicle of vehicles) {
      const reminders = await prisma.reminder.findMany({
        where: { vehicleId: vehicle.id, status: "PENDING" },
      });
      if (reminders.length === 0) continue;

      const currentOdometer = await getLatestOdometer(vehicle.id);

      for (const reminder of reminders) {
        const dueByDate = reminder.dueDate ? reminder.dueDate <= now : false;
        const dueByOdometer = reminder.dueOdometer
          ? currentOdometer >= reminder.dueOdometer
          : false;

        result.push({
          ...reminder,
          vehicleName: vehicle.name,
          currentOdometer,
          isDue: dueByDate || dueByOdometer,
        });
      }
    }

    return result;
  });

  app.post("/:id/dismiss", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "reminder not found" });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, existing.vehicleId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const reminder = await prisma.reminder.update({
      where: { id },
      data: { status: "DISMISSED" },
    });
    return reminder;
  });
}
