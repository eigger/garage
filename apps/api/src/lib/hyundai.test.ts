import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings.js", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key === "HYUNDAI_CLIENT_ID") return "test-client-id";
    if (key === "HYUNDAI_CLIENT_SECRET") return "test-client-secret";
    return null;
  }),
}));

import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  revokeAccessToken,
  fetchUserProfile,
  getDataConsentUrl,
  rejectDataConsent,
  fetchLinkedVehicles,
  fetchContract,
  fetchMileage,
  fetchVehicleStatus,
  fetchEvBattery,
  fetchEvCharging,
} from "./hyundai.js";

type FormRequestInit = { method: string; headers: Record<string, string>; body: string };

// 콘솔 API 가이드로 확인된 실제 엔드포인트·요청 형식과 일치하는지 검증한다.
// (요청 구성만 검증 — 실제 Hyundai 서버로 나가는 호출은 fetch를 스텁해서 막는다.)
describe("hyundai account API request construction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the authorize URL with the confirmed path and params", async () => {
    const url = await getAuthorizeUrl("https://example.com/callback", "state123");
    expect(url).toBe(
      "https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/authorize?response_type=code&client_id=test-client-id&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&state=state123",
    );
  });

  it("exchanges an authorization code with Basic auth and form-encoded body", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: FormRequestInit) => ({
      ok: true,
      json: async () => ({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeCodeForToken("auth-code-1", "https://example.com/callback");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/token");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options.headers["Authorization"]).toBe(
      `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`,
    );
    expect(options.body).toBe("grant_type=authorization_code&code=auth-code-1&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback");

    expect(token).not.toBeNull();
    expect(token?.accessToken).toBe("at-1");
    expect(token?.refreshToken).toBe("rt-1");
    expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshes a token using grant_type=refresh_token", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: FormRequestInit) => ({
      ok: true,
      json: async () => ({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await refreshAccessToken("old-refresh-token", "https://example.com/callback");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe(
      "grant_type=refresh_token&refresh_token=old-refresh-token&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback",
    );
  });

  it("revokes a token using grant_type=delete", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: FormRequestInit) => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await revokeAccessToken("access-token-1");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe("grant_type=delete&access_token=access-token-1");
    expect(result).toBe(true);
  });

  it("returns null when the token endpoint responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400 })));
    const token = await exchangeCodeForToken("bad-code", "https://example.com/callback");
    expect(token).toBeNull();
  });
});

describe("hyundai account API — user profile and data consent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the user profile id field (not userId)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "hyundai-user-1", email: "test@ccsp.com", name: "tester" }),
      })),
    );
    const profile = await fetchUserProfile("access-token-1");
    expect(profile).toEqual({ id: "hyundai-user-1", email: "test@ccsp.com", name: "tester" });
  });

  it("builds the data consent URL with token and state", async () => {
    const url = await getDataConsentUrl("access-token-1", "state123");
    expect(url).toBe(
      "https://dev.kr-ccapi.hyundai.com/api/v1/car-service/terms/agreement?token=Bearer+access-token-1&state=state123",
    );
  });

  it("rejects data consent via the reject endpoint", async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: url.endsWith("/terms/reject") }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await rejectDataConsent("access-token-1");
    expect(result).toBe(true);
  });
});

// 응답 형식은 규격서(Sample Test 페이지)로 확인된 필드 그대로 검증한다.
describe("hyundai data API parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the vehicle list from a carlist response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          cars: [
            { carId: "car-1", carNickname: "내 차", carType: "GN", carName: "그랜저", carSellname: "The Next Grandeur" },
            { carId: "car-2" },
          ],
        }),
      })),
    );

    const vehicles = await fetchLinkedVehicles("access-token-1");
    expect(vehicles).toEqual([
      { carId: "car-1", nickname: "내 차", model: "그랜저" },
      { carId: "car-2", nickname: null, model: null },
    ]);
  });

  it("drops cars with no carId instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ cars: [{ carNickname: "no id" }] }) })));
    const vehicles = await fetchLinkedVehicles("access-token-1");
    expect(vehicles).toEqual([]);
  });

  it("fetches dte and odometer in parallel and converts units to km", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/dte")) {
        return { ok: true, json: async () => ({ value: 42, unit: 1 }) }; // unit 1 = already km
      }
      if (url.endsWith("/odometer")) {
        return { ok: true, json: async () => ({ odometers: [{ value: 12345000, unit: 2 }] }) }; // unit 2 = meters
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const mileage = await fetchMileage("access-token-1", "car-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mileage).toEqual({ odometerKm: 12345, distanceToEmptyKm: 42 });
  });

  it("returns null mileage when both endpoints fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const mileage = await fetchMileage("access-token-1", "car-1");
    expect(mileage).toBeNull();
  });

  it("collects only the warning keys whose endpoint reports status true", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ status: url.endsWith("/lowFuel") || url.endsWith("/breakOil") }),
    })));

    const status = await fetchVehicleStatus("access-token-1", "car-1");
    expect(status?.warnings.sort()).toEqual(["brakeFluid", "lowFuel"]);
    expect(status?.lastParkedLat).toBeNull();
  });

  it("parses the connected-service contract dates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ subscribeDate: "20180711", endDate: "20230710" }) })),
    );
    const contract = await fetchContract("access-token-1", "car-1");
    expect(contract).toEqual({ subscribeDate: "20180711", endDate: "20230710" });
  });

  it("parses EV battery state of charge", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ soc: 100 }) })));
    const battery = await fetchEvBattery("access-token-1", "car-1");
    expect(battery).toEqual({ socPercent: 100 });
  });

  it("parses EV charging status including target SOC", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          batteryPlugin: 1,
          batteryCharge: true,
          soc: 51,
          targetSOC: { plugType: 0, targetSOClevel: 80 },
        }),
      })),
    );
    const charging = await fetchEvCharging("access-token-1", "car-1");
    expect(charging).toEqual({ isCharging: true, cableConnected: true, socPercent: 51, targetSocPercent: 80 });
  });

  it("treats batteryPlugin 0 as cable not connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ batteryPlugin: 0, batteryCharge: false, soc: 80 }) })),
    );
    const charging = await fetchEvCharging("access-token-1", "car-1");
    expect(charging).toEqual({ isCharging: false, cableConnected: false, socPercent: 80, targetSocPercent: null });
  });
});
