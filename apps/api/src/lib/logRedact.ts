// 웹소켓·다운로드처럼 Authorization 헤더를 붙일 수 없는 경로는 `?token=<JWT>` 쿼리 폴백을 쓴다.
// Fastify 기본 로거는 요청 URL을 그대로 남겨 로그 파일에 로그인 토큰이 평문으로 쌓이므로,
// 쿼리의 토큰 값은 마스킹해서 기록한다.
export function redactTokenInUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&](?:token|access_token|apiToken)=)[^&#]*/gi, "$1[redacted]");
}
