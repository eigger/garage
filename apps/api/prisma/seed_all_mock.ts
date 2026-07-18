import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedEvMock(vehicleId: string) {
  // Delete existing telemetry & trips to keep clean
  await prisma.telemetryRaw.deleteMany({ where: { vehicleId } });
  await prisma.trip.deleteMany({ where: { vehicleId } });
  await prisma.fuelLog.deleteMany({ where: { vehicleId } });
  await prisma.maintenanceRecord.deleteMany({ where: { vehicleId } });

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

  // Create Telemetry points for this trip (EV)
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
        lon: 127.105,
        speed: 0,
        rpm: 0,
        fuelLevel: 82.0,
        odometer: 8500,
      }
    ]
  });

  // Create a charging log (liters field represents kWh for EV)
  await prisma.fuelLog.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      odometer: 8350,
      liters: 45.5,
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
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
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
}

async function seedIceMock(vehicleId: string) {
  // Delete existing telemetry & trips to keep clean
  await prisma.telemetryRaw.deleteMany({ where: { vehicleId } });
  await prisma.trip.deleteMany({ where: { vehicleId } });
  await prisma.fuelLog.deleteMany({ where: { vehicleId } });
  await prisma.maintenanceRecord.deleteMany({ where: { vehicleId } });

  // Create a Trip (ICE)
  const trip = await prisma.trip.create({
    data: {
      vehicleId,
      startTime: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      endTime: new Date(Date.now() - 2.5 * 60 * 60 * 1000), // 2.5 hours ago
      distanceKm: 18.2,
      avgSpeed: 55.0,
      idleTimeSec: 120,
      routePolyline: "y~pdFk_zaWzAgGfBaIeCuM", // simple polyline
      notes: "강남-여의도 출근 주행. 무난한 흐름.",
    }
  });

  // Create Telemetry points for this trip (ICE)
  await prisma.telemetryRaw.createMany({
    data: [
      {
        time: new Date(Date.now() - 3 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.4979, // Gangnam
        lon: 127.0276,
        speed: 40,
        rpm: 2000,
        fuelLevel: 60.0,
        odometer: 24482,
      },
      {
        time: new Date(Date.now() - 2.8 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.5172, // Yeouido area
        lon: 126.9368,
        speed: 65,
        rpm: 2200,
        fuelLevel: 59.2,
        odometer: 24491,
      },
      {
        time: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
        vehicleId,
        tripId: trip.id,
        source: "OBD",
        lat: 37.5219, // Yeouido Park
        lon: 126.9241,
        speed: 0,
        rpm: 800,
        fuelLevel: 58.5,
        odometer: 24500,
      }
    ]
  });

  // Create mock fueling logs (ICE)
  await prisma.fuelLog.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      odometer: 23900,
      liters: 50.0,
      cost: 82500, // 1650 KRW / L
      fullTank: true,
      location: "GS칼텍스 여의도주유소",
      latitude: 37.5219,
      longitude: 126.9241,
      address: "서울특별시 영등포구 여의도동 10",
    }
  });

  await prisma.fuelLog.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
      odometer: 23300,
      liters: 55.0,
      cost: 90750,
      fullTank: true,
      location: "SK에너지 강남주유소",
      latitude: 37.4979,
      longitude: 127.0276,
      address: "서울특별시 강남구 역삼동 20",
    }
  });

  // Create a maintenance record (ICE)
  await prisma.maintenanceRecord.create({
    data: {
      vehicleId,
      date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      odometer: 23000,
      type: "엔진오일 및 필터 교체",
      cost: 95000,
      shop: "블루핸즈 역삼점",
      notes: "가솔린 전용 엔진오일 교환 완료.",
      address: "서울특별시 강남구 역삼동 30",
      latitude: 37.495,
      longitude: 127.03,
    }
  });
}

async function main() {
  const evId = "cmrj5hoz90000bez0g40e0nc7";
  const iceId = "cmrc1y5hz0000ilumy03ke38v";

  // 1. Upsert EV vehicle
  await prisma.vehicle.upsert({
    where: { id: evId },
    update: {
      name: "아이오닉 5",
      plate: "98나7654",
      make: "현대",
      model: "IONIQ 5",
      year: 2023,
      fuelType: "ELECTRIC",
      odometer: 8500,
      xp: 150,
    },
    create: {
      id: evId,
      name: "아이오닉 5",
      plate: "98나7654",
      make: "현대",
      model: "IONIQ 5",
      year: 2023,
      fuelType: "ELECTRIC",
      odometer: 8500,
      xp: 150,
      apiToken: "ionic5-api-token-test",
    }
  });
  console.log("EV vehicle upserted.");

  // 2. Upsert ICE vehicle (Grandeur instead of Sonata)
  await prisma.vehicle.upsert({
    where: { id: iceId },
    update: {
      name: "그랜저",
      plate: "54라 8901",
      make: "현대",
      model: "그랜저 GN7",
      year: 2023,
      fuelType: "GASOLINE",
      odometer: 24500,
      xp: 210,
    },
    create: {
      id: iceId,
      name: "그랜저",
      plate: "54라 8901",
      make: "현대",
      model: "그랜저 GN7",
      year: 2023,
      fuelType: "GASOLINE",
      odometer: 24500,
      xp: 210,
      apiToken: "grandeur-api-token-test",
    }
  });
  console.log("ICE vehicle (Grandeur) upserted.");

  // 3. Seed EV mock data
  await seedEvMock(evId);
  console.log("EV mock data seeded.");

  // 4. Seed ICE mock data
  await seedIceMock(iceId);
  console.log("ICE mock data seeded.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
