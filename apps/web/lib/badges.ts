import { BADGE_ICONS, MAX_BADGE_TIER, countToNextTier, type BadgeKey } from "@garage/shared";
import type { TranslationKey } from "./i18n/translations";

const NAME_KEYS: Record<BadgeKey, TranslationKey> = {
  maintenance_master: "badgeMaintenanceMasterName",
  on_time_pro: "badgeOnTimeProName",
  detail_master: "badgeDetailMasterName",
  efficiency_king: "badgeEfficiencyKingName",
  admin_master: "badgeAdminMasterName",
  level_milestone: "badgeLevelMilestoneName",
  trip_explorer: "badgeTripExplorerName",
  photo_historian: "badgePhotoHistorianName",
};

const DESC_KEYS: Record<BadgeKey, TranslationKey> = {
  maintenance_master: "badgeMaintenanceMasterDesc",
  on_time_pro: "badgeOnTimeProDesc",
  detail_master: "badgeDetailMasterDesc",
  efficiency_king: "badgeEfficiencyKingDesc",
  admin_master: "badgeAdminMasterDesc",
  level_milestone: "badgeLevelMilestoneDesc",
  trip_explorer: "badgeTripExplorerDesc",
  photo_historian: "badgePhotoHistorianDesc",
};

export function badgeNameKey(key: BadgeKey): TranslationKey {
  return NAME_KEYS[key];
}

export function badgeDescKey(key: BadgeKey): TranslationKey {
  return DESC_KEYS[key];
}

export function badgeIcon(key: BadgeKey): string {
  return BADGE_ICONS[key];
}

export function badgeMaxTier(key: BadgeKey): number {
  return MAX_BADGE_TIER[key];
}

export function badgeCountToNextTier(key: BadgeKey, count: number): number | null {
  return countToNextTier(key, count);
}
