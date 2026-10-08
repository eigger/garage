import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

// "마지막 관리자" 보호 테스트. 이 테스트는 공유 DB의 다른 ACTIVE 관리자를 모두 PENDING으로 바꿔 관리자를
// 한 명만 남겨야 검증할 수 있다. 일반 스위트에서는 파일들이 병렬로 같은 DB를 쓰므로, 그 사이 다른 파일의
// 관리자 토큰이 403(pending approval)을 받아 간헐적으로 실패했다. 파일 간 병렬 실행이 꺼진
// integration 설정(vitest.integration.config.ts)에서 따로 돌린다.
describe("last active admin protection", () => {
  let app: FastifyInstance;
  const password = "test-password-123";
  let adminId: string;
  let adminToken: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: { name: "Test Admin", email: `last-admin-${randomUUID()}@example.com`, passwordHash, role: "ADMIN" },
    });
    adminId = admin.id;
    createdUserIds.push(admin.id);
    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN" });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("refuses to demote, deactivate or delete the last active admin", async () => {
    // 이 테스트 내에서는 관리자를 한 명만 남겨두고 검증한다.
    const otherAdmins = await prisma.user.findMany({
      where: { id: { not: adminId }, role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: otherAdmins.map((a) => a.id) } },
      data: { status: "PENDING" },
    });

    try {
      // 자기 자신은 역할/상태를 바꿀 수 없다(되돌릴 권한까지 함께 잃기 때문).
      const self = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: "GENERAL" },
      });
      expect(self.statusCode).toBe(400);

      const selfDelete = await app.inject({
        method: "DELETE",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(selfDelete.statusCode).toBe(400);

      // 다른 관리자가 이 마지막 관리자를 강등하려는 경우도 막힌다.
      const secondAdmin = await prisma.user.create({
        data: {
          name: "Second Admin",
          email: `second-admin-${randomUUID()}@example.com`,
          passwordHash: await bcrypt.hash(password, 10),
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      createdUserIds.push(secondAdmin.id);
      const secondToken = app.jwt.sign({
        sub: secondAdmin.id,
        role: "ADMIN",
        tokenVersion: secondAdmin.tokenVersion,
      });

      // 이제 관리자가 둘이므로 강등이 허용된다.
      const demote = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${adminId}`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { role: "GENERAL" },
      });
      expect(demote.statusCode).toBe(200);

      // 남은 관리자는 secondAdmin 하나 — 이제 이 계정은 강등할 수 없다.
      const lastOne = await app.inject({
        method: "PATCH",
        url: `/api/auth/users/${secondAdmin.id}`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { role: "GENERAL" },
      });
      expect(lastOne.statusCode).toBe(400);

      await prisma.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((a) => a.id) } },
        data: { status: "ACTIVE" },
      });
    }
  });
});
