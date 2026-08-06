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

// 차량 id가 될 수 없는 값이면 무엇이든 되지만, 실수로 차량 경로에 끼어들지 않도록
// 눈에 띄는 이름을 쓴다.
const ALL_VEHICLES_OPTION = "__all__";

export default function VehicleLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, requireAuth } = useAuth();
  const { t } = useSettings();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);

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
    apiFetch(`/api/vehicles/${vehicleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setVehicle);
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
    // 홈은 마지막으로 보던 차량으로 바로 들어가므로, 통합 대시보드로 가는 길은 여기뿐이다.
    // ?all=1이 있어야 홈이 다시 차량으로 되돌리지 않는다.
    if (nextId === ALL_VEHICLES_OPTION) {
      router.push("/?all=1");
      return;
    }
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
              <option value={ALL_VEHICLES_OPTION}>{t("viewAllVehicles")}</option>
            </select>
          )}
        </div>
      )}
      {children}
    </main>
  );
}
