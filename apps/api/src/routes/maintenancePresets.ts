import type { FastifyInstance } from "fastify";
import {
  maintenancePresetTemplateSchema,
  maintenancePresetTemplateUpdateSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";

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
}
