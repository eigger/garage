import { BADGE_KEYS, XP_AMOUNTS, XP_EVENT_TYPES, levelForXp, type BadgeKey, type XpEventType } from "@garage/shared";
import { prisma } from "./prisma.js";

// 정시 완료·꼼꼼한 기록·좋은 연비에만 XP를 준다 — 늦은 정비를 감점하지 않는다(페널티 없음).
export async function awardXp(vehicleId: string, type: XpEventType, note?: string): Promise<void> {
  const amount = XP_AMOUNTS[type];
  await prisma.$transaction([
    prisma.xpEvent.create({ data: { vehicleId, type, amount, note } }),
    prisma.vehicle.update({ where: { id: vehicleId }, data: { xp: { increment: amount } } }),
  ]);
  await checkAndAwardBadges(vehicleId);
}

async function awardBadge(vehicleId: string, badgeKey: BadgeKey): Promise<void> {
  await prisma.vehicleBadge.upsert({
    where: { vehicleId_badgeKey: { vehicleId, badgeKey } },
    update: {},
    create: { vehicleId, badgeKey },
  });
}

export async function checkAndAwardBadges(vehicleId: string): Promise<void> {
  const [vehicle, existingBadges, onTimeCount, detailCount, efficiencyCount, completionCount, adminCount] =
    await Promise.all([
      prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { xp: true } }),
      prisma.vehicleBadge.findMany({ where: { vehicleId }, select: { badgeKey: true } }),
      prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.ON_TIME_BONUS } }),
      prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.DETAIL_BONUS } }),
      prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.EFFICIENCY_BONUS } }),
      prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.COMPLETION } }),
      prisma.maintenanceRecord.count({ where: { vehicleId, category: "ADMINISTRATIVE" } }),
    ]);
  if (!vehicle) return;

  const already = new Set(existingBadges.map((b) => b.badgeKey));
  const level = levelForXp(vehicle.xp).level;

  const qualifies: Record<BadgeKey, boolean> = {
    first_maintenance: completionCount >= 1,
    on_time_3: onTimeCount >= 3,
    on_time_10: onTimeCount >= 10,
    detail_master_5: detailCount >= 5,
    efficiency_5: efficiencyCount >= 5,
    level_5: level >= 5,
    level_10: level >= 10,
    admin_master_3: adminCount >= 3,
  };

  for (const key of BADGE_KEYS) {
    if (!already.has(key) && qualifies[key]) {
      await awardBadge(vehicleId, key);
    }
  }
}

// 소모품 완료 처리 시 정시 여부/기록 꼼꼼함을 판정해 XP를 준다.
// existing은 update 이전(=완료 처리로 갱신되기 전) 소모품 상태여야 정시 여부를 정확히 계산할 수 있다.
export async function awardCompletionXp(params: {
  vehicleId: string;
  itemName: string;
  existing: { installedDate: Date; installedOdometer: number; expectedLifeKm: number | null; expectedLifeMonths: number | null };
  completionOdometer: number;
  completionCost?: number | null;
  completionShop?: string | null;
  completionNotes?: string | null;
}): Promise<void> {
  const { vehicleId, itemName, existing, completionOdometer, completionCost, completionShop, completionNotes } =
    params;

  await awardXp(vehicleId, XP_EVENT_TYPES.COMPLETION, itemName);

  const now = new Date();
  let dueDate: Date | null = null;
  if (existing.expectedLifeMonths) {
    dueDate = new Date(existing.installedDate);
    dueDate.setMonth(dueDate.getMonth() + existing.expectedLifeMonths);
  }
  const dueOdometer = existing.expectedLifeKm ? existing.installedOdometer + existing.expectedLifeKm : null;
  const hadThreshold = dueDate !== null || dueOdometer !== null;
  const overdue = (dueDate !== null && now > dueDate) || (dueOdometer !== null && completionOdometer >= dueOdometer);
  if (hadThreshold && !overdue) {
    await awardXp(vehicleId, XP_EVENT_TYPES.ON_TIME_BONUS, itemName);
  }

  const isDetailed = Boolean(completionCost) && Boolean(completionShop?.trim()) && Boolean(completionNotes?.trim());
  if (isDetailed) {
    await awardXp(vehicleId, XP_EVENT_TYPES.DETAIL_BONUS, itemName);
  }
}

// 새로 등록된 "가득 채움" 주유 기록의 연비가 이전까지의 평균보다 좋으면 XP를 준다.
// 기준 삼을 과거 가득 채움 구간이 최소 2개는 있어야 비교 의미가 있다 — 데이터가 적으면 그냥 넘어간다(감점 없음).
export async function awardEfficiencyXpIfGood(vehicleId: string): Promise<void> {
  const fullTankLogs = await prisma.fuelLog.findMany({
    where: { vehicleId, fullTank: true },
    orderBy: { odometer: "asc" },
    select: { odometer: true, liters: true },
  });

  const points: number[] = []; // kmPerLiter, 오래된 순
  for (let i = 1; i < fullTankLogs.length; i++) {
    const distanceKm = fullTankLogs[i].odometer - fullTankLogs[i - 1].odometer;
    if (distanceKm > 0 && fullTankLogs[i].liters > 0) {
      points.push(distanceKm / fullTankLogs[i].liters);
    }
  }
  if (points.length < 3) return;

  const latest = points[points.length - 1];
  const baseline = points.slice(0, -1);
  const average = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;

  if (latest >= average) {
    await awardXp(vehicleId, XP_EVENT_TYPES.EFFICIENCY_BONUS);
  }
}
