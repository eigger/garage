import {
  BADGE_KEYS,
  XP_AMOUNTS,
  XP_EVENT_TYPES,
  levelForXp,
  tierForCount,
  type BadgeKey,
  type XpEventType,
} from "@garage/shared";
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

// 뱃지는 새로 딸 때 tier 1로 생기고, 이후로는 같은 뱃지의 tier만 올라간다(깃허브 업적처럼
// x1→x5). 등급을 낮추는 일은 없다 — 이미 딴 등급 아래로 떨어뜨리지 않는다.
async function upsertBadgeTier(vehicleId: string, badgeKey: BadgeKey, tier: number): Promise<void> {
  const existing = await prisma.vehicleBadge.findUnique({
    where: { vehicleId_badgeKey: { vehicleId, badgeKey } },
  });
  if (existing) {
    if (tier > existing.tier) {
      await prisma.vehicleBadge.update({ where: { id: existing.id }, data: { tier } });
    }
  } else {
    await prisma.vehicleBadge.create({ data: { vehicleId, badgeKey, tier } });
  }
}

// 뱃지 등급 판정에 쓰는 원본 누적치 — 뱃지 갱신과 조회 API 둘 다 이 함수 하나로 계산해서
// 등급 산정 로직이 두 곳에서 따로 어긋나지 않게 한다.
export async function getBadgeCounts(vehicleId: string): Promise<Record<BadgeKey, number> | null> {
  const [vehicle, onTimeCount, detailCount, efficiencyCount, completionCount, adminCount] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { xp: true } }),
    prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.ON_TIME_BONUS } }),
    prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.DETAIL_BONUS } }),
    prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.EFFICIENCY_BONUS } }),
    prisma.xpEvent.count({ where: { vehicleId, type: XP_EVENT_TYPES.COMPLETION } }),
    prisma.maintenanceRecord.count({ where: { vehicleId, category: "ADMINISTRATIVE" } }),
  ]);
  if (!vehicle) return null;

  return {
    maintenance_master: completionCount,
    on_time_pro: onTimeCount,
    detail_master: detailCount,
    efficiency_king: efficiencyCount,
    admin_master: adminCount,
    level_milestone: levelForXp(vehicle.xp).level,
  };
}

export async function checkAndAwardBadges(vehicleId: string): Promise<void> {
  const counts = await getBadgeCounts(vehicleId);
  if (!counts) return;

  for (const key of BADGE_KEYS) {
    const tier = tierForCount(key, counts[key]);
    if (tier > 0) {
      await upsertBadgeTier(vehicleId, key, tier);
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
  hasPhoto?: boolean;
}): Promise<void> {
  const {
    vehicleId,
    itemName,
    existing,
    completionOdometer,
    completionCost,
    completionShop,
    completionNotes,
    hasPhoto,
  } = params;

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

  // 비용·업체·메모·사진 중 최소 2가지를 채우면 "꼼꼼한 기록" 보너스 — 사진만 붙이거나
  // 텍스트만 다 채우거나, 어느 쪽으로도 달성할 수 있게 열어둔다.
  const filledCount = [Boolean(completionCost), Boolean(completionShop?.trim()), Boolean(completionNotes?.trim()), Boolean(hasPhoto)]
    .filter(Boolean).length;
  if (filledCount >= 2) {
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
