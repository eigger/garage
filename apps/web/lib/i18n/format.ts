export const KM_TO_MI = 0.621371;
// 미국 액량 갤런 기준(1 gal = 3.785411784 L).
export const L_TO_GAL = 0.26417205;

export function formatDistanceVal(km: number, distanceUnit: "km" | "mi"): string {
  if (distanceUnit === "mi") {
    return `${(km * KM_TO_MI).toFixed(1)} mi`;
  }
  return `${km.toFixed(0)} km`;
}

// 주행거리·주기는 DB에 km 정수로 저장한다. 입력란은 사용자가 고른 단위로 보여주고 저장
// 직전에 km로 되돌리는데, 정수로 반올림하는 왕복이라 값이 1 단위씩 흔들릴 수 있다 —
// 호출부는 "사용자가 입력란을 건드리지 않았으면 원본 km를 그대로 보낸다"로 이를 막는다.
export function toDisplayDistanceVal(km: number, distanceUnit: "km" | "mi"): number {
  return distanceUnit === "mi" ? Math.round(km * KM_TO_MI) : km;
}

export function toStoredDistanceVal(value: number, distanceUnit: "km" | "mi"): number {
  return distanceUnit === "mi" ? Math.round(value / KM_TO_MI) : value;
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
