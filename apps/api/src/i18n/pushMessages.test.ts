import { describe, expect, it } from "vitest";
import { buildReminderPushMessage } from "@garage/shared";

describe("buildReminderPushMessage", () => {
  it("localizes Korean push copy", () => {
    const msg = buildReminderPushMessage({
      locale: "ko",
      vehicleName: "아반떼",
      itemStored: "engineOilFilter",
    });
    expect(msg.title).toBe("Garage 정비 알림");
    expect(msg.body).toContain("엔진오일·오일필터 교체");
    expect(msg.body).toContain("아반떼");
  });

  it("localizes English push copy", () => {
    const msg = buildReminderPushMessage({
      locale: "en",
      vehicleName: "Elantra",
      itemStored: "engineOilFilter",
    });
    expect(msg.title).toBe("Garage maintenance alert");
    expect(msg.body).toContain("Engine oil & oil filter replacement");
    expect(msg.body).toContain("Elantra");
  });

  it("falls back to raw label for custom items", () => {
    const msg = buildReminderPushMessage({
      locale: "en",
      vehicleName: "Van",
      itemStored: "사고 수리",
    });
    expect(msg.body).toContain("사고 수리");
  });
});
