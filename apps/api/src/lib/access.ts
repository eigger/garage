import { prisma } from "./prisma.js";

// 관리자는 모든 차량에 접근 가능. 일반 사용자는 user_vehicle_access에 지정된
// 차량만 접근 가능하다.
export async function canAccessVehicle(
  userId: string,
  role: "ADMIN" | "GENERAL",
  vehicleId: string,
): Promise<boolean> {
  if (role === "ADMIN") return true;

  const access = await prisma.userVehicleAccess.findUnique({
    where: { userId_vehicleId: { userId, vehicleId } },
  });
  return access !== null;
}
