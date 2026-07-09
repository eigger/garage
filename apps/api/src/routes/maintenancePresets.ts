import type { FastifyInstance } from "fastify";
import {
  maintenancePresetTemplateSchema,
  maintenancePresetTemplateUpdateSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { getLatestOdometer } from "../lib/odometer.js";

// 연료타입별 정비·전역 행정 마스터 템플릿. 조회는 인증된 누구나,
// 생성/수정/삭제는 관리자만.
export async function maintenancePresetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const { fuelType, category } = request.query as { fuelType?: string; category?: string };
    return prisma.maintenancePresetTemplate.findMany({
      where: {
        ...(category === "MAINTENANCE" || category === "ADMINISTRATIVE"
          ? { category: category as never }
          : {}),
        ...(fuelType ? { fuelType: fuelType as never } : {}),
      },
      orderBy: [{ category: "asc" }, { fuelType: "asc" }, { sortOrder: "asc" }],
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
    const { fuelType, category } = (request.body ?? {}) as {
      fuelType?: string;
      category?: "MAINTENANCE" | "ADMINISTRATIVE";
    };

    const targetCategory = category ?? "MAINTENANCE";
    const vehicles = await prisma.vehicle.findMany({
      where:
        targetCategory === "MAINTENANCE" && fuelType
          ? { fuelType: fuelType as never }
          : targetCategory === "MAINTENANCE"
            ? { fuelType: { not: null } }
            : {},
      select: { id: true, fuelType: true },
    });

    const presets = await prisma.maintenancePresetTemplate.findMany({
      where: {
        category: targetCategory,
        ...(targetCategory === "MAINTENANCE" && fuelType
          ? { fuelType: fuelType as never }
          : {}),
      },
    });
    if (presets.length === 0) return { updatedVehicles: 0, updatedItems: 0, createdItems: 0 };

    let updatedVehicles = 0;
    let updatedItems = 0;
    let createdItems = 0;

    for (const vehicle of vehicles) {
      if (targetCategory === "MAINTENANCE" && !vehicle.fuelType) continue;
      const applicablePresets =
        targetCategory === "MAINTENANCE"
          ? presets.filter((preset) => preset.fuelType === vehicle.fuelType)
          : presets;
      if (applicablePresets.length === 0) continue;

      const currentOdometer = await getLatestOdometer(vehicle.id);
      const existing = await prisma.consumablePart.findMany({
        where: {
          vehicleId: vehicle.id,
          category: targetCategory,
        },
        select: { id: true, partType: true },
      });
      const existingByType = new Map(existing.map((item) => [item.partType, item]));

      let changed = false;
      for (const preset of applicablePresets) {
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
            category: targetCategory,
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
