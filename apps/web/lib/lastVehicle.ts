const LAST_VEHICLE_STORAGE_KEY = "garage_last_vehicle_id";

export function setLastVehicleId(id: string): void {
  localStorage.setItem(LAST_VEHICLE_STORAGE_KEY, id);
}

export function getLastVehicleId(): string | null {
  return localStorage.getItem(LAST_VEHICLE_STORAGE_KEY);
}
