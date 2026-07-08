# garage

차량관리 통합 셀프호스트 서버 (정비/소모품, 주유, 주행관리(OBD/GPS)).
상세 설계는 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 참고.

## 구조

```
garage/
  apps/
    api/      # Node.js + TypeScript(Fastify) 백엔드, Prisma ORM
    web/      # Next.js 프론트엔드
  packages/
    shared/   # api/web 공유 Zod 스키마
  docker-compose.yml
  Caddyfile
  mosquitto/mosquitto.conf
```

## 로컬 개발 준비

1. `.env.example`을 `.env`로 복사하고 값 채우기 (`POSTGRES_PASSWORD`, `JWT_SECRET`은 필수).
2. `npm install` (루트에서 워크스페이스 전체 설치).
3. Postgres만 먼저 띄우고 싶다면:
   ```
   docker compose up -d postgres
   ```
4. Prisma 마이그레이션:
   ```
   npm run prisma:migrate
   ```
5. 최초 관리자 계정 생성 (공개 회원가입이 없어서 최초 1회 필요):
   ```
   npm run seed -w apps/api
   ```
6. 개발 서버 실행:
   ```
   npm run dev:api   # http://localhost:8080
   npm run dev:web   # http://localhost:3000
   ```
7. `http://localhost:3000/login`에서 `.env`에 넣은 `ADMIN_EMAIL`/`ADMIN_PASSWORD`로 로그인.

## 전체 스택 배포 (1단계 범위: postgres + api + web + caddy)

```
docker compose up -d --build
```

`docker-compose.yml`에는 1단계(MVP)에 필요 없는 서비스(mosquitto, cloudflared, redis, traccar)는 주석 처리해뒀다. 해당 기능이 필요해지는 시점에 아래 순서로 주석을 해제한다.

- **mosquitto**: OBD 앱/GPS 로거 데이터 수집, Home Assistant 연동을 시작할 때
- **cloudflared**: 외부(집 밖)에서 서버에 접근해야 할 때 — `.env`의 `CLOUDFLARE_TUNNEL_TOKEN` 필요
- **redis**: 백그라운드 작업량이 늘어 BullMQ로 분리해야 할 때
- **traccar**: 전용 GPS/OBD 하드웨어 로거를 실제로 붙일 때
