"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../lib/api";
import { PageLoader } from "../components/PageLoader";
import { useAuth } from "../lib/auth-context";
import { getLastVehicleId } from "../lib/lastVehicle";
import type { Vehicle } from "../lib/types";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <PageLoader />
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { user, loading: authLoading, requireAuth } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const vehiclesRes = await apiFetch("/api/vehicles");
        const payload = vehiclesRes.ok ? await vehiclesRes.json() : [];
        const loadedVehicles = Array.isArray(payload) ? (payload as Vehicle[]) : [];

        // PWA 홈 화면 숏컷("빠른 입력")으로 들어온 경우, 마지막으로 둘러본 차량(없으면 첫 차량)의
        // 빠른 입력 화면으로 바로 이동시킨다.
        if (searchParams.get("shortcut") === "quick-log" && loadedVehicles.length > 0) {
          const lastId = getLastVehicleId();
          const target = loadedVehicles.find((v) => v.id === lastId) ?? loadedVehicles[0];
          router.replace(`/vehicles/${target.id}/quick-log`);
          return;
        }

        if (loadedVehicles.length === 0) {
          router.replace("/vehicles");
          return;
        }

        // 마지막 선택 차량이 있으면 그곳으로, 없으면 목록 첫 차량으로 직행한다.
        // 저장된 id가 권한 없거나 삭제된 차량일 수 있으니 현재 목록 안에서만 찾는다.
        const lastId = getLastVehicleId();
        const target = loadedVehicles.find((v) => v.id === lastId) ?? loadedVehicles[0];
        router.replace(`/vehicles/${target.id}`);
      } catch {
        // 목록 조회 실패 시에도 스피너에 갇히지 않고 차량 관리로 보낸다.
        router.replace("/vehicles");
      }
    }

    load();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || user) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }

  return null;
}
