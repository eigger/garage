export type Role = "ADMIN" | "GENERAL";

export type UserStatus = "PENDING" | "ACTIVE";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
};

// 구성원 관리 화면 전용 — 계정 정보에 "이 사람이 쓰는 차량"과 삭제 영향 범위가 함께 온다.
export type ManagedUser = User & {
  createdAt: string;
  vehicleAccess: { vehicleId: string; vehicleName: string; canViewLocation: boolean }[];
  createdVehicleCount: number;
  hyundaiLinkedVehicleNames: string[];
};

// 차량 공유 대상 고르기용 최소 명부(이름만).
export type DirectoryUser = {
  id: string;
  name: string;
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
  odometer: number;
  fuelLevel?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  speed?: number | null;
  // 별도 저장 필드가 아니라, 가장 최근 자동차보험 갱신 완료 기록의 shop 값을 서버가 조회해서 내려준다.
  currentInsurer?: string | null;
  // 차량을 관리할 수 없는 사용자에게는 API에서 이 필드 자체를 내려주지 않는다(인증 자격 증명이라 노출 제한).
  apiToken?: string | null;
  // 이 차량을 수정·삭제·공유할 수 있는지. 관리자이거나 본인이 등록한 차량일 때 true.
  // 목록(GET /api/vehicles)에는 없고 차량 상세 응답에만 담긴다.
  canManage?: boolean;
  // 위치(좌표·주행 경로) 열람이 허용됐는지. false면 서버가 좌표를 아예 내려주지 않는다.
  canViewLocation?: boolean;
  createdByUserId?: string | null;
  attachments?: Attachment[];
};

export type MaintenancePresetTemplate = {
  id: string;
  category: RecordCategory;
  fuelType: FuelType | null;
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
  latitude: number | null;
  longitude: number | null;
  address: string | null;
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
  routePolyline: string | null;
  notes: string | null;
  startFuelLevel?: number | null;
  endFuelLevel?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
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

export type XpEvent = {
  id: string;
  vehicleId: string;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

export type EarnedBadge = {
  key: string;
  tier: number;
  count: number;
  earnedAt?: string;
};

export type VehicleGamification = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  badges: EarnedBadge[];
  allBadgeKeys: string[];
  recentEvents: XpEvent[];
};
