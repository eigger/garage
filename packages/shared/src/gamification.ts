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

// XpEvent.type 값 — API가 기록하고, 뱃지 조건 판정에도 이 값으로 개수를 센다.
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

export type BadgeKey =
  | "first_maintenance"
  | "on_time_3"
  | "on_time_10"
  | "detail_master_5"
  | "efficiency_5"
  | "level_5"
  | "level_10"
  | "admin_master_3";

export const BADGE_KEYS: BadgeKey[] = [
  "first_maintenance",
  "on_time_3",
  "on_time_10",
  "detail_master_5",
  "efficiency_5",
  "level_5",
  "level_10",
  "admin_master_3",
];

// 뱃지 자체는 순수 UI 표시용(색/아이콘)만 여기 두고, 이름/설명은 번역 파일(navBadge* 키)에 둔다.
export const BADGE_ICONS: Record<BadgeKey, string> = {
  first_maintenance: "🔧",
  on_time_3: "⏱️",
  on_time_10: "🛡️",
  detail_master_5: "📋",
  efficiency_5: "⛽",
  level_5: "⭐",
  level_10: "🌟",
  admin_master_3: "📄",
};
