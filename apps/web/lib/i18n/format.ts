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
