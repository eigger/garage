export type Role = "ADMIN" | "GENERAL";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type FuelType = "GASOLINE" | "DIESEL" | "LPG" | "ELECTRIC" | "HYBRID";

export type RecordCategory = "MAINTENANCE" | "ADMINISTRATIVE";

export type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  fuelType: FuelType | null;
  tireSize: string | null;
  batteryCapacity: string | null;
  // 관리자가 아닌 사용자에게는 API에서 이 필드 자체를 내려주지 않는다(인증 자격 증명이라 노출 제한).
  apiToken?: string | null;
  attachments?: Attachment[];
};

export type MaintenancePresetTemplate = {
  id: string;
  fuelType: FuelType;
  name: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  sortOrder: number;
};

export type Attachment = {
  id: string;
  filePath: string;
  mimeType: string;
  uploadedAt: string;
  vehicleId?: string | null;
};

export type FuelLog = {
  id: string;
  vehicleId: string;
  userId: string | null;
  date: string;
  odometer: number;
  liters: number;
  cost: number;
  fullTank: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  opinetStationId: string | null;
  attachments: Attachment[];
};

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  date: string;
  odometer: number;
  type: string;
  category: RecordCategory;
  cost: number | null;
  shop: string | null;
  notes: string | null;
  attachments: Attachment[];
};

export type ConsumablePart = {
  id: string;
  vehicleId: string;
  partType: string;
  category: RecordCategory;
  installedDate: string;
  installedOdometer: number;
  expectedLifeKm: number | null;
  expectedLifeMonths: number | null;
};

export type Trip = {
  id: string;
  vehicleId: string;
  startTime: string;
  endTime: string | null;
  distanceKm: number | null;
  avgSpeed: number | null;
  idleTimeSec: number | null;
  purpose: "BUSINESS" | "PERSONAL" | null;
  routePolyline: string | null;
};

export type TripSummary = {
  period: "week" | "month";
  tripCount: number;
  totalDistanceKm: number;
  totalDurationSec: number;
};

export type VehicleAccess = {
  userId: string;
  name: string;
  email: string;
  canViewLocation: boolean;
};

export type Reminder = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  type: string;
  dueDate: string | null;
  dueOdometer: number | null;
  currentOdometer: number;
  isDue: boolean;
};
