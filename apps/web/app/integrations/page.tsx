"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { PageLoader } from "../../components/PageLoader";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import type { TranslationKey } from "../../lib/i18n/translations";

type SettingSource = "db" | "env" | "none";
type SettingEntry = {
  key: string;
  configured: boolean;
  source: SettingSource;
  masked: string | null;
  value?: string;
};

// 새 연동을 추가할 때는 백엔드 settingKeySchema와 여기 라벨/설명/발급 URL 매핑만 늘리면 된다.
const SETTING_META: Record<
  string,
  { labelKey: TranslationKey; helpKey: TranslationKey; signupUrl?: string; signupLabelKey?: TranslationKey }
> = {
  OPINET_API_KEY: {
    labelKey: "opinetApiKeyLabel",
    helpKey: "opinetApiKeyHelp",
    signupUrl: "https://www.opinet.co.kr/user/custapi/custApiInfo.do",
    signupLabelKey: "integrationLinkOpinet",
  },
  EV_CHARGER_API_KEY: {
    labelKey: "evChargerApiKeyLabel",
    helpKey: "evChargerApiKeyHelp",
    signupUrl: "https://www.data.go.kr/data/15076352/openapi.do",
    signupLabelKey: "integrationLinkEvCharger",
  },
  KAKAO_MAP_APP_KEY: {
    labelKey: "kakaoMapAppKeyLabel",
    helpKey: "kakaoMapAppKeyHelp",
    signupUrl: "https://developers.kakao.com/console/app",
    signupLabelKey: "integrationLinkKakao",
  },
  NAVER_MAP_CLIENT_ID: {
    labelKey: "naverMapClientIdLabel",
    helpKey: "naverMapClientIdHelp",
    signupUrl: "https://console.ncloud.com/maps/application",
    signupLabelKey: "integrationLinkNaver",
  },
  TMAP_APP_KEY: {
    labelKey: "tmapMapAppKeyLabel",
    helpKey: "tmapMapAppKeyHelp",
    signupUrl: "https://openapi.sk.com/",
    signupLabelKey: "integrationLinkTmap",
  },
  VAPID_SUBJECT: {
    labelKey: "vapidSubjectLabel",
    helpKey: "vapidSubjectHelp",
  },
  HYUNDAI_CLIENT_ID: {
    labelKey: "hyundaiClientIdLabel",
    helpKey: "hyundaiClientIdHelp",
    signupUrl: "https://developers.hyundai.com",
    signupLabelKey: "integrationLinkHyundai",
  },
  HYUNDAI_CLIENT_SECRET: {
    labelKey: "hyundaiClientSecretLabel",
    helpKey: "hyundaiClientSecretHelp",
  },
};

// 오피넷/EV충전소는 "연료·충전", 지도 3종은 "지도", VAPID 쌍+발신자는 "알림"으로 묶어
// 연동 성격이 비슷한 것끼리 섹션을 나눈다. 새 연동을 추가할 때는 해당하는 그룹의 keys에만 추가하면 된다.
const GROUPS: { key: string; titleKey: TranslationKey; keys: string[] }[] = [
  { key: "fuel", titleKey: "integrationGroupFuel", keys: ["OPINET_API_KEY", "EV_CHARGER_API_KEY", "EV_CHARGER_API_KEY_EXPIRES_AT"] },
  { key: "map", titleKey: "integrationGroupMap", keys: ["KAKAO_MAP_APP_KEY", "NAVER_MAP_CLIENT_ID", "TMAP_APP_KEY"] },
  { key: "connectedCar", titleKey: "integrationGroupConnectedCar", keys: ["HYUNDAI_CLIENT_ID", "HYUNDAI_CLIENT_SECRET"] },
  { key: "notification", titleKey: "integrationGroupNotification", keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && user && !isAdmin) router.replace("/");
  }, [authLoading, user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const res = await apiFetch("/api/settings");
    if (res.ok) setSettings(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (user && isAdmin) load();
  }, [user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || (user && isAdmin && loading)) {
    return (
      <main className="container">
        <PageLoader />
      </main>
    );
  }
  if (!user || !isAdmin) return null;

  return (
    <main className="container">
      <h1>{t("integrationsHeading")}</h1>
      <p>{t("integrationsIntro")}</p>

      {GROUPS.map((group) => (
        <section key={group.key} style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", margin: 0 }}>
            {t(group.titleKey)}
          </h2>
          {group.keys.map((key) => {
            if (key === "VAPID_PRIVATE_KEY") return null; // VAPID_PUBLIC_KEY 카드가 쌍을 함께 처리
            if (key === "VAPID_PUBLIC_KEY") {
              return <VapidKeyCard key={key} settings={settings} onChanged={load} t={t} showToast={showToast} confirm={confirm} />;
            }
            if (key === "EV_CHARGER_API_KEY_EXPIRES_AT") {
              return <EvChargerExpiryCard key={key} settings={settings} onChanged={load} t={t} showToast={showToast} />;
            }
            const entry = settings.find((e) => e.key === key);
            if (!entry) return null;
            return <SettingRow key={key} entry={entry} onChanged={load} t={t} showToast={showToast} confirm={confirm} />;
          })}
        </section>
      ))}
    </main>
  );
}

