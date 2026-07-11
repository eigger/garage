"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { SettingsBar } from "../settings-bar";
import { TerminalIcon } from "../../components/icons";
import type { Vehicle } from "../../lib/types";

type Result = { status: number; ms: number; body: unknown } | { error: string };

type TokenEndpoint = { key: string; path: string; desc: string };
type JwtEndpoint = { key: string; path: string | null; desc: string };
type ReferenceEndpoint = { method: string; path: string; desc: string; curl: string };

const TOKEN_ENDPOINTS: TokenEndpoint[] = [
  { key: "status", path: "/api/ingest/status", desc: "차량 현재 상태 (주행거리 · 연료/배터리 · 위치)" },
  { key: "reminders", path: "/api/ingest/reminders", desc: "기한 지남/임박 정비 항목" },
];

const REFERENCE_ENDPOINTS: ReferenceEndpoint[] = [
  {
    method: "GET",
    path: "/api/ingest/obd",
    desc: "OBD 앱(Torque Pro) 텔레메트리 업로드 — 실제 주행 데이터가 생성됩니다",
    curl: `curl "${API_URL}/api/ingest/obd?token=YOUR_TOKEN&speed=60&lat=37.5665&lon=126.978"`,
  },
  {
    method: "POST",
    path: "/api/ingest/telemetry",
    desc: "HA/범용 텔레메트리 업로드 — 실제 주행 데이터가 생성됩니다",
    curl: `curl -X POST "${API_URL}/api/ingest/telemetry" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"speed":60,"lat":37.5665,"lon":126.978}'`,
  },
  {
    method: "POST",
    path: "/api/ingest/fuel-logs",
    desc: "주유 기록 생성 — 실제 기록이 저장됩니다",
    curl: `curl -X POST "${API_URL}/api/ingest/fuel-logs" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"date":"2024-01-01","odometer":10000,"liters":40,"cost":70000}'`,
  },
  {
    method: "POST",
    path: "/api/ingest/maintenance-records",
    desc: "정비 기록 생성 — 실제 기록이 저장됩니다",
    curl: `curl -X POST "${API_URL}/api/ingest/maintenance-records" -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"date":"2024-01-01","odometer":10000,"type":"엔진오일 교체"}'`,
  },
];

