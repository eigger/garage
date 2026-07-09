import { prisma } from "./prisma.js";

// 이제 차량(Vehicle) 모델에 저장된 누적 주행거리(odometer) 값을 현재 주행거리로 간주한다.
export async function getLatestOdometer(vehicleId: string): Promise<number> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { odometer: true },
  });
  return vehicle?.odometer ?? 0;
}
