import type {
  HyundaiVehicleSummary,
  HyundaiMileage,
  HyundaiVehicleStatus,
  HyundaiDrivingHabit,
} from "@garage/shared";
import { getSetting } from "./settings.js";

// Hyundai Developers(developers.hyundai.com) 커넥티드카 API 클라이언트.
//
// 아래는 전부 실제 콘솔 API 규격서(로그인 후 볼 수 있는 정식 스펙 문서)로 확인된
// 엔드포인트다. 확인 안 된 건 각 함수 주석에 TODO로 명시했다 — 최종 주차 위치,
// 운전습관(90일 안전운전점수), 차량상태 경고등 7종의 정확한 경로.
const ACCOUNT_BASE_URL = "https://prd.kr-ccapi.hyundai.com";
// 계정 API(로그인/토큰/프로필)는 prd., 차량 데이터 API 전부(동의/차량목록/상태 등)는
// dev. — 규격서 문서 전체가 데이터 API를 예외 없이 dev.로 표기하고 있어 환경 구분이
// 아니라 고정된 host임이 확인됐다.
const DATA_BASE_URL = "https://dev.kr-ccapi.hyundai.com";

export type HyundaiTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

async function getClientCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting("HYUNDAI_CLIENT_ID"),
    getSetting("HYUNDAI_CLIENT_SECRET"),
  ]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

// 규격서로 확인된 공통 에러 응답 형식({errCode, errMsg, errId}) — 모든 엔드포인트가
// 4xx에서 이 형식을 쓴다. HTTP status만 찍는 것보다 원인 파악에 훨씬 유용하다.
async function describeError(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { errCode?: string; errMsg?: string; errId?: string };
    if (body.errCode) return `${res.status} ${body.errCode} ${body.errMsg ?? ""}`.trim();
  } catch {
    /* 응답이 JSON이 아니면 status만 남긴다 */
  }
  return String(res.status);
}

export async function isHyundaiConfigured(): Promise<boolean> {
  return (await getClientCredentials()) !== null;
}

// 1) 로그인 인증 요청 — 사용자를 이 URL로 리다이렉트하면 현대 통합계정 로그인 +
// 차량별 접근 권한 동의 후 redirectUri로 ?code=&state= 와 함께 돌아온다.
export async function getAuthorizeUrl(redirectUri: string, state: string): Promise<string | null> {
  const creds = await getClientCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `${ACCOUNT_BASE_URL}/api/v1/user/oauth2/authorize?${params.toString()}`;
}

