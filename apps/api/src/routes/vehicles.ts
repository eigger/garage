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
  adminStoredVariants,
  levelForXp,
  BADGE_KEYS,
} from "@garage/shared";
import { prisma } from "../lib/prisma.js";
import { canAccessVehicle, getVehicleAccess } from "../lib/access.js";
import { getLatestOdometer } from "../lib/odometer.js";
import { ensureAdminSchedule } from "../lib/adminSchedule.js";
import {
  storedTypeVariants,
  syncConsumablePartFromLatestRecord,
} from "../lib/consumablePartBaseline.js";
import { periodRangeFromQuery } from "../lib/dateRange.js";
import { listHistoryPeriods, type HistoryPeriodScope } from "../lib/historyPeriods.js";
import { syncReminders } from "../jobs/reminders.js";
import {
  awardFuelLogXp,
  awardMaintenanceLogXp,
  awardEfficiencyXpIfGood,
  getBadgeCounts,
  checkAndAwardBadges,
} from "../lib/gamification.js";

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
  const existing = await prisma.consumablePart.findMany({
    where: { vehicleId, category: "MAINTENANCE" },
    select: { id: true, partType: true },
  });

  for (const preset of presets) {
    const variants = new Set(storedTypeVariants(preset.name));
    const matches = existing.filter((item) => variants.has(item.partType));
    const preferred =
      matches.find((item) => item.partType === preset.name) ?? matches[0] ?? null;

    if (preferred) {
      await prisma.consumablePart.update({
        where: { id: preferred.id },
        data: {
          partType: preset.name,
          expectedLifeKm: preset.intervalKm,
          expectedLifeMonths: preset.intervalMonths,
          presetTemplateId: preset.id,
        },
      });
      preferred.partType = preset.name;
      const extras = matches.filter((item) => item.id !== preferred.id);
      if (extras.length > 0) {
        await prisma.consumablePart.deleteMany({
          where: { id: { in: extras.map((item) => item.id) } },
        });
        const extraIds = new Set(extras.map((item) => item.id));
        for (let i = existing.length - 1; i >= 0; i--) {
          if (extraIds.has(existing[i].id)) existing.splice(i, 1);
        }
      }
      continue;
    }

    const created = await prisma.consumablePart.create({
      data: {
        vehicleId,
        partType: preset.name,
        category: "MAINTENANCE",
        installedDate: new Date(),
        installedOdometer: currentOdometer,
        expectedLifeKm: preset.intervalKm,
        expectedLifeMonths: preset.intervalMonths,
        presetTemplateId: preset.id,
      },
      select: { id: true, partType: true },
    });
    existing.push(created);
  }
}

// apiToken은 인증 없이 텔레메트리를 주입할 수 있는 자격 증명이라, 그 차량을 관리할 수
// 있는 사람(관리자 또는 등록자)만 봐야 한다. 접근권한만 있는 사용자에게는 나머지 필드는
// 그대로 두고 이 필드만 가린다.
function omitApiTokenUnlessManager<T extends { apiToken?: string | null }>(
  vehicle: T,
  canManage: boolean,
): T {
  if (canManage) return vehicle;
  const { apiToken, ...rest } = vehicle;
  return rest as T;
}

// "위치 열람 허용"이 꺼진 사용자에게는 좌표·속도를 아예 내려주지 않는다. 예전에는 이
// 플래그가 저장만 되고 어디서도 검사되지 않아서, 관리자가 체크를 꺼둬도 실제로는 위치가
// 그대로 보이고 있었다.
function omitLocationUnlessAllowed<
  T extends {
    latitude?: number | null;
    longitude?: number | null;
    locationUpdatedAt?: Date | string | null;
    speed?: number | null;
  },
