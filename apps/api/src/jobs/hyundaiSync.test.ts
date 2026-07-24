import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/prisma.js";

vi.mock("../lib/hyundai.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/hyundai.js")>();
  return { ...actual, fetchMileage: vi.fn() };
});

const { fetchMileage } = await import("../lib/hyundai.js");
const { syncHyundaiMileage } = await import("./hyundaiSync.js");

// 블루링크 오도미터 동기화 잡 — OBD 웹훅과 동일한 "기존 값보다 클 때만 갱신" 규칙을
// 지키는지, 그리고 링크된 차량 전체를 순회하는지 검증한다.
describe("syncHyundaiMileage", () => {
  let vehicleId: string;
  let userId: string;

  beforeEach(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { name: "Test User", email: `test-hsync-${suffix}@example.com`, passwordHash: "x", role: "GENERAL" },
    });
    userId = user.id;

    const vehicle = await prisma.vehicle.create({
      data: { name: `Test Vehicle ${suffix}`, apiToken: randomUUID(), odometer: 1000 },
    });
    vehicleId = vehicle.id;

    const accountLink = await prisma.hyundaiAccountLink.create({
      data: {
        userId,
        accessToken: "at",
        refreshToken: "rt",
        redirectUri: "https://example.com/callback",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    await prisma.hyundaiVehicleLink.create({
      data: { vehicleId, accountLinkId: accountLink.id, hyundaiCarId: `car-${suffix}` },
    });

    vi.mocked(fetchMileage).mockReset();
  });

  afterEach(async () => {
    await prisma.vehicle.delete({ where: { id: vehicleId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("bumps the vehicle odometer when the fetched value is higher", async () => {
    vi.mocked(fetchMileage).mockResolvedValue({ odometerKm: 1500, distanceToEmptyKm: 300 });

    await syncHyundaiMileage();

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.odometer).toBe(1500);
  });

  it("does not overwrite the odometer when the fetched value is lower (manual entry stays authoritative)", async () => {
    vi.mocked(fetchMileage).mockResolvedValue({ odometerKm: 500, distanceToEmptyKm: 300 });

    await syncHyundaiMileage();

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.odometer).toBe(1000);
  });

  it("leaves the odometer untouched when the data API call fails", async () => {
    vi.mocked(fetchMileage).mockResolvedValue(null);

    await syncHyundaiMileage();

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.odometer).toBe(1000);
  });
});
