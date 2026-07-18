// 정비를 잘 챙길수록(정시 완료, 꼼꼼한 기록, 좋은 연비) 쌓이는 경험치/레벨/뱃지 체계.
// 페널티는 없다 — 잘했을 때만 보상하고, 못했다고 깎지 않는다.
// API와 웹이 레벨 계산식·뱃지 카탈로그를 이 파일 하나로 공유해서 두 쪽이 어긋나지 않게 한다.

const XP_PER_LEVEL_BASE = 100;
const XP_LEVEL_GROWTH = 1.35;

// level에 "도달"하기 위해 누적으로 필요한 총 XP (level 1은 0).
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) {
    total += Math.round(XP_PER_LEVEL_BASE * Math.pow(l - 1, XP_LEVEL_GROWTH));
  }
  return total;
}

export type LevelProgress = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export function levelForXp(xp: number): LevelProgress {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= xp) level++;
  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  return { level, xp, xpIntoLevel: xp - currentLevelXp, xpForNextLevel: nextLevelXp - currentLevelXp };
}

// XpEvent.type 값 — API가 기록하고, 뱃지 등급 판정에도 이 값으로 개수를 센다.
export const XP_EVENT_TYPES = {
  COMPLETION: "COMPLETION",
  ON_TIME_BONUS: "ON_TIME_BONUS",
  DETAIL_BONUS: "DETAIL_BONUS",
  EFFICIENCY_BONUS: "EFFICIENCY_BONUS",
} as const;
export type XpEventType = (typeof XP_EVENT_TYPES)[keyof typeof XP_EVENT_TYPES];

export const XP_AMOUNTS: Record<XpEventType, number> = {
  COMPLETION: 10,
  ON_TIME_BONUS: 10,
  DETAIL_BONUS: 10,
  EFFICIENCY_BONUS: 15,
};

// 깃허브 업적 뱃지처럼, 뱃지마다 "등급"이 있어서 계속 잘할수록 x1 → x5로 올라간다.
// 초보자는 쉬운 1등급을, 고인물은 계속 오르는 등급을 목표로 삼을 수 있게 상한을 두지 않는다.
export type BadgeKey =
  | "maintenance_master"
  | "on_time_pro"
  | "detail_master"
  | "efficiency_king"
  | "admin_master"
  | "level_milestone"
  | "trip_explorer"
  | "photo_historian";

export const BADGE_KEYS: BadgeKey[] = [
  "maintenance_master",
  "on_time_pro",
  "detail_master",
  "efficiency_king",
  "admin_master",
  "level_milestone",
  "trip_explorer",
  "photo_historian",
];

// 각 뱃지가 몇 등급까지 있고, 등급별로 몇 건(또는 몇 레벨)이 필요한지.
export const BADGE_TIER_THRESHOLDS: Record<BadgeKey, number[]> = {
  maintenance_master: [1, 5, 15, 30, 60],
  on_time_pro: [1, 5, 15, 30, 60],
  detail_master: [1, 5, 15, 30, 60],
  efficiency_king: [1, 5, 15, 30, 60],
  admin_master: [1, 3, 8, 15, 30],
  level_milestone: [5, 10, 20, 40, 80],
  trip_explorer: [1, 5, 15, 30, 60],
  photo_historian: [1, 3, 8, 15, 30],
};

export const MAX_BADGE_TIER: Record<BadgeKey, number> = Object.fromEntries(
  BADGE_KEYS.map((key) => [key, BADGE_TIER_THRESHOLDS[key].length]),
) as Record<BadgeKey, number>;

// count(누적 완료 건수 등)가 badgeKey의 몇 등급에 해당하는지. 0이면 아직 미획득.
export function tierForCount(key: BadgeKey, count: number): number {
  const thresholds = BADGE_TIER_THRESHOLDS[key];
  let tier = 0;
  for (const threshold of thresholds) {
    if (count >= threshold) tier++;
    else break;
  }
  return tier;
}

// 다음 등급까지 몇 건 남았는지. 이미 최고 등급이면 null(더 이상 없음).
export function countToNextTier(key: BadgeKey, count: number): number | null {
  const thresholds = BADGE_TIER_THRESHOLDS[key];
  const nextThreshold = thresholds.find((t) => count < t);
  return nextThreshold === undefined ? null : nextThreshold - count;
}

export const BADGE_ICONS: Record<BadgeKey, string> = {
  maintenance_master: "🔧",
  on_time_pro: "⏱️",
  detail_master: "📋",
  efficiency_king: "⛽",
  admin_master: "📄",
  level_milestone: "⭐",
  trip_explorer: "🧭",
  photo_historian: "📷",
};