>(vehicle: T, canViewLocation: boolean): T {
  if (canViewLocation) return vehicle;
  return { ...vehicle, latitude: null, longitude: null, locationUpdatedAt: null, speed: null };
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
    return vehicles.map((v) => omitApiTokenUnlessManager(v, v.createdByUserId === sub));
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;

    const access = await getVehicleAccess(sub, role, id);
    if (!access.canAccess) {
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

    // "현재 보험사"는 별도 필드로 저장하지 않고, 보험 갱신 완료 처리 시 남긴 shop 값을
    // 재사용한다 — 가장 최근 자동차보험 갱신 기록의 shop이 곧 현재 가입된 보험사다.
    const latestInsuranceRecord = await prisma.maintenanceRecord.findFirst({
      where: { vehicleId: id, type: { in: adminStoredVariants("autoInsuranceRenewal") } },
      orderBy: { date: "desc" },
      select: { shop: true },
    });

    const responseData = {
      ...vehicle,
      fuelLevel: latestTelemetry?.fuelLevel ?? null,
      latitude: latestLocation?.lat ?? null,
      longitude: latestLocation?.lon ?? null,
      locationUpdatedAt: latestLocation?.time ?? null,
      speed: latestLocation?.speed ?? null,
      currentInsurer: latestInsuranceRecord?.shop ?? null,
      canManage: access.canManage,
      canViewLocation: access.canViewLocation,
    };

    return omitLocationUnlessAllowed(
      omitApiTokenUnlessManager(responseData, access.canManage),
      access.canViewLocation,
    );
  });

  // 차량 등록은 일반 사용자도 할 수 있다. 등록한 사람에게는 그 차량의 접근권한을 바로
  // 부여하고(안 그러면 자기가 만든 차량이 목록에 뜨지 않는다) 등록자로 기록해둔다 —
  // 이후 수정·삭제·가족 공유를 관리자 없이 스스로 할 수 있게 하기 위해서다.
  app.post("/", async (request, reply) => {
    const parsed = vehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub } = request.user;
    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          ...parsed.data,
          apiToken: randomUUID(),
          createdByUserId: sub,
        },
      });
      await tx.userVehicleAccess.create({
        data: { userId: sub, vehicleId: created.id, canViewLocation: true },
      });
      return created;
    });

    if (vehicle.fuelType) await applyPresetsToVehicle(vehicle.id, vehicle.fuelType);
    await ensureAdminSchedule(vehicle.id);
    return reply.code(201).send(vehicle);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = vehicleUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

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

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }
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

    await awardFuelLogXp(id, parsed.data);
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
    const { limit, offset, search, mine, date, period } = request.query as {
      limit?: string;
      offset?: string;
      search?: string;
      mine?: string;
      date?: string;
      period?: string;
    };
    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : MAX_LIMIT, MAX_LIMIT);
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    const whereClause: {
      vehicleId: string;
      userId?: string;
      date?: { gte: Date; lt: Date };
      OR?: Array<Record<string, unknown>>;
    } = { vehicleId: id };

    // 빠른 입력 폼이 "내가 지난번에 어떻게 넣었는지"를 기본값으로 되살릴 때 쓴다 —
    // 같은 차를 여러 명이 쓰면 가족의 마지막 기록이 아니라 본인 기록이어야 의미가 있다.
    if (mine === "true") {
      whereClause.userId = sub;
    }

    if (search) {
      whereClause.OR = [
        { location: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    const fuelRange = periodRangeFromQuery({ period, date });
    if (fuelRange) whereClause.date = fuelRange;

    return prisma.fuelLog.findMany({
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
        opinetStationId: true,
        cost: true,
        liters: true,
      },
      take: 100,
    });

    const stationMap = new Map<
      string,
      {
        location: string;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        // 빠른 입력에서 이 버튼을 누르면 단가까지 채워야 해서 함께 내려준다. 레코드가
        // date desc로 정렬돼 있어, 한 상호를 처음 만나는 시점이 곧 최근 기록이다 —
        // opinetStationId는 그 최근 기록 값을 그대로 쓰고(연동 여부 판단용),
        // lastUnitPrice는 그때의 원/리터를 보여주기용 폴백으로만 쓴다(과거 가격일 수 있음).
        opinetStationId: string | null;
        lastUnitPrice: number | null;
        count: number;
      }
    >();
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
          opinetStationId: r.opinetStationId,
          lastUnitPrice: r.liters > 0 ? Math.round(r.cost / r.liters) : null,
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

      // 과거 날짜로 소급 입력해도 더 최신 기록이 있으면 스케줄 기준을 덮어쓰지 않는다.
      await syncConsumablePartFromLatestRecord(tx, id, parsed.data.type);

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
    await awardMaintenanceLogXp(id, parsed.data);
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
    const { limit, offset, search, category, date, period } = request.query as {
      limit?: string;
      offset?: string;
      search?: string;
      category?: string;
      date?: string;
      period?: string;
    };
    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : MAX_LIMIT, MAX_LIMIT);
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    const whereClause: {
      vehicleId: string;
      category?: "MAINTENANCE" | "ADMINISTRATIVE";
      date?: { gte: Date; lt: Date };
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
    const maintenanceRange = periodRangeFromQuery({ period, date });
    if (maintenanceRange) whereClause.date = maintenanceRange;
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
        // 수정한 기록이 아니라, 해당 항목의 최신 기록으로 스케줄 기준을 맞춘다.
        // (과거 내역만 고쳤을 때 스케줄이 역행하던 버그 방지)
        await syncConsumablePartFromLatestRecord(tx, id, rec.type);
        if (existing.type !== rec.type) {
          await syncConsumablePartFromLatestRecord(tx, id, existing.type);
        }
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
    await prisma.$transaction(async (tx) => {
      await tx.maintenanceRecord.delete({ where: { id: recordId } });
      await syncConsumablePartFromLatestRecord(tx, id, existing.type);
    });
    await syncReminders(id);
    return reply.code(204).send();
  });

  // 내역 기간 필터용 — 실제 기록이 있는 연도/월만 내려준다.
  app.get("/:id/history-periods", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await canAccessVehicle(sub, role, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { scope } = request.query as { scope?: string };
    if (scope !== "trips" && scope !== "fuel" && scope !== "maintenance") {
      return reply.code(400).send({ error: "scope must be trips, fuel, or maintenance" });
    }
    return listHistoryPeriods(id, scope as HistoryPeriodScope);
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

    await checkAndAwardBadges(id);
    const [earnedBadges, recentEvents, counts] = await Promise.all([
      prisma.vehicleBadge.findMany({ where: { vehicleId: id }, orderBy: { earnedAt: "desc" } }),
      prisma.xpEvent.findMany({ where: { vehicleId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
      getBadgeCounts(id),
    ]);

    return {
      ...levelForXp(vehicle.xp),
      badges: earnedBadges.map((b) => ({
        key: b.badgeKey,
        tier: b.tier,
        count: counts?.[b.badgeKey as keyof typeof counts] ?? 0,
        earnedAt: b.earnedAt,
      })),
      allBadgeKeys: BADGE_KEYS,
      recentEvents,
    };
  });

  // 차량별 접근권한 + 실시간 위치 열람 플래그 관리. 관리자뿐 아니라 그 차량을 등록한
  // 사람도 다룰 수 있다 — 부부가 같은 차를 함께 쓰는 것처럼, 한 차량을 여러 명이 보는 게
  // 기본 사용 형태인데 매번 관리자를 거쳐야 하면 공유가 사실상 막힌다.
  app.get("/:id/access", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

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

  app.put("/:id/access/:userId", async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const parsed = vehicleAccessSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // 승인 대기 중인 계정에 미리 권한을 붙여둘 수는 없다 — 승인 절차를 우회하는 셈이 된다.
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!target) return reply.code(404).send({ error: "user not found" });
    if (target.status !== "ACTIVE") {
      return reply.code(400).send({ error: "user not active" });
    }

    const access = await prisma.userVehicleAccess.upsert({
      where: { userId_vehicleId: { userId, vehicleId: id } },
      update: { canViewLocation: parsed.data.canViewLocation },
      create: { userId, vehicleId: id, canViewLocation: parsed.data.canViewLocation },
    });
    return access;
  });

  app.delete("/:id/access/:userId", async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const existing = await prisma.userVehicleAccess.findUnique({
      where: { userId_vehicleId: { userId, vehicleId: id } },
    });
    if (!existing) return reply.code(404).send({ error: "access not found" });

    // 등록자 본인의 접근권한까지 빼버리면 그 차량은 목록에서 사라지는데 관리 권한은
    // createdByUserId에 남아 있어서 상태가 어긋난다. 등록자는 차량을 삭제할 수는 있어도
    // 자기 자신을 공유 목록에서 뺄 수는 없게 한다.
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { createdByUserId: true },
    });
    if (vehicle?.createdByUserId === userId) {
      return reply.code(400).send({ error: "cannot remove the vehicle owner" });
    }

    await prisma.userVehicleAccess.delete({
      where: { userId_vehicleId: { userId, vehicleId: id } },
    });
    return reply.code(204).send();
  });

  app.post("/:id/token/reset", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sub, role } = request.user;
    if (!(await getVehicleAccess(sub, role, id)).canManage) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "vehicle not found" });

    const updated = await prisma.vehicle.update({
      where: { id },
      data: { apiToken: randomUUID() },
    });
    return { apiToken: updated.apiToken };
  });
}
