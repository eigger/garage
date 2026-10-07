"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useSettings } from "../../../lib/i18n/settings-context";
import { PageLoader } from "../../../components/PageLoader";
import { fuelTypeLabelKey } from "../../../lib/fuelType";
import { setLastVehicleId } from "../../../lib/lastVehicle";
import type { Vehicle } from "../../../lib/types";

export default function VehicleLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, requireAuth } = useAuth();
  const { t } = useSettings();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  // 403/404면 이 차량은 없거나(삭제) 볼 권한이 없다(공유 해제). 이때는 자식 화면을 그리지 않는다 —
  // 그리면 0원짜리 카드와 입력 폼이 정상처럼 보이고, 제출해서야 일반 오류가 뜬다.
  // 네트워크/5xx 같은 일시 오류는 차량 접근 불가로 단정할 수 없어 기존처럼 자식을 그대로 둔다.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // PWA 홈 화면 숏컷("빠른 입력")이 어느 차량으로 이동할지 알 수 있도록 마지막으로
  // 둘러본 차량을 기억해둔다.
  useEffect(() => {
    if (vehicleId) setLastVehicleId(vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setUnavailable(false);
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 403 || res.status === 404) {
          setUnavailable(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!cancelled) setVehicle(data ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, vehicleId]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/vehicles")
      .then((res) => (res.ok ? res.json() : []))
      .then(setAllVehicles);
  }, [user]);

  const basePath = `/vehicles/${vehicleId}`;

  function handleSwitchVehicle(nextId: string) {
    if (!nextId || nextId === vehicleId) return;
    const suffix = pathname?.startsWith(basePath) ? pathname.slice(basePath.length) : "";
    router.push(`/vehicles/${nextId}${suffix}`);
  }

  if (authLoading) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }
  if (!user) return null;

  if (unavailable) {
    return (
      <main className="container">
        <h1>{t("vehicleUnavailableTitle")}</h1>
        <p>{t("vehicleUnavailableBody")}</p>
        <Link href="/vehicles">
          <button type="button">{t("backToVehicleList")}</button>
        </Link>
      </main>
    );
  }

  return (
    <main className="container">
      {vehicle && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, width: "100%" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(18px, 4.5vw, 24px)", wordBreak: "break-all", flex: "1 1 0%", minWidth: 0 }}>
            <Link href={basePath} style={{ color: "inherit", textDecoration: "none" }}>
              {vehicle.name} {vehicle.plate ? `(${vehicle.plate})` : ""}
              {vehicle.fuelType ? ` · ${t(fuelTypeLabelKey(vehicle.fuelType))}` : ""}
            </Link>
          </h1>
          {allVehicles.length > 1 && (
            <select
              value={vehicleId}
              onChange={(e) => handleSwitchVehicle(e.target.value)}
              aria-label={t("switchVehicle")}
              style={{ height: 36, minHeight: 36, fontSize: 13, padding: "0 28px 0 8px", flexShrink: 0 }}
            >
              {allVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {children}
    </main>
  );
}
