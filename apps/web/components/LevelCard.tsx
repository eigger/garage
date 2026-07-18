"use client";

import type { BadgeKey } from "@garage/shared";
import { useSettings } from "../lib/i18n/settings-context";
import { badgeCountToNextTier, badgeDescKey, badgeMaxTier, badgeNameKey } from "../lib/badges";
import type { VehicleGamification } from "../lib/types";

function renderBadgeIcon(key: BadgeKey, size = 24) {
  switch (key) {
    case "maintenance_master":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "on_time_pro":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "detail_master":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14h6" />
          <path d="M9 18h6" />
          <path d="M9 10h6" />
        </svg>
      );
    case "efficiency_king":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
      );
    case "admin_master":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      );
    case "level_milestone":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "trip_explorer":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case "photo_historian":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

// 전용 페이지(/vehicles/[id]/level)에서만 쓰여서 홈 화면처럼 공간을 아낄 필요가
// 없으므로, 예전처럼 접어두지 않고 뱃지 목록을 항상 펼쳐서 보여준다.
export function LevelCard({ data }: { data: VehicleGamification }) {
  const { t, locale } = useSettings();
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

      <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "10px 0 0" }}>
        {t("gamificationBadgesEarned", { count: data.badges.length, total: data.allBadgeKeys.length })}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
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
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--color-surface-secondary)",
                    opacity: 0.5,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "var(--color-track-bg)",
                      border: "2px dashed var(--color-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                    <span style={{ fontSize: 13, fontWeight: "600", color: "var(--color-text-muted)" }}>{t("badgeLockedName")}</span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted-2)", marginTop: 2 }}>{t("badgeLockedDesc")}</span>
                  </div>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--color-surface-secondary)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--color-surface)",
                    border: "2px solid var(--color-border)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {renderBadgeIcon(badgeKey, 24)}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ fontSize: 13, color: "var(--color-text)" }}>{t(badgeNameKey(badgeKey))}</strong>
                    <span style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: "700" }}>
                      x{earned.tier} (Tier {earned.tier}/{badgeMaxTier(badgeKey)})
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{t(badgeDescKey(badgeKey))}</span>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 4 }}>
                    {earned.earnedAt && (
                      <span style={{ fontSize: 10, color: "var(--color-text-muted-2)" }}>
                        {t("badgeEarnedAt", {
                          date: new Date(earned.earnedAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        })}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--color-text-muted-2)", marginLeft: "auto" }}>{hint}</span>
                  </div>
                </div>
              </div>
            );
        })}
      </div>
    </section>
  );
}
