import { recordFailedRequest } from "./bugReport";

function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  // 배포(Caddy)에서는 same-origin(/api) 호출이 맞고, 로컬 개발에서는 8080 API를 기본값으로 쓴다.
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost:8080";
}

export const API_URL = resolveApiUrl();

const TOKEN_KEY = "garage_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // FormData(파일 업로드)는 브라우저가 boundary를 포함한 Content-Type을 직접 설정해야 하므로
  // 여기서 강제로 application/json을 지정하면 안 된다.
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  // 버그 제보 시 자동 첨부되는 최근 실패 요청 목록 — 경로/상태코드만 남기고 요청·응답 본문은 담지 않는다.
  if (!res.ok) {
    recordFailedRequest(init.method ?? "GET", path, res.status);
  }
  return res;
}

export interface UploadResult {
  ok: boolean;
  status: number;
  json: () => any;
}

// fetch는 업로드 진행률 이벤트를 제공하지 않아, 진행률 표시가 필요한 파일 업로드는 XHR을 사용한다.
export function uploadFileWithProgress(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => JSON.parse(xhr.responseText || "null"),
      });
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(formData);
  });
}
