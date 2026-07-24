import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

// 현대 Hyundai Developers의 "데이터 조회 불가 상태 알림" 콜백 — 콘솔의
// "설정 - 데이터 API" 페이지에 이 라우트 URL을 Callback URL로 등록해야 호출된다.
// 계정 삭제/차량 삭제/제3자 제공 동의 철회 시 즉시 호출되며, 개인정보보호법상
// 통지 즉시 관련 데이터를 삭제해야 한다. 규격서에 별도 인증 헤더가 명시돼 있지
// 않아 이 라우트는 JWT 인증 없이 공개돼 있다(ingestRoutes와 동일한 성격).
export async function hyundaiWebhookRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const { type, action, userId, carId } = request.body as {
      type?: string;
      action?: string;
      userId?: string;
      carId?: string;
    };

    if (type === "account" && action === "delete" && userId) {
      // HyundaiAccountLink 삭제는 onDelete: Cascade로 딸린 HyundaiVehicleLink도 함께 지운다.
      await prisma.hyundaiAccountLink.deleteMany({ where: { hyundaiUserId: userId } });
    } else if ((type === "vehicle" || type === "agreement") && action && carId) {
      await prisma.hyundaiVehicleLink.deleteMany({ where: { hyundaiCarId: carId } });
    }

    return reply.code(200).send({ status: "ok" });
  });
}
