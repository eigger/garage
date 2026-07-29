import { describe, it, expect } from "vitest";
import { haversineKm, encodeRoute, simplifyRouteForDisplay } from "./geo.js";

describe("haversineKm", () => {
  it("should return 0 for the same coordinates", () => {
    const lat = 37.5665;
    const lon = 126.978;
    const distance = haversineKm(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });

  it("should calculate correct distance between Seoul and Busan", () => {
    // Seoul Coordinates: 37.5665° N, 126.9780° E
    // Busan Coordinates: 35.1796° N, 129.0756° E
    const seoulLat = 37.5665;
    const seoulLon = 126.978;
    const busanLat = 35.1796;
    const busanLon = 129.0756;

    const distance = haversineKm(seoulLat, seoulLon, busanLat, busanLon);

    // Seoul to Busan is roughly 325 km
    expect(distance).toBeGreaterThan(320);
    expect(distance).toBeLessThan(330);
  });
});

describe("encodeRoute", () => {
  it("should encode coordinates to polyline string", () => {
    const points = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    const encoded = encodeRoute(points);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(5);
  });

  it("should return empty string for empty coordinates", () => {
    const encoded = encodeRoute([]);
    expect(encoded).toBe("");
  });
});

describe("simplifyRouteForDisplay", () => {
  it("leaves short trips (below the point threshold) completely untouched", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      lat: 37.5 + i * 0.001,
      lon: 127.0,
      speed: 40,
    }));
    const result = simplifyRouteForDisplay(points);
    expect(result).toEqual(points);
  });

  it("collapses a long, perfectly straight leg down to just its endpoints", () => {
    // 정체 없이 곧게 뻗은 도로를 10초 간격으로 오래 달린 상황을 흉내낸다 — 위도만
    // 일정하게 증가하고 경도는 고정이라 중간 포인트는 전부 직선 위에 있다.
    const points = Array.from({ length: 600 }, (_, i) => ({
      lat: 37.0 + i * 0.0001,
      lon: 127.0,
      speed: 80,
    }));
    const result = simplifyRouteForDisplay(points);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it("keeps a real turn even when both legs are simplified down", () => {
    // 300개는 북쪽으로, 300개는 (꺾은 뒤) 동쪽으로 — 꺾이는 지점(코너)은 직선 단순화로
    // 절대 지워지면 안 된다.
    const northLeg = Array.from({ length: 300 }, (_, i) => ({
      lat: 37.0 + i * 0.0001,
      lon: 127.0,
      speed: 60,
    }));
    const corner = northLeg[northLeg.length - 1];
    const eastLeg = Array.from({ length: 300 }, (_, i) => ({
      lat: corner.lat,
      lon: 127.0 + i * 0.0001,
      speed: 60,
    }));
    const points = [...northLeg, ...eastLeg.slice(1)];

    const result = simplifyRouteForDisplay(points);

    expect(result.length).toBeLessThan(10);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
    expect(result).toContainEqual(corner);
  });

  it("collapses identical points (idling in traffic) down to just the endpoints", () => {
    const points = Array.from({ length: 600 }, () => ({ lat: 37.5, lon: 127.0, speed: 0 }));
    const result = simplifyRouteForDisplay(points);
    expect(result.length).toBe(2);
  });

  it("respects a custom minPointsToSimplify threshold", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      lat: 37.0 + i * 0.0001,
      lon: 127.0,
      speed: 50,
    }));
    // 기본 임계값(500)보다 낮게 잡으면 20개짜리 직선 경로도 단순화 대상이 된다.
    const result = simplifyRouteForDisplay(points, { minPointsToSimplify: 10 });
    expect(result.length).toBe(2);
  });
});
