import { recordFailedRequest } from "./bugReport";
import { BASE_PATH } from "./base-path";

function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  // 배포(Caddy)에서는 same-origin(/api) 호출이 맞고, 로컬 개발에서는 8080 API를 기본값으로 쓴다.
  // 서브패스 배포에서는 오리진 뒤에 프리픽스까지 붙여야 프록시가 API로 넘겨준다.
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${BASE_PATH}`;
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

// 기록은 이미 저장된 뒤에 붙이는 첨부 업로드용. 실패(HTTP 오류·네트워크 단절)해도 throw하지 않고
// false를 돌려줘서, 호출부가 "기록은 저장됐지만 첨부는 실패"를 알리고 폼을 정상적으로 정리할 수 있다
// (throw되면 폼이 그대로 남아 사용자가 다시 제출하다 같은 기록이 중복 생성된다).
export async function uploadAttachment(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await uploadFileWithProgress(path, formData, onProgress);
    return res.ok;
  } catch {
    return false;
  }
}
