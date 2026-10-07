import { describe, expect, it } from "vitest";
import { redactTokenInUrl } from "./logRedact.js";

describe("redactTokenInUrl", () => {
  it("masks token query values and keeps the rest of the URL", () => {
    expect(redactTokenInUrl("/api/attachments/file/a.jpg?token=eyJabc.def.ghi")).toBe(
      "/api/attachments/file/a.jpg?token=[redacted]",
    );
    expect(redactTokenInUrl("/api/ingest/obd?speed=60&token=secret&lat=37")).toBe(
      "/api/ingest/obd?speed=60&token=[redacted]&lat=37",
    );
  });

  it("leaves URLs without tokens alone", () => {
    expect(redactTokenInUrl("/api/vehicles?x=1")).toBe("/api/vehicles?x=1");
    expect(redactTokenInUrl(undefined)).toBeUndefined();
  });
});
