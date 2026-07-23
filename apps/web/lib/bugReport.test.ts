import { describe, expect, it } from "vitest";
import { buildBugReportUrl, recordError, recordFailedRequest } from "./bugReport";

describe("buildBugReportUrl", () => {
  it("includes the title, description, and structured context (no PII fields)", () => {
    const url = buildBugReportUrl({
      title: "트립 지도가 이상해요",
      description: "어제 위치에서 이어지지 않음",
      pathname: "/vehicles/abc123/history",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/eigger/garage/issues/new");
    expect(parsed.searchParams.get("title")).toBe("트립 지도가 이상해요");

    const body = parsed.searchParams.get("body") ?? "";
    expect(body).toContain("어제 위치에서 이어지지 않음");
    expect(body).toContain("/vehicles/abc123/history");
    expect(body).toContain("앱 버전");
    // no raw lat/lon, email, or vehicle name fields should ever be templated in
    expect(body).not.toMatch(/\d{2}\.\d{5,},\s*-?\d{2,3}\.\d{5,}/);
  });

  it("attaches recorded failed requests with method/path/status only", () => {
    recordFailedRequest("GET", "/api/vehicles/marker-req-1", 403);
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("GET /api/vehicles/marker-req-1 → 403");
  });

  it("attaches recorded console errors", () => {
    recordError("marker-err-1: something broke");
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("marker-err-1: something broke");
  });

  it("caps the ring buffer so only the most recent entries are kept", () => {
    for (let i = 0; i < 10; i++) {
      recordError(`ring-marker-${i}`);
    }
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    // only the last 5 of this batch should survive
    expect(body).toContain("ring-marker-9");
    expect(body).toContain("ring-marker-5");
    expect(body).not.toContain("ring-marker-4");
    expect(body).not.toContain("ring-marker-0");
  });
});
