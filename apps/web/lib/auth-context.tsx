"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken, clearToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
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
      value={{ user, loading, isAdmin: user?.role === "ADMIN", login, logout, requireAuth }}
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
