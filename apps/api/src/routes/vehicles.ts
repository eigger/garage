import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  vehicleSchema,
  vehicleUpdateSchema,
  vehicleAccessSchema,
  fuelLogSchema,
  maintenanceRecordSchema,
  MAINTENANCE_ITEMS,
  ADMIN_ITEMS,
  maintenanceItemLabel,
  adminItemLabel,
  levelForXp,
  BADGE_KEYS,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle } from "../lib/access.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { ensureAdminSchedule } from "../lib/adminSchedule.js";
import { syncReminders } from "../jobs/reminders.js";
import { awardEfficiencyXpIfGood, getBadgeCounts } from "../lib/gamification.js";

const MAX_LIMIT = 1000;

// record.type은 카탈로그 항목(예: "engineOilFilter")이거나 사용자가 직접 입력한 텍스트다.
// 검색창에는 화면에 보이는 번역된 라벨("엔진오일 교체")을 입력하므로, 저장된 원본 키만
// contains로 비교하면 카탈로그 항목은 전혀 검색되지 않는다 — ko/en 라벨에 검색어가
// 포함되는 카탈로그 키를 찾아서 함께 매칭해야 한다.
function findMatchingCatalogKeys(search: string): string[] {
  const lower = search.toLowerCase();
  const keys: string[] = [];
  for (const key of Object.keys(MAINTENANCE_ITEMS) as (keyof typeof MAINTENANCE_ITEMS)[]) {
    if (
      maintenanceItemLabel(key, "ko").toLowerCase().includes(lower) ||
      maintenanceItemLabel(key, "en").toLowerCase().includes(lower)
    ) {
      keys.push(key);
    }
  }
  for (const key of Object.keys(ADMIN_ITEMS) as (keyof typeof ADMIN_ITEMS)[]) {
    if (
      adminItemLabel(key, "ko").toLowerCase().includes(lower) ||
      adminItemLabel(key, "en").toLowerCase().includes(lower)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

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

    // Fetch latest fuel level from telemetry
    const latestTelemetry = await prisma.telemetryRaw.findFirst({
      where: {
        vehicleId: id,
        fuelLevel: { not: null },
      },
      orderBy: {
        time: "desc",
      },
      select: {
        fuelLevel: true,
      },
    });

    // Fetch latest location coordinates from telemetry
    const latestLocation = await prisma.telemetryRaw.findFirst({
      where: {
        vehicleId: id,
        lat: { not: null },
        lon: { not: null },
      },
      orderBy: {
        time: "desc",
      },
      select: {
        lat: true,
        lon: true,
        speed: true,
        time: true,
      },
    });

    const responseData = {
      ...vehicle,
      fuelLevel: latestTelemetry?.fuelLevel ?? null,
      latitude: latestLocation?.lat ?? null,
      longitude: latestLocation?.lon ?? null,
      locationUpdatedAt: latestLocation?.time ?? null,
      speed: latestLocation?.speed ?? null,
    };

    return omitApiTokenUnlessAdmin(responseData, role);
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
    await syncReminders(vehicle.id);
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

    if (parsed.data.fullTank) {
      await awardEfficiencyXpIfGood(id);
    }

    return reply.code(201).send(fuelLog);
  });

  app.get("/:id/fuel-logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : MAX_LIMIT, MAX_LIMIT);
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return prisma.fuelLog.findMany({
      where: { vehicleId: id },
      orderBy: [
        { date: "desc" },
        { id: "desc" },
      ],
      include: { attachments: true },
      take: parsedLimit,
      skip: parsedOffset,
    });
  });

  app.get("/:id/fuel-logs/frequent-stations", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const records = await prisma.fuelLog.findMany({
      where: {
        vehicleId: id,
        location: { not: null, gt: "" },
      },
      orderBy: { date: "desc" },
      select: {
        location: true,
        address: true,
        latitude: true,
        longitude: true,
      },
      take: 100,
    });

    const stationMap = new Map<string, { location: string; address: string | null; latitude: number | null; longitude: number | null; count: number }>();
    for (const r of records) {
      if (!r.location) continue;
      const key = r.location.trim();
      const existing = stationMap.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.address && r.address) existing.address = r.address;
        if (existing.latitude === null && r.latitude !== null) {
          existing.latitude = r.latitude;
          existing.longitude = r.longitude;
        }
      } else {
        stationMap.set(key, {
          location: r.location,
          address: r.address,
          latitude: r.latitude,
          longitude: r.longitude,
          count: 1,
        });
      }
    }

    const frequent = Array.from(stationMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return frequent;
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

  app.get("/:id/maintenance-records/frequent-shops", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const records = await prisma.maintenanceRecord.findMany({
      where: {
        vehicleId: id,
        shop: { not: null, gt: "" },
      },
      orderBy: { date: "desc" },
      select: {
        shop: true,
        address: true,
        latitude: true,
        longitude: true,
      },
      take: 100,
    });

    const shopMap = new Map<string, { shop: string; address: string | null; latitude: number | null; longitude: number | null; count: number }>();
    for (const r of records) {
      if (!r.shop) continue;
      const key = r.shop.trim();
      const existing = shopMap.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.address && r.address) existing.address = r.address;
        if (existing.latitude === null && r.latitude !== null) {
          existing.latitude = r.latitude;
          existing.longitude = r.longitude;
        }
      } else {
        shopMap.set(key, {
          shop: r.shop,
          address: r.address,
          latitude: r.latitude,
          longitude: r.longitude,
          count: 1,
        });
      }
    }

    const frequent = Array.from(shopMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return frequent;
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
    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : MAX_LIMIT, MAX_LIMIT);
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
      const matchingKeys = findMatchingCatalogKeys(search);
      whereClause.OR = [
        { type: { contains: search, mode: "insensitive" } },
        { shop: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        ...(matchingKeys.length > 0 ? [{ type: { in: matchingKeys } }] : []),
      ];
    }
    return prisma.maintenanceRecord.findMany({
      where: whereClause,
      orderBy: [
        { date: "desc" },
        { id: "desc" },
      ],
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

  // 정비 관리 레벨/뱃지. 획득한 뱃지 + 아직 못 딴 뱃지 키를 함께 내려줘서
  // 프론트가 "잠금" 상태까지 한 화면에 보여줄 수 있게 한다.
  app.get("/:id/gamification", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { xp: true } });
    if (!vehicle) return reply.code(404).send({ error: "vehicle not found" });

    const [earnedBadges, recentEvents, counts] = await Promise.all([
      prisma.vehicleBadge.findMany({ where: { vehicleId: id }, orderBy: { earnedAt: "desc" } }),
      prisma.xpEvent.findMany({ where: { vehicleId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
      getBadgeCounts(id),
    ]);

    return {
      ...levelForXp(vehicle.xp),
      badges: earnedBadges.map((b) => ({ key: b.badgeKey, tier: b.tier, count: counts?.[b.badgeKey as keyof typeof counts] ?? 0 })),
      allBadgeKeys: BADGE_KEYS,
      recentEvents,
    };
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
