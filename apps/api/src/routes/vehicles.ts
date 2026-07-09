import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  vehicleSchema,
  vehicleUpdateSchema,
  vehicleAccessSchema,
  fuelLogSchema,
  maintenanceRecordSchema,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { ensureAdminSchedule } from "../lib/adminSchedule.js";
import { syncReminders } from "../jobs/reminders.js";

// 차량 등록 시 연료타입에 맞는 정비 마스터 프리셋을 그 차량의 관리 항목(ConsumablePart)으로
// 복사한다. 마지막 시행일/주행거리는 정확히 알 수 없으니 "지금 시점 · 현재 주행거리"로 시작하고
// (이미 기록이 있는 차량에 나중에 연료타입을 지정하는 경우를 위해 0이 아니라 실제 현재 주행거리를
// 기준으로 삼는다), 이후 차량별로 독립적으로 수정한다 (마스터 템플릿을 바꿔도 이미 복사된 차량
// 항목엔 영향 없음).
async function applyPresetsToVehicle(vehicleId: string, fuelType: string): Promise<void> {
  const presets = await prisma.maintenancePresetTemplate.findMany({
    where: { category: "MAINTENANCE", fuelType: fuelType as never },
  });
  if (presets.length === 0) return;

  const currentOdometer = await getLatestOdometer(vehicleId);

  await prisma.consumablePart.createMany({
    data: presets.map((preset) => ({
      vehicleId,
      partType: preset.name,
      installedDate: new Date(),
      installedOdometer: currentOdometer,
      expectedLifeKm: preset.intervalKm,
      expectedLifeMonths: preset.intervalMonths,
      presetTemplateId: preset.id,
    })),
  });
}

