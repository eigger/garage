"use client";

import { buildNavUrl, type NavDestination, type NavProvider } from "../lib/navigation/deepLinks";

type NavLaunchButtonsProps = {
  destination: NavDestination;
  labels: Record<NavProvider, string>;
  heading?: string;
  compact?: boolean;
};

const PROVIDERS: NavProvider[] = ["tmap", "kakao", "naver"];

export function NavLaunchButtons({ destination, labels, heading, compact }: NavLaunchButtonsProps) {
  if (compact) {
    return (
      <>
        {PROVIDERS.map((provider) => (
          <a
            key={provider}
            href={buildNavUrl(provider, destination)}
            style={{
              minHeight: 26,
              height: 26,
              fontSize: 12,
              padding: "0 8px",
              borderRadius: 6,
              border: "1px solid var(--color-border-light)",
              background: "var(--color-surface)",
              color: "var(--color-primary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {labels[provider]}
          </a>
        ))}
      </>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{heading}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PROVIDERS.map((provider) => (
          <a
            key={provider}
            href={buildNavUrl(provider, destination)}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--color-border-light)",
              background: "var(--color-surface)",
              color: "var(--color-primary)",
              textDecoration: "none",
            }}
          >
            {labels[provider]}
          </a>
        ))}
      </div>
    </div>
  );
}