function VapidKeyCard({
  settings,
  onChanged,
  t,
  showToast,
  confirm,
}: {
  settings: SettingEntry[];
  onChanged: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const [generating, setGenerating] = useState(false);
  const publicKeyEntry = settings.find((entry) => entry.key === "VAPID_PUBLIC_KEY");
  const configured = publicKeyEntry?.configured ?? false;

  async function handleGenerate() {
    if (configured && !(await confirm(t("vapidRegenerateConfirm")))) return;
    setGenerating(true);
    try {
      const res = await apiFetch("/api/push/vapid/generate", { method: "POST" });
      if (res.ok) {
        showToast(t("vapidGenerated"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <strong>{t("vapidHeading")}</strong>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 8px" }}>{t("vapidHelp")}</p>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: configured ? "var(--color-success)" : "var(--color-danger)",
          margin: "0 0 12px",
        }}
      >
        {configured ? t("vapidConfigured") : t("vapidNotConfigured")}
      </p>
      <button type="button" onClick={handleGenerate} disabled={generating} style={{ width: "auto", padding: "0 16px" }}>
        {generating ? t("vapidGenerating") : configured ? t("vapidRegenerateButton") : t("vapidGenerateButton")}
      </button>
    </section>
  );
}

function EvChargerExpiryCard({
  settings,
  onChanged,
  t,
  showToast,
}: {
  settings: SettingEntry[];
  onChanged: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const entry = settings.find((e) => e.key === "EV_CHARGER_API_KEY_EXPIRES_AT");
  const [date, setDate] = useState(entry?.value ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDate(entry?.value ?? "");
  }, [entry?.value]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/settings/EV_CHARGER_API_KEY_EXPIRES_AT", {
        method: "PUT",
        body: JSON.stringify({ value: date }),
      });
      if (res.ok) {
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  let statusText = t("evChargerKeyExpiresNotSet");
  let statusColor = "var(--color-text-muted)";
  if (entry?.value) {
    const daysRemaining = Math.ceil((new Date(entry.value).getTime() - Date.now()) / 86400000);
    if (daysRemaining < 0) {
      statusText = t("evChargerKeyExpired");
      statusColor = "var(--color-danger)";
    } else if (daysRemaining <= 30) {
      statusText = t("evChargerKeyExpiringSoon", { days: daysRemaining });
      statusColor = "var(--color-danger)";
    } else {
      statusText = t("evChargerKeyExpiresOk", { days: daysRemaining });
      statusColor = "var(--color-success)";
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <strong>{t("evChargerApiKeyExpiresLabel")}</strong>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 8px" }}>
        {t("evChargerApiKeyExpiresHelp")}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, color: statusColor, margin: "0 0 12px" }}>{statusText}</p>
      <form onSubmit={handleSave} className="form" noValidate style={{ flexDirection: "row" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" disabled={submitting || !date} style={{ flexShrink: 0, width: "auto", padding: "0 16px" }}>
          {submitting ? t("saving") : t("save")}
        </button>
      </form>
    </section>
  );
}

function SettingRow({
  entry,
  onChanged,
  t,
  showToast,
  confirm,
}: {
  entry: SettingEntry;
  onChanged: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const meta = SETTING_META[entry.key];
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/settings/${entry.key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        setValue("");
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    if (!(await confirm(t("settingClearConfirm"), { confirmLabel: t("settingClear") }))) return;
    const res = await apiFetch(`/api/settings/${entry.key}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      onChanged();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  const statusText =
    entry.source === "db"
      ? t("settingConfiguredDb", { masked: entry.masked ?? "" })
      : entry.source === "env"
        ? t("settingConfiguredEnv", { masked: entry.masked ?? "" })
        : t("settingNotConfigured");

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <strong>{meta ? t(meta.labelKey) : entry.key}</strong>
      {meta && <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 8px" }}>{t(meta.helpKey)}</p>}
      {meta?.signupUrl && meta.signupLabelKey && (
        <p style={{ fontSize: 13, margin: "0 0 8px" }}>
          <a
            href={meta.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-primary)", textDecoration: "underline" }}
          >
            {t(meta.signupLabelKey)}
          </a>
        </p>
      )}
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: entry.configured ? "var(--color-success)" : "var(--color-danger)",
          margin: "0 0 12px",
        }}
      >
        {statusText}
      </p>
      <form onSubmit={handleSave} className="form" noValidate style={{ flexDirection: "row" }}>
        <input
          type="password"
          placeholder={t("settingValuePlaceholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={submitting || !value.trim()} style={{ flexShrink: 0, width: "auto", padding: "0 16px" }}>
          {submitting ? t("saving") : t("save")}
        </button>
        {entry.source === "db" && (
          <button
            type="button"
            onClick={handleClear}
            style={{ flexShrink: 0, width: "auto", padding: "0 16px", background: "var(--color-danger)", color: "#fff" }}
          >
            {t("settingClear")}
          </button>
        )}
      </form>
    </section>
  );
}
