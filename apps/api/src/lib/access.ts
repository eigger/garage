import { prisma } from "./prisma.js";

export type VehicleAccessLevel = {
  canAccess: boolean;
  // 위치(위경도·속도·주행 경로)는 접근권한과 별개로 관리한다 — 차량 기록은 같이 보되
  // 실시간 위치는 공유하고 싶지 않은 경우가 있어서다. 관리자는 항상 볼 수 있다.
  canViewLocation: boolean;
  // 차량 자체의 수정·삭제·접근권한 배분 권한. 관리자와 그 차량을 등록한 사람만 가진다.
  canManage: boolean;
};

const ADMIN_ACCESS: VehicleAccessLevel = {
  canAccess: true,
  canViewLocation: true,
  canManage: true,
};

const NO_ACCESS: VehicleAccessLevel = {
  canAccess: false,
  canViewLocation: false,
  canManage: false,
};

// 관리자는 모든 차량에 접근 가능. 일반 사용자는 user_vehicle_access에 지정된
// 차량만 접근 가능하다.
export async function getVehicleAccess(
  userId: string,
  role: "ADMIN" | "GENERAL",
  vehicleId: string,
): Promise<VehicleAccessLevel> {
  if (role === "ADMIN") return ADMIN_ACCESS;

  const [access, vehicle] = await Promise.all([
    prisma.userVehicleAccess.findUnique({
      where: { userId_vehicleId: { userId, vehicleId } },
    }),
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { createdByUserId: true },
    }),
  ]);

  if (!access) return NO_ACCESS;

  return {
    canAccess: true,
    canViewLocation: access.canViewLocation,
    canManage: vehicle?.createdByUserId === userId,
  };
}

export async function canAccessVehicle(
  userId: string,
  role: "ADMIN" | "GENERAL",
  vehicleId: string,
): Promise<boolean> {
  const access = await getVehicleAccess(userId, role, vehicleId);
  return access.canAccess;
}

// 차량 등록·수정·삭제·공유는 관리자 또는 그 차량을 등록한 사람만. 등록자가 탈퇴하면
// createdByUserId가 null이 되므로 그때부터는 관리자만 관리할 수 있다.
export async function canManageVehicle(
  userId: string,
  role: "ADMIN" | "GENERAL",
  vehicleId: string,
): Promise<boolean> {
  const access = await getVehicleAccess(userId, role, vehicleId);
  return access.canManage;
}
