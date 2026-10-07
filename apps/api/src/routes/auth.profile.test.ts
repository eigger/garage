import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// 본인 프로필 수정: 비밀번호를 바꾸면 다른 기기 세션이 끊기고, 이메일 변경은 현재 비밀번호를 요구한다.
describe("PATCH /api/auth/profile — session & credential safety", () => {
  let app: FastifyInstance;
  let userId: string;
  let oldToken: string;
  const suffix = randomUUID();
  const email = `profile-${suffix}@example.com`;
  const password = "current-pass-1";

  const patch = (token: string, body: unknown) =>
    app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: body as object,
    });

  beforeAll(async () => {
    app = await buildApp();
    const user = await prisma.user.create({
      data: { name: "Profile", email, passwordHash: await bcrypt.hash(password, 4), role: "ADMIN" },
    });
    userId = user.id;
    oldToken = app.jwt.sign({ sub: userId, role: "ADMIN", tokenVersion: user.tokenVersion });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  });

  it("requires the current password to change the email, but not when it is unchanged", async () => {
    const same = await patch(oldToken, { name: "Profile2", email });
    expect(same.statusCode).toBe(200);

    const noPw = await patch(oldToken, { email: `new-${suffix}@example.com` });
    expect(noPw.statusCode).toBe(400);

    const wrong = await patch(oldToken, { email: `new-${suffix}@example.com`, currentPassword: "wrong-pass-123" });
    expect(wrong.statusCode).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(email);

    const ok = await patch(oldToken, { email: `new-${suffix}@example.com`, currentPassword: password });
    expect(ok.statusCode).toBe(200);
    await prisma.user.update({ where: { id: userId }, data: { email } });
  });

  it("invalidates old tokens on password change and returns a working new token", async () => {
    const res = await patch(oldToken, { currentPassword: password, newPassword: "brand-new-pass-2" });
    expect(res.statusCode).toBe(200);
    const { token } = res.json();
    expect(typeof token).toBe("string");

    const stale = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${oldToken}` } });
    expect(stale.statusCode).toBe(401);

    const fresh = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(fresh.statusCode).toBe(200);
  });
});
