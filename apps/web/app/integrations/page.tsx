"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import { SettingsBar } from "../settings-bar";
import type { TranslationKey } from "../../lib/i18n/translations";

type SettingSource = "db" | "env" | "none";
type SettingEntry = {
  key: string;
  configured: boolean;
  source: SettingSource;
  masked: string | null;
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
};

// 공개키/개인키는 한 쌍으로 발급돼야 하므로 개별 텍스트 입력이 아니라 전용 카드에서 처리한다.
const VAPID_KEY_PAIR_KEYS = new Set(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);

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
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user || !isAdmin) return null;

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1>{t("integrationsHeading")}</h1>
      <p>{t("integrationsIntro")}</p>

      <VapidKeyCard settings={settings} onChanged={load} t={t} showToast={showToast} confirm={confirm} />

      {settings
        .filter((entry) => !VAPID_KEY_PAIR_KEYS.has(entry.key))
        .map((entry) => (
          <SettingRow
            key={entry.key}
            entry={entry}
            onChanged={load}
            t={t}
            showToast={showToast}
            confirm={confirm}
          />
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
          <a href={meta.signupUrl} target="_blank" rel="noopener noreferrer">
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
