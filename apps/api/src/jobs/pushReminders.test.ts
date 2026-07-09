import { describe, expect, it } from "vitest";
import { datesEqual, isReminderDue } from "./pushReminders.js";

describe("isReminderDue", () => {
  const now = new Date("2026-06-01");

  it("returns true when due date passed", () => {
    expect(
      isReminderDue({ dueDate: new Date("2026-05-01"), dueOdometer: null }, 10000, now),
    ).toBe(true);
  });

  it("returns true when due odometer reached", () => {
    expect(
      isReminderDue({ dueDate: null, dueOdometer: 50000 }, 50000, now),
    ).toBe(true);
  });

  it("returns false when not yet due", () => {
    expect(
      isReminderDue({ dueDate: new Date("2026-12-01"), dueOdometer: 90000 }, 40000, now),
    ).toBe(false);
  });
});

describe("datesEqual", () => {
  it("compares dates by time", () => {
    expect(datesEqual(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(true);
    expect(datesEqual(null, null)).toBe(true);
    expect(datesEqual(new Date("2026-01-01"), null)).toBe(false);
  });
});
