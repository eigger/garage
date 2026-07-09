"use client";

import { buildNavUrl, type NavDestination, type NavProvider } from "../lib/navigation/deepLinks";

type NavLaunchButtonsProps = {
  destination: NavDestination;
  labels: Record<NavProvider, string>;
  heading: string;
};

const PROVIDERS: NavProvider[] = ["tmap", "kakao", "naver"];

export function NavLaunchButtons({ destination, labels, heading }: NavLaunchButtonsProps) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{heading}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PROVIDERS.map((provider) => (
          <a
            key={provider}
            href={buildNavUrl(provider, destination)}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#18523f",
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
