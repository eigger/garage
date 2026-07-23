"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { PageLoader } from "../../../../components/PageLoader";
import { useToast } from "../../../../lib/toast-context";
import { useConfirm } from "../../../../lib/confirm-context";
import type { Vehicle } from "../../../../lib/types";
import { SmartphoneIcon, HomeIcon } from "../../../../components/icons";

export default function VehicleIntegrationPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingToken, setResettingToken] = useState(false);

  async function load() {
    const res = await apiFetch(`/api/vehicles/${vehicleId}`);
    if (res.ok) setVehicle(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCopyToken() {
    if (!vehicle?.apiToken) return;
    try {
      await navigator.clipboard.writeText(vehicle.apiToken);
      showToast(t("copyTokenSuccess"), "success");
    } catch {
      showToast(t("copyTokenError"), "error");
    }
  }

  async function handleResetToken() {
    if (!(await confirm(t("resetTokenConfirm"), { confirmLabel: t("resetToken") }))) return;
    setResettingToken(true);
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/token/reset`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVehicle((prev) => (prev ? { ...prev, apiToken: data.apiToken } : null));
        showToast(t("toastSaved"), "success");
      } else {
        showToast(t("toastError"), "error");
      }
    } catch {
      showToast(t("connectionError"), "error");
    } finally {
      setResettingToken(false);
    }
  }

  if (loading) return <PageLoader />;
  if (!isAdmin || !vehicle) return null;

  return (
    <section className="card">
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{t("obdGpsIntegrationTitle")}</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
        <div style={{ padding: 12, backgroundColor: "var(--code-bg)", borderRadius: 8, border: "1px solid var(--color-border-light)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <strong>{t("apiTokenLabel")}:</strong>
              <code style={{ marginLeft: 8, background: "var(--code-inline-bg)", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>
                {vehicle.apiToken || t("apiTokenNotIssued")}
              </code>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleCopyToken}
                disabled={!vehicle.apiToken}
                style={{ minHeight: "auto", padding: "6px 12px", fontSize: 12, background: "var(--color-surface-secondary)", color: "var(--color-text-on-secondary)" }}
              >
                {t("copyToken")}
              </button>
              <button
                type="button"
                onClick={handleResetToken}
                disabled={resettingToken}
                style={{ minHeight: "auto", padding: "6px 12px", fontSize: 12 }}
              >
                {resettingToken ? t("resetting") : t("resetToken")}
              </button>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-primary)", display: "flex", alignItems: "center", gap: 6 }}>
            <SmartphoneIcon /> Torque Pro 앱 연동 방법
          </h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: "1.6", color: "var(--color-text-secondary)" }}>
            <li>Torque Pro 앱 설정 &gt; <code>Web Queue / OBD Web Server</code> 메뉴로 이동합니다.</li>
            <li><code>Send data to web server</code>를 활성화합니다.</li>
            <li><code>Web Server URL</code> 항목에 아래 주소를 입력합니다:
              <div style={{ background: "var(--code-bg-alt)", padding: 8, borderRadius: 6, margin: "4px 0", wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>
                {typeof window !== "undefined" ? `${window.location.origin}/api/ingest/obd?token=${vehicle.apiToken}` : ""}
              </div>
            </li>
          </ol>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-primary)", display: "flex", alignItems: "center", gap: 6 }}>
            <HomeIcon /> Home Assistant (HA) / 범용 REST API 연동
          </h3>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-text-secondary)" }}>
            아래의 HTTP POST 규격으로 차량 주행 텔레메트리 정보를 실시간으로 인제스트할 수 있습니다:
          </p>
          <div style={{ background: "var(--code-bg-alt)", padding: 8, borderRadius: 6, wordBreak: "break-all", fontFamily: "monospace", fontSize: 12, overflow: "auto", lineHeight: "1.4" }}>
            <strong>POST</strong> {typeof window !== "undefined" ? `${window.location.origin}/api/ingest/telemetry` : ""}<br />
            <strong>Header:</strong> <code>Authorization: Bearer {vehicle.apiToken}</code><br />
            <strong>Body (JSON):</strong>
            <pre style={{ margin: "4px 0 0", color: "var(--code-text)" }}>
{JSON.stringify({
  speed: 65,
  rpm: 2000,
  lat: 37.5665,
  lon: 126.9780,
  fuelLevel: 85,
  odometer: 15234,
  dtcCodes: "P0300",
  inVehicle: true
}, null, 2)}
            </pre>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              모든 필드는 선택 사항입니다 — 보내는 것만 반영됩니다. <code>odometer</code>는 기존 값보다 클 때만 갱신되고, <code>dtcCodes</code>는 진단 코드 문자열입니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
