"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken, clearToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  // 회원가입 직후 관리자 승인을 기다리는 상태. 로그인은 돼 있지만 데이터 API는 전부 403이라
  // 일반 화면을 그리면 안 된다 — layout에서 승인 대기 화면으로 대체한다.
  isPending: boolean;
  // /me를 못 읽은 상태(네트워크 오류·서버 5xx). 토큰은 그대로 두고 재시도 화면을 보여준다 —
  // 로그아웃으로 취급하면 API 재시작 같은 일시 장애에 모든 사용자가 튕긴다.
  loadError: boolean;
  retry: () => void;
  login: (token: string) => Promise<void>;
  logout: () => void;
  requireAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  async function fetchMe() {
    if (!getToken()) {
      setUser(null);
      setLoadError(false);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/api/auth/me");
      // 401은 토큰이 만료됐거나(90일) 서버가 세션을 무효화한 경우 — 비밀번호 초기화나
      // 계정 삭제 직후가 여기에 해당한다. 남은 토큰을 지우고 로그인 화면으로 돌린다.
      if (res.status === 401) {
        clearToken();
        setUser(null);
        setLoadError(false);
        return;
      }
      if (!res.ok) throw new Error(`me ${res.status}`);
      setUser(await res.json());
      setLoadError(false);
    } catch {
      // 네트워크 단절, API 재시작 중 프록시의 HTML 502 등. 로딩 상태에 갇히지 않게 빠져나온다.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function retry() {
    setLoading(true);
    void fetchMe();
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function login(token: string) {
    setToken(token);
    // /me가 실패해도 이전 계정의 user가 남아 새 토큰과 UI가 어긋나지 않게 먼저 비운다.
    setUser(null);
    setLoading(true);
    await fetchMe();
  }

  function logout() {
    clearToken();
    setUser(null);
    setLoadError(false);
    router.push("/login");
  }

  function requireAuth() {
    if (!loading && !user && !loadError) {
      router.push("/login");
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "ADMIN" && user?.status === "ACTIVE",
        isPending: user?.status === "PENDING",
        loadError,
        retry,
        login,
        logout,
        requireAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
