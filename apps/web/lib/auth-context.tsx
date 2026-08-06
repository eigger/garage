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
  login: (token: string) => Promise<void>;
  logout: () => void;
  requireAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    const res = await apiFetch("/api/auth/me");
    // 401은 토큰이 만료됐거나(90일) 서버가 세션을 무효화한 경우 — 비밀번호 초기화나
    // 계정 삭제 직후가 여기에 해당한다. 남은 토큰을 지우고 로그인 화면으로 돌린다.
    if (res.status === 401) {
      clearToken();
      setUser(null);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUser(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function login(token: string) {
    setToken(token);
    setLoading(true);
    await fetchMe();
  }

  function logout() {
    clearToken();
    setUser(null);
    router.push("/login");
  }

  function requireAuth() {
    if (!loading && !user) {
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