// 토큰 발급/갱신/삭제는 grant_type만 다른 같은 엔드포인트를 쓴다.
async function callTokenEndpoint(
  creds: { clientId: string; clientSecret: string },
  form: Record<string, string>,
): Promise<HyundaiTokenResponse | null> {
  try {
    const res = await fetch(`${ACCOUNT_BASE_URL}/api/v1/user/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) {
      console.error(`[hyundai] token endpoint failed: ${await describeError(res)}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
      console.error("[hyundai] token endpoint response missing expected fields", data);
      return null;
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (err) {
    console.error("[hyundai] token endpoint call failed", err);
    return null;
  }
}

// 2) 사용자 토큰 발급 — 인가 코드를 액세스/리프레시 토큰으로 교환한다.
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<HyundaiTokenResponse | null> {
  const creds = await getClientCredentials();
  if (!creds) return null;
  return callTokenEndpoint(creds, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

// 사용자 토큰 갱신. 규격서의 redirect_uri 파라미터는 전체 요청 공통 OPTIONAL로만
// 표시돼 있어 갱신에도 필수인지는 명시적이지 않지만, 포함해도 무해하다고 보고 유지.
export async function refreshAccessToken(refreshToken: string, redirectUri: string): Promise<HyundaiTokenResponse | null> {
  const creds = await getClientCredentials();
  if (!creds) return null;
  return callTokenEndpoint(creds, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
}

// 사용자 토큰 삭제(연동 해제 시 호출) — 성공 여부만 반환한다.
export async function revokeAccessToken(accessToken: string): Promise<boolean> {
  const creds = await getClientCredentials();
  if (!creds) return false;

  try {
    const res = await fetch(`${ACCOUNT_BASE_URL}/api/v1/user/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "delete", access_token: accessToken }).toString(),
    });
    if (!res.ok) console.error(`[hyundai] token revoke failed: ${await describeError(res)}`);
    return res.ok;
  } catch (err) {
    console.error("[hyundai] token revoke call failed", err);
    return false;
  }
}

export type HyundaiUserProfile = { id: string; email: string | null; name: string | null };

// 사용자 정보 조회 — 응답 필드는 id(사용자 고유 식별자)/email/name/mobileNum/birthdate/lang/social.
export async function fetchUserProfile(accessToken: string): Promise<HyundaiUserProfile | null> {
  try {
    const res = await fetch(`${ACCOUNT_BASE_URL}/api/v1/user/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`[hyundai] user profile failed: ${await describeError(res)}`);
      return null;
    }
    const data = (await res.json()) as { id?: string; email?: string; name?: string };
    return data.id ? { id: data.id, email: data.email ?? null, name: data.name ?? null } : null;
  } catch (err) {
    console.error("[hyundai] user profile call failed", err);
    return null;
  }
}

// 개인정보 제3자 제공 동의 — 계정 로그인(토큰 발급)과 별개로, 이 동의가 없으면
// 데이터 API 전부가 5005(No Agreement Error)로 실패한다. 응답이 302 리다이렉트라
// 로그인 URL과 같은 패턴(브라우저를 이 URL로 보낸 뒤 redirectUri로 ?userId=&state=
// 받는다) — 다만 문서상 method는 POST + x-www-form-urlencoded로 명시돼 있어
// 실제로는 자동제출 폼으로 열어야 할 수 있다(단순 링크 이동이 아닐 수 있음).
export async function getDataConsentUrl(accessToken: string, state: string): Promise<string> {
  const params = new URLSearchParams({ token: `Bearer ${accessToken}`, state });
  return `${DATA_BASE_URL}/api/v1/car-service/terms/agreement?${params.toString()}`;
}

// 개인정보 제공 철회 통지 — 연동 해제 시 revokeAccessToken과 함께 호출해 동의 상태도 정리한다.
export async function rejectDataConsent(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_BASE_URL}/api/v1/car-service/terms/reject`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) console.error(`[hyundai] data consent reject failed: ${await describeError(res)}`);
    return res.ok;
  } catch (err) {
    console.error("[hyundai] data consent reject call failed", err);
    return false;
  }
}

async function authedGet(path: string, accessToken: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${DATA_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`[hyundai] ${path} failed: ${await describeError(res)}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error(`[hyundai] ${path} call failed`, err);
    return null;
  }
}

// 내 차량 리스트 조회
export async function fetchLinkedVehicles(accessToken: string): Promise<HyundaiVehicleSummary[]> {
  const data = await authedGet("/api/v1/car/profile/carlist", accessToken);
  const cars = data?.cars;
  if (!Array.isArray(cars)) return [];

  return cars
    .filter((car): car is Record<string, unknown> => typeof car === "object" && car !== null && !!car.carId)
    .map((car) => ({
      carId: String(car.carId),
      nickname: car.carNickname ? String(car.carNickname) : null,
      model: car.carName ? String(car.carName) : car.carSellname ? String(car.carSellname) : null,
    }));
}

// 커넥티드 서비스 가입일/무료 서비스 종료일 — subscribeDate/endDate는 YYYYMMDD 문자열.
export type HyundaiContract = { subscribeDate: string; endDate: string | null };
export async function fetchContract(accessToken: string, carId: string): Promise<HyundaiContract | null> {
  const data = await authedGet(`/api/v1/car/profile/${carId}/contract`, accessToken);
  if (!data?.subscribeDate) return null;
  return { subscribeDate: String(data.subscribeDate), endDate: data.endDate ? String(data.endDate) : null };
}

// 거리 값 단위 코드 환산 — 0:feet, 1:km, 2:meter, 3:miles (규격서로 확인됨).
const DISTANCE_TO_KM: Record<number, number> = { 0: 0.0003048, 1: 1, 2: 0.001, 3: 1.609344 };

function distanceToKm(value: unknown, unit: unknown): number | null {
  const num = Number(value);
  const unitCode = Number(unit);
  if (!Number.isFinite(num) || !(unitCode in DISTANCE_TO_KM)) return null;
  return num * DISTANCE_TO_KM[unitCode];
}

// 주행거리 API — dte(주행가능거리)와 odometer(누적주행거리)는 서로 다른 엔드포인트이며
// 응답 형식({value, unit} / {odometers:[{value, unit}]})까지 규격서로 확인됨.
export async function fetchMileage(accessToken: string, carId: string): Promise<HyundaiMileage | null> {
  const [dte, odometer] = await Promise.all([
    authedGet(`/api/v1/car/status/${carId}/dte`, accessToken),
    authedGet(`/api/v1/car/status/${carId}/odometer`, accessToken),
  ]);

  const distanceToEmptyKm = dte ? distanceToKm(dte.value, dte.unit) : null;

  const odometers = odometer?.odometers;
  const odometerRow = Array.isArray(odometers) ? (odometers[0] as Record<string, unknown> | undefined) : undefined;
  const odometerKm = odometerRow ? distanceToKm(odometerRow.value, odometerRow.unit) : null;

  if (distanceToEmptyKm === null && odometerKm === null) return null;
  return { odometerKm: odometerKm ?? 0, distanceToEmptyKm };
}

export type HyundaiEvBattery = { socPercent: number };
export async function fetchEvBattery(accessToken: string, carId: string): Promise<HyundaiEvBattery | null> {
  const data = await authedGet(`/api/v1/car/status/${carId}/ev/battery`, accessToken);
  return typeof data?.soc === "number" ? { socPercent: data.soc } : null;
}

export type HyundaiEvCharging = {
  isCharging: boolean;
  cableConnected: boolean;
  socPercent: number;
  targetSocPercent: number | null;
};
export async function fetchEvCharging(accessToken: string, carId: string): Promise<HyundaiEvCharging | null> {
  const data = await authedGet(`/api/v1/car/status/${carId}/ev/charging`, accessToken);
  if (!data || typeof data.batteryPlugin !== "number" || typeof data.soc !== "number") return null;
  const targetSoc = data.targetSOC as Record<string, unknown> | undefined;
  return {
    isCharging: Boolean(data.batteryCharge),
    cableConnected: data.batteryPlugin > 0,
    socPercent: data.soc,
    targetSocPercent: typeof targetSoc?.targetSOClevel === "number" ? targetSoc.targetSOClevel : null,
  };
}

// 차량상태 — 경고등 7종 엔드포인트/응답 형식 모두 규격서로 확인됨.
// TODO: 최종 주차 위치 엔드포인트는 규격서에 아직 없었다 — 확인되기 전까지 null 고정.
const WARNING_PATHS: Record<string, string> = {
  lowFuel: "lowFuel",
  tirePressure: "tirePressure",
  lampWire: "lampWire",
  smartKeyBattery: "smartKeyBattery",
  washerFluid: "washerFluid",
  brakeFluid: "breakOil", // API 자체의 표기(오타로 보이나 규격서 원문이 이렇다)
  engineOil: "engineOil",
};

export async function fetchVehicleStatus(
  accessToken: string,
  carId: string,
): Promise<HyundaiVehicleStatus | null> {
  const entries = Object.entries(WARNING_PATHS);
  const results = await Promise.all(
    entries.map(([, path]) => authedGet(`/api/v1/car/status/warning/${carId}/${path}`, accessToken)),
  );

  const warnings = entries
    .map(([key], i) => (results[i]?.status === true ? key : null))
    .filter((key): key is string => key !== null);

  return { lastParkedLat: null, lastParkedLon: null, warnings };
}

// TODO: 운전습관(90일 안전운전점수) 엔드포인트 미확인.
export async function fetchDrivingHabit(
  _accessToken: string,
  _carId: string,
): Promise<HyundaiDrivingHabit | null> {
  console.warn("[hyundai] fetchDrivingHabit: endpoint not yet confirmed");
  return null;
}
