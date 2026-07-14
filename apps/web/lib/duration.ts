import type { TranslationKey } from "./i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function formatDuration(seconds: number, t: Translator): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}${t("minutesShort")}`;
  return `${hours}${t("hoursShort")} ${minutes}${t("minutesShort")}`;
}
