import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const vehicleId = "cmrj5hoz90000bez0g40e0nc7"; // IONIQ 5
  
  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    console.error(`Vehicle ${vehicleId} not found!`);
    return;
  }

  // Delete existing telemetry & trips to keep clean
  await prisma.telemetryRaw.deleteMany({ where: { vehicleId } });
  await prisma.trip.deleteMany({ where: { vehicleId } });
  await prisma.fuelLog.deleteMany({ where: { vehicleId } });
  await prisma.maintenanceRecord.deleteMany({ where: { vehicleId } });

  console.log("Existing mock data deleted.");

  // Create a Trip
  const trip = await prisma.trip.create({
    data: {
      vehicleId,
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      endTime: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
      distanceKm: 12.5,
      avgSpeed: 42.5,
      idleTimeSec: 240,
      routePolyline: "y~pdFk_zaWzAgGfBaIeCuM", // simple polyline
      notes: "퇴근길 판교-분당 주행. 정체 구간 있었으나 전반적으로 양호.",
    }
  });

  console.log(`Created mock trip: ${trip.id}`);

  // Create Telemetry points for this trip
  await prisma.telemetryRaw.createMany({
    data: [
      {
        time: new Date(Date.now() - 2 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.402,
        lon: 127.108,
        speed: 30,
        rpm: 1500,
        fuelLevel: 85.0,
        odometer: 8487,
      },
      {
        time: new Date(Date.now() - 1.8 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.382,
        lon: 127.118,
        speed: 50,
        rpm: 1800,
        fuelLevel: 83.5,
        odometer: 8493,
      },
      {
        time: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.359,
        lon: 127.105, // Bundang location
        speed: 0,
        rpm: 0,
        fuelLevel: 82.0,
        odometer: 8500,
      }
    ]
  });

  console.log("Created mock telemetry points.");

  // Create a fuel log (charging log since it's electric)
  await prisma.fuelLog.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      odometer: 8350,
      liters: 45.5, // kWh for EV
      cost: 15000,
      fullTank: true,
      location: "분당구청 공영주차장 충전소",
      latitude: 37.382,
      longitude: 127.118,
      address: "경기도 성남시 분당구 분당로 50",
    }
  });

  // Create a maintenance record
  await prisma.maintenanceRecord.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      odometer: 8000,
      type: "에어컨 필터 교체",
      cost: 25000,
      shop: "현대 블루핸즈 분당점",
      notes: "순정 필터로 교환 완료. 주기 10,000km 권장.",
      address: "경기도 성남시 분당구 수내동 12",
      latitude: 37.378,
      longitude: 127.114,
    }
  });

  console.log("Created mock fueling and maintenance records.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
