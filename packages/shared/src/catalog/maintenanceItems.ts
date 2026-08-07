import type { CatalogEntry } from "./types.js";
import {
  catalogItemLabel,
  hasStoredCatalogItem,
  legacyKoLookup,
  storedLabel,
  storedVariants,
} from "./types.js";
import type { Locale } from "../i18n/locale.js";

export const MAINTENANCE_ITEMS = {
  engineOilFilter: {
    legacyKo: "엔진오일·오일필터 교체",
    labels: { ko: "엔진오일·오일필터 교체", en: "Engine oil & oil filter replacement" },
  },
  engineAirFilter: {
    legacyKo: "엔진 에어필터 교체",
    labels: { ko: "엔진 에어필터 교체", en: "Engine air filter replacement" },
  },
  cabinAirFilter: {
    legacyKo: "에어컨(캐빈) 필터 교체",
    labels: { ko: "에어컨(캐빈) 필터 교체", en: "Cabin air filter replacement" },
  },
  sparkPlug: {
    legacyKo: "점화플러그 교체",
    labels: { ko: "점화플러그 교체", en: "Spark plug replacement" },
  },
  intakeSystemCleaning: {
    legacyKo: "흡기 계통(스로틀바디·인젝터) 클리닝",
    labels: { ko: "흡기 계통(스로틀바디·인젝터) 클리닝", en: "Intake system cleaning" },
  },
  fuelFilter: {
    legacyKo: "연료필터 교체",
    labels: { ko: "연료필터 교체", en: "Fuel filter replacement" },
  },
  brakePadInspection: {
    legacyKo: "브레이크 패드 점검",
    labels: { ko: "브레이크 패드 점검", en: "Brake pad inspection" },
  },
  brakeFluid: {
    legacyKo: "브레이크액 교체",
    labels: { ko: "브레이크액 교체", en: "Brake fluid replacement" },
  },
  coolant: {
    legacyKo: "냉각수(부동액) 교체",
    labels: { ko: "냉각수(부동액) 교체", en: "Coolant replacement" },
  },
  transmissionFluid: {
    legacyKo: "변속기 오일 교체",
    labels: { ko: "변속기 오일 교체", en: "Transmission fluid replacement" },
  },
  tireRotation: {
    legacyKo: "타이어 위치 교환",
    labels: { ko: "타이어 위치 교환", en: "Tyre rotation" },
  },
  tireReplacement: {
    legacyKo: "타이어 교체",
    labels: { ko: "타이어 교체", en: "Tyre replacement" },
  },
  wheelAlignment: {
    legacyKo: "휠 얼라인먼트",
    labels: { ko: "휠 얼라인먼트", en: "Wheel alignment" },
  },
  driveBelt: {
    legacyKo: "구동벨트(팬벨트) 교체",
    labels: { ko: "구동벨트(팬벨트) 교체", en: "Drive belt replacement" },
  },
  timingBelt: {
    legacyKo: "타이밍벨트 교체",
    labels: { ko: "타이밍벨트 교체", en: "Timing belt replacement" },
  },
  differentialOil: {
    legacyKo: "디퍼렌셜 오일 교체",
    labels: { ko: "디퍼렌셜 오일 교체", en: "Differential oil replacement" },
  },
  acRefrigerant: {
    legacyKo: "에어컨 냉매 점검·충전",
    labels: { ko: "에어컨 냉매 점검·충전", en: "A/C refrigerant check & recharge" },
  },
  brakeDisc: {
    legacyKo: "브레이크 디스크 점검·교체",
    labels: { ko: "브레이크 디스크 점검·교체", en: "Brake disc inspection/replacement" },
  },
  suspensionInspection: {
    legacyKo: "하체·서스펜션 점검",
    labels: { ko: "하체·서스펜션 점검", en: "Suspension inspection" },
  },
  waterRepellentCoating: {
    legacyKo: "발수코팅",
    labels: { ko: "발수코팅", en: "Water-repellent coating" },
  },
  underbodyRustproofing: {
    legacyKo: "하부방청",
    labels: { ko: "하부방청", en: "Underbody rustproofing" },
  },
  glassOilFilmRemoval: {
    legacyKo: "유막제거",
    labels: { ko: "유막제거", en: "Glass oil-film removal" },
  },
  // 손세차·기계세차·내부/외부는 메모로 구분. 주기 추적에는 단일 항목이 더 낫다.
  carWash: {
    legacyKo: "세차",
    labels: { ko: "세차", en: "Car wash" },
  },
  batteryReplacement: {
    legacyKo: "배터리 교체",
    labels: { ko: "배터리 교체", en: "Battery replacement" },
  },
  auxBatteryReplacement: {
    legacyKo: "12V 보조배터리 교체",
    labels: { ko: "12V 보조배터리 교체", en: "12V auxiliary battery replacement" },
  },
  hybridTransaxleFluid: {
    legacyKo: "하이브리드 변속기 오일 교체",
    labels: { ko: "하이브리드 변속기 오일 교체", en: "Hybrid transaxle fluid replacement" },
  },
  inverterHybridCoolant: {
    legacyKo: "인버터·하이브리드 냉각수 교체",
    labels: { ko: "인버터·하이브리드 냉각수 교체", en: "Inverter/hybrid coolant replacement" },
  },
  hvBatterySystemCheck: {
    legacyKo: "HV 배터리·시스템 점검",
    labels: { ko: "HV 배터리·시스템 점검", en: "HV battery & system check" },
  },
  batteryCheck: {
    legacyKo: "배터리 점검",
    labels: { ko: "배터리 점검", en: "Battery check" },
  },
  wiperBlade: {
    legacyKo: "와이퍼 블레이드 교체",
    labels: { ko: "와이퍼 블레이드 교체", en: "Wiper blade replacement" },
  },
  dieselFuelFilter: {
    legacyKo: "경유(연료) 필터 교체",
    labels: { ko: "경유(연료) 필터 교체", en: "Diesel fuel filter replacement" },
  },
  dpfCleaning: {
    legacyKo: "DPF(매연저감장치) 점검·클리닝",
    labels: { ko: "DPF(매연저감장치) 점검·클리닝", en: "DPF check & cleaning" },
  },
  adBlueCheck: {
    legacyKo: "요소수(AdBlue) 보충 점검",
    labels: { ko: "요소수(AdBlue) 보충 점검", en: "AdBlue check & refill" },
  },
  glowPlugInspection: {
    legacyKo: "글로우플러그 점검",
    labels: { ko: "글로우플러그 점검", en: "Glow plug inspection" },
  },
  lpgFilter: {
    legacyKo: "LPG 필터 교체",
    labels: { ko: "LPG 필터 교체", en: "LPG fuel filter replacement" },
  },
  lpgInjectorCleaning: {
    legacyKo: "인젝터·솔레노이드밸브 클리닝",
    labels: { ko: "인젝터·솔레노이드밸브 클리닝", en: "LPG injector/solenoid valve cleaning" },
  },
  lpgCylinderValveInspection: {
    legacyKo: "LPG 봄베(연료탱크) 밸브 점검",
    labels: { ko: "LPG 봄베(연료탱크) 밸브 점검", en: "LPG cylinder valve inspection" },
  },
  lpgCylinderInspection: {
    legacyKo: "LPG 용기 재검사(법정)",
    labels: { ko: "LPG 용기 재검사(법정)", en: "LPG cylinder statutory inspection" },
  },
  reductionGearOil: {
    legacyKo: "감속기(리덕션기어) 오일 교체",
    labels: { ko: "감속기(리덕션기어) 오일 교체", en: "Reduction gear oil replacement" },
  },
  evCoolant: {
    legacyKo: "냉각수(배터리·모터 냉각) 교체",
    labels: { ko: "냉각수(배터리·모터 냉각) 교체", en: "Coolant (battery/motor) replacement" },
  },
  auxBatteryCheck: {
    legacyKo: "12V 보조배터리 점검",
    labels: { ko: "12V 보조배터리 점검", en: "12V auxiliary battery check" },
  },
  driveMotorBatteryCheck: {
    legacyKo: "구동모터·배터리 상태 점검",
    labels: { ko: "구동모터·배터리 상태 점검", en: "Drive motor & battery diagnostic" },
  },
} as const satisfies Record<string, CatalogEntry>;

export type MaintenanceItemKey = keyof typeof MAINTENANCE_ITEMS;

export function resolveMaintenanceItemKey(stored: string): MaintenanceItemKey | null {
  return legacyKoLookup(MAINTENANCE_ITEMS, stored);
}

/** @deprecated use itemKey string directly for new DB rows */
export function maintenanceStoredLabel(key: MaintenanceItemKey): string {
  return storedLabel(MAINTENANCE_ITEMS, key);
}

export function maintenanceItemLabel(key: MaintenanceItemKey, locale: Locale): string {
  return catalogItemLabel(MAINTENANCE_ITEMS, key, locale);
}

export function maintenanceStoredVariants(key: MaintenanceItemKey): string[] {
  return storedVariants(MAINTENANCE_ITEMS, key);
}

export function hasStoredMaintenanceItem(
  existing: Set<string>,
  key: MaintenanceItemKey,
): boolean {
  return hasStoredCatalogItem(MAINTENANCE_ITEMS, existing, key);
}
