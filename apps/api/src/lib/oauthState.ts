import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthStatePurpose = "link" | "consent";

const STATE_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  return process.env.JWT_SECRET ?? "dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`hyundai-oauth-state:${payload}`).digest("base64url");
}

// 현대 인증 서버를 오가는 `state`. 예전에는 user id를 그대로 써서 누구나 위조할 수 있었다 —
// 공격자가 자기 인가 코드가 담긴 콜백 링크를 피해자에게 열게 하면(CSRF) 피해자 계정에 공격자의
// 블루링크가 연동됐다. 사용자·용도·만료·난수를 HMAC으로 묶어 서버가 발급한 값만 통과시킨다.
// JWT로 만들지 않는 이유: 이 값은 외부 도메인의 URL·히스토리에 남는데, 앱의 로그인 토큰과 같은
// 서명 형식이면 그대로 Bearer 토큰으로 쓰일 수 있다.
export function createOAuthState(userId: string, purpose: OAuthStatePurpose, now = Date.now()): string {
  const payload = [userId, purpose, String(now + STATE_TTL_MS), randomBytes(8).toString("hex")].join(".");
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(
  state: unknown,
  userId: string,
  purpose: OAuthStatePurpose,
  now = Date.now(),
): boolean {
  if (typeof state !== "string") return false;
  const idx = state.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = state.slice(0, idx);
  const given = Buffer.from(state.slice(idx + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  // user id(cuid)에는 '.'이 없으므로 끝에서부터 3개를 떼어 낸다.
  const parts = payload.split(".");
  if (parts.length !== 4) return false;
  const [stateUserId, statePurpose, expiresAt] = parts;
  return stateUserId === userId && statePurpose === purpose && Number(expiresAt) > now;
}
