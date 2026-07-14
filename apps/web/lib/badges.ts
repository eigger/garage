import { BADGE_ICONS, type BadgeKey } from "@garage/shared";
import type { TranslationKey } from "./i18n/translations";

const NAME_KEYS: Record<BadgeKey, TranslationKey> = {
  first_maintenance: "badgeFirstMaintenanceName",
  on_time_3: "badgeOnTime3Name",
  on_time_10: "badgeOnTime10Name",
  detail_master_5: "badgeDetailMaster5Name",
  efficiency_5: "badgeEfficiency5Name",
  level_5: "badgeLevel5Name",
  level_10: "badgeLevel10Name",
  admin_master_3: "badgeAdminMaster3Name",
};

const DESC_KEYS: Record<BadgeKey, TranslationKey> = {
  first_maintenance: "badgeFirstMaintenanceDesc",
  on_time_3: "badgeOnTime3Desc",
  on_time_10: "badgeOnTime10Desc",
  detail_master_5: "badgeDetailMaster5Desc",
  efficiency_5: "badgeEfficiency5Desc",
  level_5: "badgeLevel5Desc",
  level_10: "badgeLevel10Desc",
  admin_master_3: "badgeAdminMaster3Desc",
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