export default function ApiExplorerPage() {
  const { user, isAdmin, loading: authLoading, requireAuth } = useAuth();
  const { t } = useSettings();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !isAdmin) return;
    apiFetch("/api/vehicles")
      .then((res) => (res.ok ? res.json() : []))
      .then((vs: Vehicle[]) => {
        setVehicles(vs);
        if (vs.length > 0) setVehicleId(vs[0].id);
      });
  }, [user, isAdmin]);

  const apiToken = vehicles.find((v) => v.id === vehicleId)?.apiToken ?? null;

  async function runTokenTest(key: string, path: string) {
    if (!apiToken) return;
    setLoadingKey(key);
    const start = performance.now();
    try {
      const res = await fetch(`${API_URL}${path}?token=${encodeURIComponent(apiToken)}`);
      const body = await res.json().catch(() => null);
      setResults((prev) => ({ ...prev, [key]: { status: res.status, body, ms: Math.round(performance.now() - start) } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { error: String(err) } }));
    } finally {
      setLoadingKey(null);
    }
  }

  async function runJwtTest(key: string, path: string) {
    setLoadingKey(key);
    const start = performance.now();
    try {
      const res = await apiFetch(path);
      const body = await res.json().catch(() => null);
      setResults((prev) => ({ ...prev, [key]: { status: res.status, body, ms: Math.round(performance.now() - start) } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { error: String(err) } }));
    } finally {
      setLoadingKey(null);
    }
  }

  if (authLoading) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user || !isAdmin) return null;

  const jwtEndpoints: JwtEndpoint[] = [
    { key: "vehicles", path: "/api/vehicles", desc: "차량 목록" },
    { key: "vehicle-detail", path: vehicleId ? `/api/vehicles/${vehicleId}` : null, desc: "선택한 차량 상세 (연료/위치 포함)" },
    { key: "odometer", path: vehicleId ? `/api/vehicles/${vehicleId}/odometer` : null, desc: "선택한 차량 주행거리" },
    { key: "fuel-logs", path: vehicleId ? `/api/vehicles/${vehicleId}/fuel-logs?limit=5` : null, desc: "최근 주유 기록 5건" },
    { key: "maintenance-records", path: vehicleId ? `/api/vehicles/${vehicleId}/maintenance-records?limit=5` : null, desc: "최근 정비 내역 5건" },
    { key: "consumable-parts", path: vehicleId ? `/api/consumable-parts?vehicleId=${vehicleId}` : null, desc: "정비 스케줄 항목" },
    { key: "reminders-all", path: "/api/reminders", desc: "전체 차량 리마인더 (지남/임박 여부 포함)" },
    { key: "trips", path: vehicleId ? `/api/trips?vehicleId=${vehicleId}&limit=5` : null, desc: "최근 트립 5건" },
    { key: "trips-summary", path: vehicleId ? `/api/trips/summary?vehicleId=${vehicleId}&period=week` : null, desc: "주간 주행 리포트" },
    { key: "me", path: "/api/auth/me", desc: "내 계정 정보" },
    { key: "opinet-configured", path: "/api/opinet/configured", desc: "오피넷 연동 여부" },
    { key: "map-providers", path: "/api/map/providers", desc: "사용 가능한 지도 제공자" },
    { key: "push-config", path: "/api/push/config", desc: "푸시 알림 서버 설정 여부" },
    { key: "settings", path: "/api/settings", desc: "연동 키 목록 (마스킹됨)" },
    { key: "maintenance-presets", path: "/api/maintenance-presets", desc: "전역 정비 프리셋" },
  ];

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TerminalIcon /> API 탐색기
      </h1>
      <p style={{ color: "var(--color-text-secondary)" }}>
        Garage가 제공하는 REST API를 직접 호출해서 응답을 확인할 수 있습니다. 데이터를 생성/수정하는
        요청은 실수로 실행되지 않도록 curl 예시만 보여주고 직접 실행되지 않습니다.
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        <strong>테스트할 차량</strong>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          style={{ width: "100%", marginTop: 8 }}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} {v.plate ? `(${v.plate})` : ""}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
          apiToken:{" "}
          <code style={{ background: "var(--code-inline-bg)", padding: "2px 6px", borderRadius: 4 }}>
            {apiToken ?? "없음"}
          </code>
        </p>
      </section>

      <h2 style={{ marginTop: 24 }}>차량 apiToken 기반 (외부 연동)</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
        Home Assistant 등 외부 서비스가 사람 로그인 없이 이 차량의 토큰만으로 호출하는 API입니다.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TOKEN_ENDPOINTS.map((ep) => (
          <EndpointRow
            key={ep.key}
            method="GET"
            path={ep.path}
            desc={ep.desc}
            disabled={!apiToken}
            loading={loadingKey === ep.key}
            result={results[ep.key]}
            onRun={() => runTokenTest(ep.key, ep.path)}
          />
        ))}
      </div>

      <h2 style={{ marginTop: 24 }}>로그인 세션 API (JWT)</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
        지금 로그인한 관리자 세션으로 호출합니다. 차량이 필요한 항목은 위에서 고른 차량을 씁니다.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jwtEndpoints.map((ep) => (
          <EndpointRow
            key={ep.key}
            method="GET"
            path={ep.path ?? "-"}
            desc={ep.desc}
            disabled={!ep.path}
            loading={loadingKey === ep.key}
            result={results[ep.key]}
            onRun={() => ep.path && runJwtTest(ep.key, ep.path)}
          />
        ))}
      </div>

      <h2 style={{ marginTop: 24 }}>참고용 (데이터를 생성/수정하는 요청)</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
        아래는 실행 버튼이 없습니다 — 실제 기록이 만들어지므로, 터미널에서 직접 curl로 확인해보세요.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {REFERENCE_ENDPOINTS.map((ep) => (
          <section key={ep.path + ep.method} className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--badge-amber-bg)",
                  color: "var(--badge-amber-text)",
                }}
              >
                {ep.method}
              </span>
              <code style={{ fontSize: 13 }}>{ep.path}</code>
            </div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "6px 0" }}>{ep.desc}</p>
            <pre
              style={{
                margin: 0,
                padding: 8,
                background: "var(--code-bg-alt)",
                color: "var(--code-text)",
                borderRadius: 6,
                fontSize: 11,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {ep.curl}
            </pre>
          </section>
        ))}
      </div>
    </main>
  );
}

function EndpointRow({
  method,
  path,
  desc,
  disabled,
  loading,
  result,
  onRun,
}: {
  method: string;
  path: string;
  desc: string;
  disabled?: boolean;
  loading: boolean;
  result?: Result;
  onRun: () => void;
}) {
  const isError = result && ("error" in result || result.status >= 400);
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--badge-green-bg)",
              color: "var(--badge-green-text)",
              flexShrink: 0,
            }}
          >
            {method}
          </span>
          <code style={{ fontSize: 13, wordBreak: "break-all" }}>{path}</code>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={disabled || loading}
          style={{ flexShrink: 0, width: "auto", padding: "0 14px", minHeight: 32, height: 32, fontSize: 12 }}
        >
          {loading ? "요청 중..." : "테스트"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>{desc}</p>
      {result && (
        <div style={{ marginTop: 8 }}>
          {"error" in result ? (
            <p style={{ fontSize: 12, color: "var(--color-danger)", margin: 0 }}>{result.error}</p>
          ) : (
            <>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isError ? "var(--color-danger)" : "var(--color-success)",
                  margin: "0 0 4px",
                }}
              >
                {result.status} · {result.ms}ms
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  background: "var(--code-bg-alt)",
                  color: "var(--code-text)",
                  borderRadius: 6,
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 260,
                }}
              >
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