// apiToken은 인증 없이 텔레메트리를 주입할 수 있는 자격 증명이라 관리자만 봐야 한다.
// 접근권한만 있는 일반 사용자에게는 나머지 필드는 그대로 두고 이 필드만 가린다.
function omitApiTokenUnlessAdmin<T extends { apiToken?: string | null }>(
  vehicle: T,
  role: "ADMIN" | "GENERAL",
): T {
  if (role === "ADMIN") return vehicle;
  const { apiToken, ...rest } = vehicle;
  return rest as T;
}

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 관리자는 전체 차량, 일반 사용자는 담당 차량만 조회.
  app.get("/", async (request) => {
    const { sub, role } = request.user;
    if (role === "ADMIN") return prisma.vehicle.findMany();

    const vehicles = await prisma.vehicle.findMany({
      where: { access: { some: { userId: sub } } },
    });
    return vehicles.map((v) => omitApiTokenUnlessAdmin(v, role));
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;

    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!vehicle) return reply.code(404).send({ error: "vehicle not found" });
    return omitApiTokenUnlessAdmin(vehicle, role);
  });

  // 차량 등록/수정/삭제는 관리자만.
  app.post("/", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const parsed = vehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const vehicle = await prisma.vehicle.create({
      data: {
        ...parsed.data,
        apiToken: randomUUID(),
      },
    });
    if (vehicle.fuelType) await applyPresetsToVehicle(vehicle.id, vehicle.fuelType);
    await ensureAdminSchedule(vehicle.id);
    return reply.code(201).send(vehicle);
  });

  app.patch("/:id", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = vehicleUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "vehicle not found" });

    const vehicle = await prisma.vehicle.update({ where: { id }, data: parsed.data });

    // 등록 당시 연료타입이 없다가 나중에 지정된 경우, 이 시점에 프리셋을 한 번 적용해준다.
    // 이미 연료타입이 있던 차량의 재분류는 기존 항목 중복 생성을 막기 위해 자동 적용하지 않는다.
    if (!existing.fuelType && vehicle.fuelType) {
      await applyPresetsToVehicle(vehicle.id, vehicle.fuelType);
    }
    return vehicle;
  });

  app.delete("/:id", { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.vehicle.delete({ where: { id } });
    return reply.code(204).send();
  });

  // 차량 경로 기반 레코드 생성 API:
  // body에 vehicleId를 넣지 않아도 되도록 HA/스크립트 연동 단순화용으로 제공한다.
  app.post("/:id/fuel-logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = fuelLogSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      vehicleId: id,
    });
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const fuelLog = await prisma.$transaction(async (tx) => {
      const log = await tx.fuelLog.create({
        data: { ...parsed.data, userId: sub },
      });

      const vehicle = await tx.vehicle.findUnique({
        where: { id },
        select: { odometer: true },
      });

      if (vehicle && parsed.data.odometer > vehicle.odometer) {
        await tx.vehicle.update({
          where: { id },
          data: { odometer: parsed.data.odometer },
        });
      }

      return log;
    });

    return reply.code(201).send(fuelLog);
  });

  app.get("/:id/fuel-logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return prisma.fuelLog.findMany({
      where: { vehicleId: id },
      orderBy: { date: "desc" },
      include: { attachments: true },
      take: parsedLimit,
      skip: parsedOffset,
    });
  });

  app.patch("/:id/fuel-logs/:logId", async (request, reply) => {
    const { id, logId } = request.params as { id: string; logId: string };
    const parsed = fuelLogSchema.omit({ vehicleId: true }).partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const existing = await prisma.fuelLog.findUnique({ where: { id: logId } });
    if (!existing || existing.vehicleId !== id) {
      return reply.code(404).send({ error: "fuel log not found" });
    }
    const fuelLog = await prisma.$transaction(async (tx) => {
      const log = await tx.fuelLog.update({ where: { id: logId }, data: parsed.data });
      if (parsed.data.odometer !== undefined) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id },
          select: { odometer: true },
        });
        if (vehicle && parsed.data.odometer > vehicle.odometer) {
          await tx.vehicle.update({
            where: { id },
            data: { odometer: parsed.data.odometer },
          });
        }
      }
      return log;
    });
    return fuelLog;
  });

  app.delete("/:id/fuel-logs/:logId", async (request, reply) => {
    const { id, logId } = request.params as { id: string; logId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const existing = await prisma.fuelLog.findUnique({ where: { id: logId } });
    if (!existing || existing.vehicleId !== id) {
      return reply.code(404).send({ error: "fuel log not found" });
    }
    await prisma.fuelLog.delete({ where: { id: logId } });
    return reply.code(204).send();
  });

  app.post("/:id/maintenance-records", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = maintenanceRecordSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      vehicleId: id,
    });
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.create({ data: parsed.data });

      await tx.consumablePart.updateMany({
        where: {
          vehicleId: id,
          partType: parsed.data.type,
        },
        data: {
          installedDate: new Date(parsed.data.date),
          installedOdometer: parsed.data.odometer,
        },
      });

      const vehicle = await tx.vehicle.findUnique({
        where: { id },
        select: { odometer: true },
      });

      if (vehicle && parsed.data.odometer > vehicle.odometer) {
        await tx.vehicle.update({
          where: { id },
          data: { odometer: parsed.data.odometer },
        });
      }

      return rec;
    });

    await syncReminders(id);
    return reply.code(201).send(record);
  });

  app.get("/:id/maintenance-records", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { limit, offset, search, category } = request.query as {
      limit?: string;
      offset?: string;
      search?: string;
      category?: string;
    };
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    const whereClause: {
      vehicleId: string;
      category?: "MAINTENANCE" | "ADMINISTRATIVE";
      OR?: Array<Record<string, unknown>>;
    } = { vehicleId: id };
    if (category === "MAINTENANCE" || category === "ADMINISTRATIVE") {
      whereClause.category = category;
    }
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

  app.patch("/:id/maintenance-records/:recordId", async (request, reply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    const parsed = maintenanceRecordSchema.omit({ vehicleId: true }).partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const existing = await prisma.maintenanceRecord.findUnique({ where: { id: recordId } });
    if (!existing || existing.vehicleId !== id) {
      return reply.code(404).send({ error: "maintenance record not found" });
    }
    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.update({ where: { id: recordId }, data: parsed.data });
      if (parsed.data.date !== undefined || parsed.data.odometer !== undefined || parsed.data.type !== undefined) {
        await tx.consumablePart.updateMany({
          where: {
            vehicleId: id,
            partType: rec.type,
          },
          data: {
            installedDate: new Date(rec.date),
            installedOdometer: rec.odometer,
          },
        });
      }
      if (parsed.data.odometer !== undefined) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id },
          select: { odometer: true },
        });
        if (vehicle && parsed.data.odometer > vehicle.odometer) {
          await tx.vehicle.update({
            where: { id },
            data: { odometer: parsed.data.odometer },
          });
        }
      }
      return rec;
    });
    await syncReminders(id);
    return record;
  });

  app.delete("/:id/maintenance-records/:recordId", async (request, reply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const existing = await prisma.maintenanceRecord.findUnique({ where: { id: recordId } });
    if (!existing || existing.vehicleId !== id) {
      return reply.code(404).send({ error: "maintenance record not found" });
    }
    await prisma.maintenanceRecord.delete({ where: { id: recordId } });
    await syncReminders(id);
    return reply.code(204).send();
  });

  // 정비 스케줄 화면에서 기한 임박 여부를 계산하는 데 쓰는 현재 주행거리.
  app.get("/:id/odometer", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const odometer = await getLatestOdometer(id);
    return { odometer };
  });

  // 일반 사용자별 차량 접근권한 + 실시간 위치 열람 플래그 관리. 관리자 전용.
  app.get("/:id/access", { preHandler: [app.requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const access = await prisma.userVehicleAccess.findMany({
      where: { vehicleId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return access.map((a) => ({
      userId: a.userId,
      name: a.user.name,
      email: a.user.email,
      canViewLocation: a.canViewLocation,
    }));
  });

  app.put(
    "/:id/access/:userId",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string };
      const parsed = vehicleAccessSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const access = await prisma.userVehicleAccess.upsert({
        where: { userId_vehicleId: { userId, vehicleId: id } },
        update: { canViewLocation: parsed.data.canViewLocation },
        create: { userId, vehicleId: id, canViewLocation: parsed.data.canViewLocation },
      });
      return access;
    },
  );

  app.delete(
    "/:id/access/:userId",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string };
      const existing = await prisma.userVehicleAccess.findUnique({
        where: { userId_vehicleId: { userId, vehicleId: id } },
      });
      if (!existing) return reply.code(404).send({ error: "access not found" });

      await prisma.userVehicleAccess.delete({
        where: { userId_vehicleId: { userId, vehicleId: id } },
      });
      return reply.code(204).send();
    },
  );

  app.post(
    "/:id/token/reset",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.vehicle.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: "vehicle not found" });

      const updated = await prisma.vehicle.update({
        where: { id },
        data: { apiToken: randomUUID() },
      });
      return { apiToken: updated.apiToken };
    },
  );
}
