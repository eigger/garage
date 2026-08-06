import { describe, it, expect } from "vitest";
import { katecToWgs84 } from "./geo.js";

describe("katecToWgs84 (opinet coord parsing)", () => {
  it("converts known KATEC near Seoul City Hall to WGS84", () => {
    // Seoul City Hall approx KATEC used in opinet samples around Gangnam/city hall band
    const { lat, lon } = katecToWgs84(309986, 552073);
    expect(lat).toBeGreaterThan(37.5);
    expect(lat).toBeLessThan(37.6);
    expect(lon).toBeGreaterThan(126.9);
    expect(lon).toBeLessThan(127.1);
  });
});
