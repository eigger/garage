export const KM_TO_MI = 0.621371;

export function formatDistanceVal(km: number, distanceUnit: "km" | "mi"): string {
  if (distanceUnit === "mi") {
    return `${(km * KM_TO_MI).toFixed(1)} mi`;
  }
  return `${km.toFixed(0)} km`;
}

export function formatCurrencyVal(amountInKrw: number, currency: "KRW" | "USD"): string {
  const localeTag = currency === "USD" ? "en-US" : "ko-KR";
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "KRW" ? 0 : 2,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(amountInKrw);
}

// 서버는 항상 UTC ISO 문자열을 내려주므로, 문자열을 그대로 slice하면 뷰어의 로컬 시간대가
// 반영되지 않는다 — Date로 파싱한 뒤 Intl로 브라우저의 로컬 시간대에 맞춰 표시해야 한다.
export function formatDateTimeVal(iso: string, locale: "ko" | "en"): string {
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale !== "ko",
  }).format(new Date(iso));
}
