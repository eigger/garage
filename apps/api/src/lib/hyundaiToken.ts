import { prisma } from "./prisma.js";
import { refreshAccessToken } from "./hyundai.js";

type HyundaiAccountLinkRow = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  redirectUri: string;
  expiresAt: Date;
};

// 액세스 토큰이 곧 만료되거나 이미 만료됐으면 리프레시 토큰으로 갱신하고 DB에 반영한다.
// 라우트(요청 처리)와 배치 잡(주기 동기화) 양쪽에서 재사용하는 공용 로직이라 여기 둔다.
// 정확한 만료 임박 기준(여유 시간)은 실제 토큰 수명 확인 후 조정.
export async function getValidAccessTokenFor(accountLink: HyundaiAccountLinkRow): Promise<string | null> {
  if (accountLink.expiresAt.getTime() > Date.now() + 60_000) {
    return accountLink.accessToken;
  }

  const refreshed = await refreshAccessToken(accountLink.refreshToken, accountLink.redirectUri);
  if (!refreshed) return null;

  await prisma.hyundaiAccountLink.update({
    where: { id: accountLink.id },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

// 로그인한 사용자 본인 계정의 토큰(연동 시작 직후 등 아직 차량에 안 묶인 경우)
export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const link = await prisma.hyundaiAccountLink.findUnique({ where: { userId } });
  if (!link) return null;
  return getValidAccessTokenFor(link);
}

// 차량에 연동된 accountLinkId 기준으로 토큰을 가져온다 — 조회 요청자가 아니라
// "그 차량을 연동한 사람"의 계정이 기준이다.
export async function getValidAccessTokenForVehicleLink(accountLinkId: string): Promise<string | null> {
  const accountLink = await prisma.hyundaiAccountLink.findUnique({ where: { id: accountLinkId } });
  if (!accountLink) return null;
  return getValidAccessTokenFor(accountLink);
}
