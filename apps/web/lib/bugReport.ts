// 셀프호스트 앱이라 제보자마다 서버/DB가 따로다 — 개발자가 직접 DB를 조회해줄 수 없으므로
// 제보 내용 자체가 유일한 단서다. 그래서 콘솔 에러와 실패한 API 요청을 가볍게 링버퍼에
// 모아뒀다가 제보 시 자동으로 붙여준다. 이 저장소는 공개(public)라서 위치/차량명/이메일 같은
// 개인정보가 될 만한 값은 절대 자동 수집하지 않고, 파일명·상태코드·에러 메시지 같은 기술
// 정보만 담는다. 또한 자동 제출하지 않고 GitHub 이슈 작성 화면을 새 탭으로 열어 제보자가
// 최종 검토 후 직접 제출하게 한다.
const RING_BUFFER_SIZE = 5;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_BODY_LENGTH = 6000;

const BUG_REPORT_REPO = "eigger/garage";

interface CapturedError {
  message: string;
  time: string;
}

interface CapturedRequest {
  method: string;
  path: string;
  status: number;
  time: string;
}

const recentErrors: CapturedError[] = [];
const recentFailedRequests: CapturedRequest[] = [];

function pushRing<T>(arr: T[], item: T): void {
  arr.push(item);
  if (arr.length > RING_BUFFER_SIZE) arr.shift();
}

export function recordError(message: string): void {
  pushRing(recentErrors, { message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH), time: new Date().toISOString() });
}

export function recordFailedRequest(method: string, path: string, status: number): void {
  pushRing(recentFailedRequests, { method, path, status, time: new Date().toISOString() });
}

let captureInitialized = false;

export function initBugReportCapture(): void {
  if (captureInitialized || typeof window === "undefined") return;
  captureInitialized = true;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    recordError(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a))).join(" "));
    originalConsoleError(...args);
  };

  window.addEventListener("error", (e) => {
    recordError(`${e.message} (${e.filename}:${e.lineno})`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    recordError(reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason));
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function buildBugReportUrl(params: { title: string; description: string; pathname: string }): string {
  const { title, description, pathname } = params;
  const lines: string[] = [];
  lines.push(description.trim() || "(설명 없음)");
  lines.push("");
  lines.push("---");
  lines.push(`**앱 버전:** v${process.env.APP_VERSION ?? "unknown"}`);
  lines.push(`**발생 화면:** ${pathname}`);
  lines.push(`**시각:** ${new Date().toISOString()}`);
  lines.push(`**브라우저:** ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`);

  if (recentFailedRequests.length > 0) {
    lines.push("");
    lines.push("**최근 실패한 API 요청:**");
    for (const r of recentFailedRequests) {
      lines.push(`- ${r.time} ${r.method} ${r.path} → ${r.status}`);
    }
  }

  if (recentErrors.length > 0) {
    lines.push("");
    lines.push("**최근 콘솔 에러:**");
    for (const e of recentErrors) {
      lines.push("```");
      lines.push(e.message);
      lines.push("```");
    }
  }

  const body = truncate(lines.join("\n"), MAX_BODY_LENGTH);
  const url = new URL(`https://github.com/${BUG_REPORT_REPO}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}
