import { describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauthState.js";

describe("oauth state", () => {
  it("accepts a state issued for the same user and purpose", () => {
    const s = createOAuthState("user1", "link");
    expect(verifyOAuthState(s, "user1", "link")).toBe(true);
  });

  it("rejects another user, another purpose, tampering, expiry and the legacy bare user id", () => {
    const now = Date.now();
    const s = createOAuthState("user1", "link", now);
    expect(verifyOAuthState(s, "user2", "link", now)).toBe(false);
    expect(verifyOAuthState(s, "user1", "consent", now)).toBe(false);
    expect(verifyOAuthState(s.replace("user1", "user2"), "user2", "link", now)).toBe(false);
    expect(verifyOAuthState(s, "user1", "link", now + 16 * 60 * 1000)).toBe(false);
    expect(verifyOAuthState("user1", "user1", "link", now)).toBe(false);
    expect(verifyOAuthState(undefined, "user1", "link", now)).toBe(false);
  });
});
