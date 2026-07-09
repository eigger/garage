"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../lib/i18n/settings-context";
import { useToast } from "../lib/toast-context";
import type { TranslationKey } from "../lib/i18n/translations";
import {
  getPushConfig,
  getPushStatus,
  isPushSupported,
  registerPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push";

export function PushNotificationSettings() {
  const { t, locale } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setLoading(false);
      return;
    }
    setPermission(Notification.permission);

    Promise.all([getPushConfig(), getPushStatus()])
      .then(([config, status]) => {
        setConfigured(config.configured);
        setSubscribed(status.subscribed);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleEnable() {
    if (!configured) return;
    setBusy(true);
    try {
      const config = await getPushConfig();
      if (!config.publicKey) {
        showToast(t("pushNotConfigured"), "error");
        return;
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        showToast(t("pushPermissionDenied"), "error");
        return;
      }

      const subscription = await subscribeToPush(config.publicKey);
      await registerPushSubscription(subscription, locale);
      setSubscribed(true);
      showToast(t("pushEnabled"), "success");
    } catch {
      showToast(t("toastError"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      showToast(t("pushDisabled"), "success");
    } catch {
      showToast(t("toastError"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (!isPushSupported()) {
    return (
      <PushSection title={t("pushHeading")} help={t("pushUnsupported")}>
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>{t("pushUnsupported")}</p>
      </PushSection>
    );
  }

  let statusKey: TranslationKey = "pushStatusOff";
  if (!configured) statusKey = "pushNotConfigured";
  else if (permission === "denied") statusKey = "pushPermissionDenied";
  else if (subscribed) statusKey = "pushStatusOn";

  return (
    <PushSection title={t("pushHeading")} help={t("pushHelp")}>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>{t(statusKey)}</p>
      {configured && permission !== "denied" && (
        <div style={{ display: "flex", gap: 8 }}>
          {!subscribed ? (
            <button type="button" onClick={handleEnable} disabled={busy}>
              {busy ? t("saving") : t("pushEnableButton")}
            </button>
          ) : (
            <button type="button" onClick={handleDisable} disabled={busy}>
              {busy ? t("saving") : t("pushDisableButton")}
            </button>
          )}
        </div>
      )}
    </PushSection>
  );
}

function PushSection({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{title}</h3>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>{help}</p>
      {children}
    </section>
  );
}
