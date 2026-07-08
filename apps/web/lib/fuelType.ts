import type { FuelType } from "./types";
import type { TranslationKey } from "./i18n/translations";

export function fuelTypeLabelKey(fuelType: FuelType): TranslationKey {
  switch (fuelType) {
    case "GASOLINE":
      return "fuelTypeGasoline";
    case "DIESEL":
      return "fuelTypeDiesel";
    case "LPG":
      return "fuelTypeLpg";
    case "ELECTRIC":
      return "fuelTypeElectric";
  }
}
