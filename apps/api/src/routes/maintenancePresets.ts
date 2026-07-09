import type { FastifyInstance } from "fastify";
import {
  maintenancePresetTemplateSchema,
  maintenancePresetTemplateUpdateSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";

// 연료타입별 정비 마스터 템플릿. 조회는 인증된 누구나(차량 등록 폼 등에서 참고),
// 생성/수정/삭제는 관리자만.
export async function maintenancePresetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const { fuelType } = request.query as { fuelType?: string };
    return prisma.maintenancePresetTemplate.findMany({
      where: fuelType ? { fuelType: fuelType as never } : undefined,
      orderBy: [{ fuelType: "asc" }, { sortOrder: "asc" }],
    });
  });

  app.post("/", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const parsed = maintenancePresetTemplateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const preset = await prisma.maintenancePresetTemplate.create({ data: parsed.data });
    return reply.code(201).send(preset);
  });

  app.patch("/:id", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = maintenancePresetTemplateUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.maintenancePresetTemplate.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "preset not found" });

    const preset = await prisma.maintenancePresetTemplate.update({
      where: { id },
      data: parsed.data,
    });
    return preset;
  });

  app.delete("/:id", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.maintenancePresetTemplate.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "preset not found" });

    await prisma.maintenancePresetTemplate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/apply-existing", { preHandler: [app.requireAdmin] }, async (request) => {
    const { fuelType } = (request.body ?? {}) as { fuelType?: string };

    const vehicles = await prisma.vehicle.findMany({
      where: fuelType ? { fuelType: fuelType as never } : { fuelType: { not: null } },
      select: { id: true, fuelType: true },
    });

    let updatedVehicles = 0;
    let updatedItems = 0;
    let createdItems = 0;

    for (const vehicle of vehicles) {
      if (!vehicle.fuelType) continue;
      const presets = await prisma.maintenancePresetTemplate.findMany({
        where: { fuelType: vehicle.fuelType as never },
      });
      if (presets.length === 0) continue;

      const currentOdometer = await getLatestOdometer(vehicle.id);
      const existing = await prisma.consumablePart.findMany({
        where: { vehicleId: vehicle.id },
        select: { id: true, partType: true },
      });
      const existingByType = new Map(existing.map((item) => [item.partType, item]));

      let changed = false;
      for (const preset of presets) {
        const matched = existingByType.get(preset.name);
        if (matched) {
          await prisma.consumablePart.update({
            where: { id: matched.id },
            data: {
              expectedLifeKm: preset.intervalKm,
              expectedLifeMonths: preset.intervalMonths,
              presetTemplateId: preset.id,
            },
          });
          updatedItems += 1;
          changed = true;
          continue;
        }

        await prisma.consumablePart.create({
          data: {
            vehicleId: vehicle.id,
            partType: preset.name,
            installedDate: new Date(),
            installedOdometer: currentOdometer,
            expectedLifeKm: preset.intervalKm,
            expectedLifeMonths: preset.intervalMonths,
            presetTemplateId: preset.id,
          },
        });
        createdItems += 1;
        changed = true;
      }

      if (changed) updatedVehicles += 1;
    }

    return { updatedVehicles, updatedItems, createdItems };
  });
}
