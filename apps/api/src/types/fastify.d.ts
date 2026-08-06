import "fastify";
import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: "ADMIN" | "GENERAL"; tokenVersion?: number };
    // role/status는 토큰이 아니라 DB에서 읽어 채운다(authenticate 참고) — 토큰에 박힌
    // 값을 그대로 믿으면 역할 강등이 토큰 만료(90일)까지 반영되지 않는다.
    user: {
      sub: string;
      role: "ADMIN" | "GENERAL";
      status: "PENDING" | "ACTIVE";
      tokenVersion: number;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    // 승인 대기(PENDING) 계정도 통과시키는 인증 — 승인 대기 화면을 그리는 데 필요한
    // GET /api/auth/me 하나에만 쓴다.
    authenticateAllowPending: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
