import type { Locale } from "./locale.js";
import { formatStoredItemLabel } from "../catalog/resolve.js";

const PUSH_MESSAGES: Record<
  Locale,
  { title: string; body: (vehicleName: string, itemLabel: string) => string }
> = {
  ko: {
    title: "Garage 정비 알림",
    body: (vehicleName, itemLabel) => `[${vehicleName}] ${itemLabel} — 점검·갱신 시기입니다`,
  },
  en: {
    title: "Garage maintenance alert",
    body: (vehicleName, itemLabel) => `[${vehicleName}] ${itemLabel} — service is due`,
  },
};

export function buildReminderPushMessage(params: {
  locale: Locale;
  vehicleName: string;
  itemStored: string;
}): { title: string; body: string } {
  const msg = PUSH_MESSAGES[params.locale];
  const itemLabel = formatStoredItemLabel(params.itemStored, params.locale);
  return {
    title: msg.title,
    body: msg.body(params.vehicleName, itemLabel),
  };
}
