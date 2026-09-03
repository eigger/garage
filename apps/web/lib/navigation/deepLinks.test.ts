import { describe, expect, it } from "vitest";
import { buildNavUrl, buildNavWebFallback } from "./deepLinks";

const dest = { lat: 37.5665, lon: 126.978, name: "○○주유소" };

describe("buildNavUrl", () => {
  // 웹 링크(map.kakao.com/link/to)는 폰에서 앱으로 넘어가지 않아 목적지가 안 잡힌다.
  it("카카오는 앱 스킴으로 목적지를 넘긴다", () => {
    expect(buildNavUrl("kakao", dest)).toBe("kakaomap://route?ep=37.5665,126.978&by=CAR");
  });

  it("네이버 딥링크는 좌표와 이름, appname을 싣는다", () => {
    const url = buildNavUrl("naver", dest);
    expect(url).toContain("nmap://route/car");
    expect(url).toContain("dlat=37.5665");
    expect(url).toContain("dlng=126.978");
    expect(url).toContain(`dname=${encodeURIComponent(dest.name)}`);
    expect(url).toContain("appname=garage");
  });

  it("T맵은 goalx/goaly로 좌표를 싣는다", () => {
    expect(buildNavUrl("tmap", dest)).toBe(
      `tmap://route?goalname=${encodeURIComponent(dest.name)}&goaly=37.5665&goalx=126.978`,
    );
  });

  it("세 곳 모두 앱 스킴이다 — https는 앱을 열지 못한다", () => {
    for (const provider of ["kakao", "naver", "tmap"] as const) {
      expect(buildNavUrl(provider, dest).startsWith("http")).toBe(false);
    }
  });
});

describe("buildNavWebFallback", () => {
  it("앱이 없을 때를 위해 브라우저에서 열리는 주소를 준다", () => {
    for (const provider of ["kakao", "naver", "tmap"] as const) {
      expect(buildNavWebFallback(provider, dest)).toMatch(/^https:\/\//);
    }
  });
});
