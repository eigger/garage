import { describe, it, expect } from "vitest";
import { haversineKm, encodeRoute } from "./geo.js";

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
