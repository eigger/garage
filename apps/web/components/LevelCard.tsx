"use client";

import { useState } from "react";
import type { BadgeKey } from "@garage/shared";
import { useSettings } from "../lib/i18n/settings-context";
import { badgeCountToNextTier, badgeDescKey, badgeIcon, badgeMaxTier, badgeNameKey } from "../lib/badges";
import type { VehicleGamification } from "../lib/types";

export function LevelCard({ data }: { data: VehicleGamification }) {
  const { t } = useSettings();
  const [showBadges, setShowBadges] = useState(false);
  const progressPercent =
    data.xpForNextLevel > 0 ? Math.min(100, (data.xpIntoLevel / data.xpForNextLevel) * 100) : 100;
  const earnedByKey = new Map(data.badges.map((b) => [b.key, b]));

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--color-primary)",
            color: "var(--color-text-on-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {data.level}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, gap: 8 }}>
            <strong>
              {t("gamificationLevelLabel")} {data.level}
            </strong>
            <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {t("gamificationXpToNext", { xp: data.xpForNextLevel - data.xpIntoLevel })}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--color-track-bg)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "var(--color-primary)",
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowBadges((v) => !v)}
        style={{
          background: "transparent",
          color: "var(--color-primary)",
          padding: 0,
          minHeight: "auto",
          fontSize: 13,
          marginTop: 10,
        }}
      >
        {t("gamificationBadgesEarned", { count: data.badges.length, total: data.allBadgeKeys.length })}
        {" · "}
        {showBadges ? t("gamificationHideBadges") : t("gamificationViewBadges")}
      </button>

      {showBadges && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 10, marginTop: 10 }}>
          {data.allBadgeKeys.map((key) => {
            const badgeKey = key as BadgeKey;
            const earned = earnedByKey.get(key);
            if (!earned) {
              // 아직 못 딴 뱃지는 이름·설명·아이콘을 전혀 보여주지 않는다 — 깃허브 업적처럼
              // 달성 조건을 미리 알려주지 않고, 획득했을 때만 정체가 드러난다.
              return (
                <div
                  key={key}
                  title={t("badgeLockedDesc")}
                  aria-label={t("badgeLockedDesc")}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: 8,
                    borderRadius: 8,
                    background: "var(--color-surface-secondary)",
                    opacity: 0.5,
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: 24 }}>🔒</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t("badgeLockedName")}</span>
                </div>
              );
            }

            const nextTierGap = badgeCountToNextTier(badgeKey, earned.count);
            const hint =
              nextTierGap !== null
                ? t("badgeCountToNextTier", { count: nextTierGap })
                : t("badgeMaxTier");

            return (
              <div
                key={key}
                title={`${t(badgeDescKey(badgeKey))} · ${hint}`}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: 8,
                  borderRadius: 8,
                  background: "var(--color-surface-secondary)",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--color-primary)",
                  }}
                >
                  x{earned.tier}
                </span>
                <span style={{ fontSize: 24 }}>{badgeIcon(badgeKey)}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t(badgeNameKey(badgeKey))}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-muted-2)" }}>
                  {earned.tier}/{badgeMaxTier(badgeKey)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
