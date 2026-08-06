import bcrypt from "bcryptjs";
import { prisma } from "../apps/api/src/lib/prisma.js";
import { ensureMaintenancePresets } from "../apps/api/src/lib/seedPresets.js";
import { syncReminders } from "../apps/api/src/jobs/reminders.js";

async function seedDemoData() {
  console.log("Seeding maintenance presets...");
  await ensureMaintenancePresets();

  console.log("Creating admin & general users...");
  const passwordHash = await bcrypt.hash("changeme123", 10);
  
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: {
      name: "관리자",
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const spouse = await prisma.user.upsert({
    where: { email: "spouse@example.com" },
    update: { role: "GENERAL", status: "ACTIVE" },
    create: {
      name: "배우자",
      email: "spouse@example.com",
      passwordHash,
      role: "GENERAL",
      status: "ACTIVE",
    },
  });

  console.log("Creating vehicles...");
  // Clear existing demo vehicles if any
  await prisma.vehicle.deleteMany({
    where: { id: { in: ["demo-ev", "demo-ice"] } },
  });

  const ev = await prisma.vehicle.create({
    data: {
      id: "demo-ev",
      name: "아이오닉 5",
      make: "현대",
      model: "아이오닉 5 Long Range",
      year: 2024,
      fuelType: "ELECTRIC",
      plate: "123허 4567",
      odometer: 18500,
      xp: 380,
      batteryCapacity: "77.4",
      apiToken: "demo-ev-token",
      createdByUserId: admin.id,
    },
  });

  const ice = await prisma.vehicle.create({
    data: {
      id: "demo-ice",
      name: "그랜저",
      make: "현대",
      model: "그랜저 2.5 GDI",
      year: 2023,
      fuelType: "GASOLINE",
      plate: "56가 7890",
      odometer: 42300,
      xp: 520,
      apiToken: "demo-ice-token",
      createdByUserId: admin.id,
    },
  });

  console.log("Assigning vehicle access...");
  await prisma.userVehicleAccess.createMany({
    data: [
      { userId: admin.id, vehicleId: ev.id, canViewLocation: true },
      { userId: admin.id, vehicleId: ice.id, canViewLocation: true },
      { userId: spouse.id, vehicleId: ev.id, canViewLocation: true },
      { userId: spouse.id, vehicleId: ice.id, canViewLocation: true },
    ],
  });

  console.log("Creating fuel & charging logs...");
  await prisma.fuelLog.createMany({
    data: [
      // ICE Fuel Logs
      {
        vehicleId: ice.id,
        userId: admin.id,
        date: new Date("2026-08-01T09:30:00Z"),
        odometer: 42300,
        liters: 52.4,
        cost: 88500,
        fullTank: true,
        location: "SK에너지 행복주유소",
        latitude: 37.5665,
        longitude: 126.9780,
      },
      {
        vehicleId: ice.id,
        userId: admin.id,
        date: new Date("2026-07-20T14:15:00Z"),
        odometer: 41650,
        liters: 48.0,
        cost: 80000,
        fullTank: true,
        location: "GS칼텍스 대동주유소",
        latitude: 37.5610,
        longitude: 126.9720,
      },
      {
        vehicleId: ice.id,
        userId: admin.id,
        date: new Date("2026-07-08T18:40:00Z"),
        odometer: 41020,
        liters: 50.1,
        cost: 84000,
        fullTank: true,
        location: "S-OIL 한마음주유소",
        latitude: 37.5700,
        longitude: 126.9800,
      },
      {
        vehicleId: ice.id,
        userId: admin.id,
        date: new Date("2026-06-25T11:20:00Z"),
        odometer: 40400,
        liters: 49.5,
        cost: 82000,
        fullTank: true,
        location: "HD현대오일뱅크 삼거리주유소",
        latitude: 37.5550,
        longitude: 126.9650,
      },
      // EV Charging Logs
      {
        vehicleId: ev.id,
        userId: admin.id,
        date: new Date("2026-08-02T20:10:00Z"),
        odometer: 18500,
        liters: 55.2,
        cost: 18200,
        fullTank: true,
        location: "환경부 강남구청 충전소",
        latitude: 37.5172,
        longitude: 127.0473,
      },
      {
        vehicleId: ev.id,
        userId: admin.id,
        date: new Date("2026-07-22T19:00:00Z"),
        odometer: 17950,
        liters: 48.0,
        cost: 15800,
        fullTank: true,
        location: "한국전력 판교역 충전소",
        latitude: 37.3947,
        longitude: 127.1112,
      },
      {
        vehicleId: ev.id,
        userId: admin.id,
        date: new Date("2026-07-10T10:30:00Z"),
        odometer: 17400,
        liters: 52.5,
        cost: 17300,
        fullTank: true,
        location: "채비 서초센터 충전소",
        latitude: 37.4836,
        longitude: 127.0327,
      },
    ],
  });

  console.log("Creating maintenance records...");
  await prisma.maintenanceRecord.createMany({
    data: [
      // ICE
      {
        vehicleId: ice.id,
        date: new Date("2026-07-15T10:00:00Z"),
        odometer: 41500,
        type: "engineOilFilter",
        category: "MAINTENANCE",
        cost: 75000,
        shop: "현대 블루핸즈 강남점",
        notes: "순정 합성유 5W-30 교체",
      },
      {
        vehicleId: ice.id,
        date: new Date("2026-06-01T15:30:00Z"),
        odometer: 39800,
        type: "airConditionerFilter",
        category: "MAINTENANCE",
        cost: 25000,
        shop: "자가 교체",
      },
      {
        vehicleId: ice.id,
        date: new Date("2026-05-10T11:00:00Z"),
        odometer: 38500,
        type: "vehicleInspection",
        category: "ADMINISTRATIVE",
        cost: 55000,
        shop: "한국교통안전공단 검사소",
      },
      // EV
      {
        vehicleId: ev.id,
        date: new Date("2026-07-05T14:00:00Z"),
        odometer: 17200,
        type: "airConditionerFilter",
        category: "MAINTENANCE",
        cost: 28000,
        shop: "자가 교체",
      },
      {
        vehicleId: ev.id,
        date: new Date("2026-05-20T16:00:00Z"),
        odometer: 15000,
        type: "brakeFluid",
        category: "MAINTENANCE",
        cost: 45000,
        shop: "현대 블루핸즈 서초점",
      },
    ],
  });

  console.log("Creating consumable parts / schedule items...");
  await prisma.consumablePart.createMany({
    data: [
      // ICE Parts
      {
        vehicleId: ice.id,
        partType: "engineOilFilter",
        installedDate: new Date("2026-07-15T10:00:00Z"),
        installedOdometer: 41500,
        expectedLifeKm: 10000,
        expectedLifeMonths: 12,
      },
      {
        vehicleId: ice.id,
        partType: "airConditionerFilter",
        installedDate: new Date("2026-06-01T15:30:00Z"),
        installedOdometer: 39800,
        expectedLifeKm: 15000,
        expectedLifeMonths: 12,
      },
      {
        vehicleId: ice.id,
        partType: "brakeFluid",
        installedDate: new Date("2024-05-10T00:00:00Z"),
        installedOdometer: 10000,
        expectedLifeKm: 40000,
        expectedLifeMonths: 24, // overdue or due soon!
      },
      {
        vehicleId: ice.id,
        partType: "tireRotation",
        installedDate: new Date("2025-08-01T00:00:00Z"),
        installedOdometer: 30000,
        expectedLifeKm: 10000,
        expectedLifeMonths: 12,
      },
      {
        vehicleId: ice.id,
        partType: "carInsurance",
        installedDate: new Date("2025-08-15T00:00:00Z"),
        installedOdometer: 30000,
        expectedLifeMonths: 12,
      },
      // EV Parts
      {
        vehicleId: ev.id,
        partType: "airConditionerFilter",
        installedDate: new Date("2026-07-05T14:00:00Z"),
        installedOdometer: 17200,
        expectedLifeKm: 15000,
        expectedLifeMonths: 12,
      },
      {
        vehicleId: ev.id,
        partType: "brakeFluid",
        installedDate: new Date("2026-05-20T16:00:00Z"),
        installedOdometer: 15000,
        expectedLifeKm: 40000,
        expectedLifeMonths: 24,
      },
      {
        vehicleId: ev.id,
        partType: "tireRotation",
        installedDate: new Date("2025-09-01T00:00:00Z"),
        installedOdometer: 8000,
        expectedLifeKm: 10000,
        expectedLifeMonths: 12,
      },
    ],
  });

  console.log("Creating vehicle badges...");
  await prisma.vehicleBadge.createMany({
    data: [
      { vehicleId: ice.id, badgeKey: "fuel_collector", tier: 2 },
      { vehicleId: ice.id, badgeKey: "maintenance_master", tier: 1 },
      { vehicleId: ice.id, badgeKey: "long_driver", tier: 1 },
      { vehicleId: ev.id, badgeKey: "eco_driver", tier: 2 },
      { vehicleId: ev.id, badgeKey: "log_keeper", tier: 1 },
    ],
  });

  console.log("Creating trips...");
  await prisma.trip.createMany({
    data: [
      {
        vehicleId: ice.id,
        startTime: new Date("2026-08-05T08:30:00Z"),
        endTime: new Date("2026-08-05T09:15:00Z"),
        distanceKm: 24.5,
        avgSpeed: 32.6,
        idleTimeSec: 180,
        notes: "출근길 주행 (강남 ↔ 여의도)",
        routePolyline: "_p~iF~ps|U_ulLnnqC_g*",
      },
      {
        vehicleId: ev.id,
        startTime: new Date("2026-08-04T18:00:00Z"),
        endTime: new Date("2026-08-04T18:40:00Z"),
        distanceKm: 18.2,
        avgSpeed: 27.3,
        idleTimeSec: 120,
        notes: "퇴근길 주행 (판교 ↔ 서초)",
        routePolyline: "_p~iF~ps|U_ulLnnqC_g*",
      },
    ],
  });

  console.log("Syncing reminders...");
  await syncReminders();

  console.log("Demo data seeded successfully!");
}

seedDemoData()
  .catch((e) => {
    console.error("Error seeding demo data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
