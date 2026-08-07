import type { FuelType } from "../schemas/vehicle.js";
import type { MaintenanceItemKey } from "./maintenanceItems.js";

export type MaintenancePresetDef = {
  fuelType: FuelType;
  itemKey: MaintenanceItemKey;
  intervalKm?: number;
  intervalMonths?: number;
};

/** 더 이상 쓰지 않는 마스터 프리셋 — seed 시 템플릿만 제거(차량별 스케줄은 유지) */
export const DEPRECATED_MAINTENANCE_PRESETS: {
  fuelType: FuelType;
  itemKey: MaintenanceItemKey;
}[] = [
  { fuelType: "GASOLINE", itemKey: "batteryCheck" },
  { fuelType: "DIESEL", itemKey: "batteryCheck" },
  { fuelType: "LPG", itemKey: "batteryCheck" },
  { fuelType: "LPG", itemKey: "coolant" },
  { fuelType: "ELECTRIC", itemKey: "auxBatteryCheck" },
];

/** 연료타입별 정비 마스터 프리셋 기본값 */
export const MAINTENANCE_PRESET_DEFS: MaintenancePresetDef[] = [
  { fuelType: "GASOLINE", itemKey: "engineOilFilter", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "GASOLINE", itemKey: "engineAirFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", itemKey: "cabinAirFilter", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "GASOLINE", itemKey: "sparkPlug", intervalKm: 100000 },
  { fuelType: "GASOLINE", itemKey: "intakeSystemCleaning", intervalKm: 50000 },
  { fuelType: "GASOLINE", itemKey: "fuelFilter", intervalKm: 40000 },
  { fuelType: "GASOLINE", itemKey: "brakePadInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", itemKey: "brakeFluid", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", itemKey: "coolant", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", itemKey: "transmissionFluid", intervalKm: 70000 },
  { fuelType: "GASOLINE", itemKey: "tireRotation", intervalKm: 10000 },
  { fuelType: "GASOLINE", itemKey: "tireReplacement", intervalKm: 40000, intervalMonths: 36 },
  { fuelType: "GASOLINE", itemKey: "wheelAlignment", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", itemKey: "driveBelt", intervalKm: 60000, intervalMonths: 48 },
  { fuelType: "GASOLINE", itemKey: "timingBelt", intervalKm: 100000, intervalMonths: 60 },
  { fuelType: "GASOLINE", itemKey: "differentialOil", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", itemKey: "acRefrigerant", intervalMonths: 24 },
  { fuelType: "GASOLINE", itemKey: "brakeDisc", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "GASOLINE", itemKey: "suspensionInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "GASOLINE", itemKey: "batteryReplacement", intervalMonths: 48 },
  { fuelType: "GASOLINE", itemKey: "wiperBlade", intervalMonths: 12 },

  { fuelType: "DIESEL", itemKey: "engineOilFilter", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "DIESEL", itemKey: "dieselFuelFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "engineAirFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "cabinAirFilter", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "dpfCleaning", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "adBlueCheck", intervalKm: 10000 },
  { fuelType: "DIESEL", itemKey: "glowPlugInspection", intervalKm: 60000 },
  { fuelType: "DIESEL", itemKey: "brakePadInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "brakeFluid", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", itemKey: "coolant", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", itemKey: "transmissionFluid", intervalKm: 70000 },
  { fuelType: "DIESEL", itemKey: "tireRotation", intervalKm: 10000 },
  { fuelType: "DIESEL", itemKey: "tireReplacement", intervalKm: 40000, intervalMonths: 36 },
  { fuelType: "DIESEL", itemKey: "wheelAlignment", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "driveBelt", intervalKm: 60000, intervalMonths: 48 },
  { fuelType: "DIESEL", itemKey: "timingBelt", intervalKm: 100000, intervalMonths: 60 },
  { fuelType: "DIESEL", itemKey: "differentialOil", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", itemKey: "acRefrigerant", intervalMonths: 24 },
  { fuelType: "DIESEL", itemKey: "brakeDisc", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "DIESEL", itemKey: "suspensionInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "DIESEL", itemKey: "batteryReplacement", intervalMonths: 48 },
  { fuelType: "DIESEL", itemKey: "wiperBlade", intervalMonths: 12 },

  { fuelType: "LPG", itemKey: "engineOilFilter", intervalKm: 10000, intervalMonths: 6 },
  { fuelType: "LPG", itemKey: "lpgFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "engineAirFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "cabinAirFilter", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "sparkPlug", intervalKm: 100000 },
  { fuelType: "LPG", itemKey: "lpgInjectorCleaning", intervalKm: 50000 },
  { fuelType: "LPG", itemKey: "lpgCylinderValveInspection", intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "lpgCylinderInspection", intervalMonths: 60 },
  { fuelType: "LPG", itemKey: "brakePadInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "brakeFluid", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "LPG", itemKey: "tireRotation", intervalKm: 10000 },
  { fuelType: "LPG", itemKey: "tireReplacement", intervalKm: 40000, intervalMonths: 36 },
  { fuelType: "LPG", itemKey: "wheelAlignment", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "driveBelt", intervalKm: 60000, intervalMonths: 48 },
  { fuelType: "LPG", itemKey: "timingBelt", intervalKm: 100000, intervalMonths: 60 },
  { fuelType: "LPG", itemKey: "differentialOil", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "LPG", itemKey: "acRefrigerant", intervalMonths: 24 },
  { fuelType: "LPG", itemKey: "brakeDisc", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "LPG", itemKey: "suspensionInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "LPG", itemKey: "batteryReplacement", intervalMonths: 48 },
  { fuelType: "LPG", itemKey: "wiperBlade", intervalMonths: 12 },

  { fuelType: "HYBRID", itemKey: "engineOilFilter", intervalKm: 10000, intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "engineAirFilter", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "cabinAirFilter", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "sparkPlug", intervalKm: 100000 },
  { fuelType: "HYBRID", itemKey: "hybridTransaxleFluid", intervalKm: 70000, intervalMonths: 48 },
  { fuelType: "HYBRID", itemKey: "inverterHybridCoolant", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "hvBatterySystemCheck", intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "brakePadInspection", intervalKm: 30000, intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "brakeFluid", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "tireRotation", intervalKm: 10000 },
  { fuelType: "HYBRID", itemKey: "tireReplacement", intervalKm: 40000, intervalMonths: 36 },
  { fuelType: "HYBRID", itemKey: "wheelAlignment", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "driveBelt", intervalKm: 60000, intervalMonths: 48 },
  { fuelType: "HYBRID", itemKey: "timingBelt", intervalKm: 100000, intervalMonths: 60 },
  { fuelType: "HYBRID", itemKey: "differentialOil", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "acRefrigerant", intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "brakeDisc", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "HYBRID", itemKey: "suspensionInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "HYBRID", itemKey: "batteryReplacement", intervalMonths: 48 },
  { fuelType: "HYBRID", itemKey: "wiperBlade", intervalMonths: 12 },

  { fuelType: "ELECTRIC", itemKey: "reductionGearOil", intervalKm: 60000 },
  { fuelType: "ELECTRIC", itemKey: "cabinAirFilter", intervalKm: 15000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", itemKey: "brakePadInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", itemKey: "brakeFluid", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "ELECTRIC", itemKey: "evCoolant", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "ELECTRIC", itemKey: "tireRotation", intervalKm: 10000 },
  { fuelType: "ELECTRIC", itemKey: "tireReplacement", intervalKm: 40000, intervalMonths: 36 },
  { fuelType: "ELECTRIC", itemKey: "wheelAlignment", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", itemKey: "acRefrigerant", intervalMonths: 24 },
  { fuelType: "ELECTRIC", itemKey: "brakeDisc", intervalKm: 40000, intervalMonths: 24 },
  { fuelType: "ELECTRIC", itemKey: "suspensionInspection", intervalKm: 20000, intervalMonths: 12 },
  { fuelType: "ELECTRIC", itemKey: "auxBatteryReplacement", intervalMonths: 48 },
  { fuelType: "ELECTRIC", itemKey: "driveMotorBatteryCheck", intervalMonths: 12 },
  { fuelType: "ELECTRIC", itemKey: "wiperBlade", intervalMonths: 12 },
];

export function maintenancePresetDefsForFuelType(fuelType: FuelType): MaintenancePresetDef[] {
  return MAINTENANCE_PRESET_DEFS.filter((p) => p.fuelType === fuelType);
}
