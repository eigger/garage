# Garage 프로젝트 진행 현황

마지막 업데이트: 2026-07-09 (Windows 로컬 개발 환경 실사용 검증, UX 개선 8종, API 연동 키 관리 화면(`/integrations`) 구현 및 실제 오피넷 키로 최종 검증 완료, 주유 빠른 입력 오피넷 흐름 개선 2건)

## 1. 프로젝트 개요

- 이름: **garage** (`~/Documents/GitHub/garage`)
- 스택: Node.js/TypeScript 풀스택 — Fastify(API) + Prisma(ORM) + Next.js(웹), npm workspaces 모노레포
- DB: PostgreSQL (TimescaleDB는 데이터량 늘면 나중에 확장자만 추가)
- 배포: Docker Compose, 외부 노출은 Cloudflare Tunnel 예정(서버 자체는 내부 HTTP만 사용)
- 상세 아키텍처 설계는 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) 참고
- git: 이니셜 커밋 완료 (`073b0ce feat: initial commit with full MVP/2단계, Opinet 연동 및 테스팅 완료`)

## 2. 지금까지 완료한 것

### 인프라 (docker-compose.yml)
1단계(MVP) 범위만 활성화: `postgres` + `api` + `web` + `caddy`.
`mosquitto`(OBD/HA 연동), `cloudflared`(외부 노출), `redis`(작업 큐), `traccar`(전용 GPS 로거)는 전부 주석 처리해두고 필요해지는 시점에 하나씩 켜는 구조.

### 데이터 모델 (Prisma schema)
`User`(관리자/일반 2단계 권한), `Vehicle`(연료타입 포함), `UserVehicleAccess`(차량별 접근권한 + 실시간 위치 열람 플래그), `TelemetryRaw`, `Trip`(경로 폴리라인 포함), `FuelLog`, `MaintenanceRecord`, `ConsumablePart`(정비 스케줄 항목 겸용), `MaintenancePresetTemplate`(연료타입별 마스터 프리셋), `Reminder`, `Attachment`까지 설계한 데이터 모델 전체가 스키마에 반영되어 있음.

### 백엔드 (apps/api)
- 인증: 로그인, 내 정보 조회, 관리자 전용 사용자 생성, JWT 기반 인가, 최초 관리자 시드 스크립트
- 차량 CRUD (등록/삭제는 관리자만, 조회는 접근권한 있는 사용자만)
- 주유·정비·소모품 CRUD (차량 접근권한 체크 적용)
- 리마인더: 거리·기간 중 먼저 도래하는 조건으로 매일 재계산하는 잡 + 대시보드 배지용 조회 라우트
- 첨부파일 업로드 및 스트리밍 (이미지/PDF 영수증 및 등록증 지원, 경로 이탈 공격 차단 및 차량 권한 검증 구현)
- OBD 앱 웹훅 수집 라우트 (`/api/ingest/obd/:vehicleId`), MQTT는 설정 없으면 조용히 무시하는 스텁으로 안전하게 처리
- 트립 자동 감지·집계 잡 (5분 주기, 텔레메트리 간격 기반 세그먼트화, 실측 거리·평균속도·유휴시간·지도용 폴리라인 계산)
- 트립 목록 및 기간별(주/월) 주행 리포트 라우트
- 백업 및 복원 API: 모든 테이블 레코드를 JSON화하고 파일 업로드 폴더와 묶어 단일 `.tar.gz` 다운로드/복원 처리하는 트랜잭션 라우트 구축

### 프론트엔드 (apps/web)
- 로그인 페이지, 인증 컨텍스트 기반 라우트 보호
- 대시보드: 차량 목록 + 기한 지난 리마인더 배지
- `/vehicles`: 차량 목록 + 등록 폼(연료타입 선택 포함, 관리자 전용)
- `/vehicles/[id]`: 개요·빠른 입력·정비 스케줄·내역·접근 권한 5개 탭으로 분리된 차량 상세
- 차량 고유 상세 정보 카드 추가: 제조사, 모델, 연식, 번호판, 차대번호(VIN) 관리 및 자동차 등록증 파일 다운로드/미리보기 제공
- 주유 및 정비 영수증 파일 업로드 & 내역 탭 이미지 미리보기 썸네일 / PDF 배지 링크 연동
- 백업/복원 페이지 구축 (어드민 전용으로 `.tar.gz` 백업 파일 내려받기 및 덮어쓰기 복원 지원)
- `/maintenance-presets`: 연료타입별 정비 마스터 프리셋 관리(관리자 전용)
- PWA: manifest, 홈 화면 아이콘, 서비스워커(앱 셸 오프라인 캐싱, API 응답은 캐시 안 함)
- 모바일 반응형 레이아웃(터치 타깃, 안전영역 대응)
- 다국어(ko/en) 전환 + 거리(km/mi) 실측 환산 + 화폐(KRW/USD) 표시 형식 전환(실제 환율 변환 아님)

### 테스팅 및 검증
- shared/api/web 세 워크스페이스 모두 TypeScript 타입체크 통과
- 격리된 깨끗한 환경에서 `next build`(모든 라우트 생성 확인), api `tsc` 빌드 모두 성공
- **Vitest 단위 테스트 구축**: 백엔드 지오메트리 수식(`haversineKm`, `encodeRoute`)과 프런트엔드 거리/화폐 포맷터 순수 함수 단위 테스트 구현 완료 및 통과
- **로컬 구동 테스트 완료** (2026-07-08): postgres 컨테이너 + api/web dev 서버 실행, 로그인 → 차량 등록 → 주유/정비/소모품 기록 입력까지 브라우저로 실제 확인. 서버 에러 없음.

### 이번 구현에서 비어있던 부분 — 전부 구현 완료 (2026-07-08)
지난 세션에서 "다듬을 것"으로 남겨뒀던 7개 항목을 전부 구현하고 브라우저로 직접 동작 확인했다. 모두 shared/api/web 타입체크 통과.

1. **주유/정비/소모품 기록 수정·삭제** — `apps/api/src/routes/{fuelLogs,maintenanceRecords,consumableParts}.ts`에 PATCH/DELETE 추가 (기존 POST와 동일하게 `canAccessVehicle`로 권한 체크). `packages/shared/src/schemas/records.ts`에 `*UpdateSchema`(vehicleId 제외한 나머지 필드 partial) 추가. 프론트(`apps/web/app/vehicles/[id]/page.tsx`)는 각 기록을 행 단위 컴포넌트(`FuelLogRow`/`MaintenanceRow`/`ConsumablePartRow`)로 분리해서 "수정" 클릭 시 인라인 폼으로 전환되게 구현.
2. **리마인더 "확인함" 버튼** — 대시보드(`apps/web/app/page.tsx`)에 버튼 연결. 이 작업 중 백엔드 `POST /api/reminders/:id/dismiss`(`apps/api/src/routes/reminders.ts`)에 **차량 접근권한 체크가 아예 빠져있던 것**을 발견해서 함께 수정 — 원래는 일반 사용자가 reminder id만 알면 다른 사람 차량의 리마인더도 확인 처리할 수 있는 구멍이었음.
3. **가족 구성원 계정 추가 화면** — 새 페이지 `apps/web/app/users/page.tsx` (관리자 전용, `isAdmin` 아니면 대시보드로 리다이렉트). 기존 `POST /api/auth/users`를 그대로 사용. 사용자 목록을 보여줄 방법이 없어서 `GET /api/auth/users`(관리자 전용)도 새로 추가.
4. **canViewLocation 관리 화면** — 차량 상세 페이지에 관리자 전용 "차량 접근 권한" 섹션 추가. 일반 사용자별로 "접근 허용"/"실시간 위치 열람" 체크박스 2개. 백엔드에 `GET/PUT/DELETE /api/vehicles/:id/access(/:userId)` 라우트 신설 (`UserVehicleAccess`를 다루는 라우트가 이전엔 전혀 없었음 — `canAccessVehicle` 조회 로직만 있고 관리 API가 없는 상태였음).
5. **트립 업무용/개인용 태깅 UI** — 트립 목록 각 행에 select 추가, `PATCH /api/trips/:id`(신규, `purpose` 필드만 갱신) 호출.
6. **원시 텔레메트리 1년 보존 배치 잡** — `apps/api/src/jobs/telemetryRetention.ts` 신규. `trips.ts`/`reminders.ts` 잡과 동일한 패턴(서버 기동 시 1회 + 매일 새벽 4시 cron)으로 `TelemetryRaw.time`이 365일 지난 행을 삭제.
7. **연료타입별 정비 프리셋 및 차량 상세 화면 전면 재구성** — 상세 항목은 하단 상세 설계 섹션 참고.

**결정 사항**:
- 기록 수정·삭제 권한은 생성과 동일하게 "해당 차량에 접근권한이 있는 사용자"면 가능하도록 함.
- 차량 접근권한 부여 시 `canViewLocation` 기본값은 `false`로 시작.

### 지금 바로 (로컬에서)
- [x] `docker compose up -d postgres`, `npm run prisma:migrate`, `npm run seed -w apps/api`로 로컬 구동 — 완료
- [x] 로그인 → 차량 등록 → 소모품/주유/정비 입력이 실제로 되는지 확인 — 완료, 정상 동작
- [x] 위 7개 항목 구현 후 브라우저로 각각 동작 확인 (수정/삭제, 확인함, 계정 추가, 접근권한 토글, 트립 태깅, 배치 잡 수동 실행) — 완료, 서버 에러 없음
- [x] 리마인더 배지(대시보드) 및 주행 리포트 실사용 검증 — 완료 (2026-07-09, Windows 환경). 소모품 스케줄의 설치일을 과거로 수정 → "지남" 상태 전환 → 대시보드 "정비 알림 1건" 배지 및 "확인함" 처리까지 확인. 텔레메트리 포인트를 백데이트로 주입 후 트립 집계 잡을 수동 실행 → 주간 리포트(9km, 13분, 1회 주행)와 트립 업무용/개인용 태깅까지 정상 동작 확인
- [x] `git add -A && git commit`으로 이니셜 커밋 — 완료 (`073b0ce`)

### Windows 로컬 개발 환경 셋업 (2026-07-09, 새 머신 최초 셋업)
- 이 저장소는 원래 macOS에서 개발되어 Windows에서는 처음 셋업. `npm install` 시 `@prisma/client`/`esbuild`/`prisma`의 postinstall 스크립트가 allow-scripts 정책에 막혀 있어 `npm approve-scripts <pkg>` 후 `npm rebuild` 필요.
- Docker Desktop이 winget으로 이미 설치되어 있었으나 실행 중이 아니었음 — 최초 실행 시 기동 대기 필요.
- `.env`가 저장소에 없어 신규 생성 필요 (`.env.example` 기반, `JWT_SECRET`은 랜덤 생성). 호스트에서 직접 도는 `prisma migrate`/`seed`는 `DATABASE_URL`을 `localhost:5432`로 잡아야 함(docker-compose 내부 `postgres` 호스트명과 다름).
- `apps/api`의 `dev` 스크립트(`tsx watch src/index.ts`)는 `.env`를 자동으로 읽지 않음 — Node 20.6+ 내장 `--env-file` 플래그를 사용하도록 `apps/api/package.json`을 `tsx watch --env-file=../../.env src/index.ts`로 변경함. Next.js(`apps/web`)는 `lib/api.ts`의 `API_URL` 기본값이 `http://localhost:8080`이라 별도 `.env` 없이도 로컬 구동 가능.
- **스키마-마이그레이션 드리프트 버그 발견**: `schema.prisma`에는 있지만 마이그레이션 파일이 없던 컬럼 3개(`Vehicle.apiToken`, `Attachment.vehicleId`, `FuelLog.location`)를 발견. 이전 세션에서 `prisma db push`로 로컬 검증만 하고 `prisma migrate dev`로 마이그레이션 파일을 만들지 않은 채 커밋된 것으로 추정. `prisma migrate diff`로 차이를 추출해 새 마이그레이션(`20260708232355_add_vehicle_api_token_attachment_vehicle_fuellog_location`)을 수동 생성해 반영 — 이 마이그레이션 없이는 깨끗한 DB에서 API 서버 기동 시 `Vehicle.apiToken` 컬럼 부재 에러가 발생했음(서버 자체는 죽지 않지만 OBD 웹훅 인증에 쓰이는 토큰 백필 로직이 매번 실패).

### 사용자 편의성 UX 개선 (2026-07-09)
실사용 검증 중 발견한 개선 포인트(차량 삭제 메뉴 부재, 연료타입 select 높이 버그)를 계기로 UX 전반을 점검해 8가지를 구현하고 각각 브라우저로 동작 확인했다.

1. **차량 삭제 메뉴** — `apps/web/app/vehicles/[id]/page.tsx`의 "등록된 차량" 카드 헤더에 관리자 전용 삭제 버튼 추가. 캐스케이드 삭제(주유·정비·소모품·트립·첨부파일 전부 삭제됨)를 명시하는 전용 경고 문구(`deleteVehicleConfirm`)로 확인받음.
2. **select 높이 버그 수정** — `globals.css`의 `input, button { min-height: 44px; font-size: 16px; }` 규칙에 `select`가 빠져 있던 것을 발견. 연료타입뿐 아니라 앱 전체 select(정비 항목, 소모품 종류, 트립 태깅 등)에 동일한 문제가 있어 규칙에 `select`를 추가해 일괄 수정.
3. **커스텀 확인 모달** — `apps/web/lib/confirm-context.tsx` 신규(`ConfirmProvider`/`useConfirm`, Promise 기반). 차량·소모품·주유·정비·프리셋 삭제, 백업 복원 등 모든 `window.confirm()` 호출을 대체. 모달 문구/버튼 라벨을 액션별로 지정 가능(예: 백업 복원은 "복원하기" 버튼).
4. **토스트 피드백** — `apps/web/lib/toast-context.tsx` 신규(`ToastProvider`/`useToast`). 저장·등록·삭제 성공/실패 시 화면 하단에 2.8초간 토스트 표시. 거의 모든 CRUD 액션(차량/주유/정비/소모품/프리셋/사용자/접근권한/백업)에 적용. `backup/page.tsx`의 `alert()`도 토스트로 교체.
5. **차량 스위처** — `apps/web/app/vehicles/[id]/layout.tsx` 상단에 전체 차량 드롭다운 추가. 선택 시 현재 탭(스케줄/내역 등) 경로를 유지한 채 다른 차량으로 이동.
6. **폼 검증 메시지 커스터마이즈** — 차량 등록, 빠른 입력(주유/정비), 사용자 추가 폼에 `noValidate` + 수동 검증을 적용해 브라우저 네이티브 팝업 대신 스타일이 통일된 "필수 항목입니다." 메시지(`requiredField`)를 표시.
7. **첨부파일 업로드 진행률** — `apps/web/lib/api.ts`에 `uploadFileWithProgress`(XHR 기반, `fetch`는 업로드 진행률 이벤트 미지원) 신규. 등록증(차량 상세)·영수증(빠른 입력 주유/정비) 업로드 시 진행률 바 표시.
8. **정비 스케줄 필터 토글** — `schedule/page.tsx`에 "전체"/"지남·임박만" 토글 버튼 추가. 프리셋만 50개라 스케줄 탭이 길어지는 문제 완화.

부수적으로 `profile/page.tsx`에서 저장 성공 메시지를 `setMessage`로 띄운 직후 곧바로 `window.location.reload()`가 실행되어 메시지가 사실상 보이지 않던 기존 버그를 발견해, 1.2초 지연 후 새로고침하도록 수정(토스트도 함께 적용). `backup/page.tsx`의 복원 성공 후 로그인 페이지 리다이렉트도 동일한 이유로 지연 처리.

**검증**: `next build` 타입체크 통과. 브라우저로 차량 등록 검증 실패/성공 토스트, 확인 모달(취소/삭제 버튼, 배경 클릭 시 취소), 스위처(탭 유지 확인), 스케줄 필터(0건으로 필터링 확인)까지 직접 동작 확인. 테스트로 만든 차량은 정리함.

**참고**: dev 서버가 켜진 상태에서 `next build`(프로덕션 빌드)를 실행하면 `.next` 캐시가 충돌해 dev 서버가 `MODULE_NOT_FOUND` 런타임 에러를 내는 것을 확인함 — 이 경우 `apps/web/.next`를 삭제하고 dev 서버를 재시작하면 해결됨.

### API 연동 키 관리 화면 (2026-07-09)
오피넷 API 키를 `.env` 파일 편집으로만 설정할 수 있었던 것을 발견하고("연동은 되는데 이 앱의 실제 사용자인 가족 구성원 관리자가 서버 파일을 직접 편집해야 하는 건 비현실적" — 사용자 피드백), UI에서 관리하는 방식으로 전환했다. 지도 API(3단계) 등 앞으로 추가될 연동 키도 같은 패턴을 재사용하도록 범용적으로 설계.

- **데이터 모델**: `Setting { key, value, updatedAt }` key-value 테이블 신규(`apps/api/prisma/schema.prisma`). **의도적으로 백업/복원 대상에서 제외** — `apps/api/src/routes/backup.ts`가 테이블을 명시적으로 나열하는 방식이라 자동으로 포함되지 않는데, 이는 의도한 설계: 백업 파일이 외부(노트북, 클라우드 등)로 유출될 때 연동 키까지 함께 노출되는 걸 막기 위함.
- **백엔드**: `apps/api/src/lib/settings.ts`의 `getSetting(key)`가 DB 값을 우선 사용하고 없으면 `process.env[key]`로 폴백 — UI 없이 `docker-compose`의 환경변수만으로도 계속 동작 가능. `apps/api/src/routes/settings.ts` 신규(관리자 전용 `GET/PUT/DELETE /api/settings`). 허용 키 화이트리스트는 `packages/shared/src/schemas/settings.ts`의 `settingKeySchema`(현재 `OPINET_API_KEY` 하나, 추가 시 여기만 확장). `apps/api/src/routes/opinet.ts`가 `process.env.OPINET_API_KEY` 직접 참조 대신 `getSetting("OPINET_API_KEY")`를 쓰도록 변경.
- **프론트엔드**: `/integrations` 관리자 전용 페이지 신규(`apps/web/app/integrations/page.tsx`). 키 값은 절대 평문으로 다시 내려주지 않고 마스킹(`••••1234`)과 출처(DB 저장 vs 서버 환경변수 폴백)만 표시. 대시보드 관리자 링크 목록에 추가.
- **검증**: 브라우저로 키 미설정→목 데이터 폴백(4건), 관리 화면에서 키 저장→실제 API 경로로 전환(가짜 키라 빈 배열 응답, 목 데이터가 아님을 확인해 실제 경로를 탔음을 검증), 확인 모달을 거쳐 키 삭제→목 데이터로 복귀까지 전체 사이클 확인.
- **부수 수정**: `.env.example`에 `OPINET_API_KEY` 안내 추가, `docker-compose.yml`의 `api` 서비스 환경변수에 `OPINET_API_KEY` 전달이 누락돼 있던 것도 함께 추가(이건 여전히 컨테이너 배포 시 폴백 경로로 유효).
- **실제 키로 최종 검증 완료**: 사용자가 발급받은 실제 오피넷 키를 `/integrations`에 입력해 서울시청 좌표로 조회 → 실제 주유소 53건(정유사 브랜드, 실거리, 1,840~1,856원대 실제 가격) 정상 응답 확인. `s.UNI_ID`/`s.OS_NM`/`s.POLL_DIV_CO`/`s.DISTANCE`/`s.PRICE` 파싱 로직이 실제 API 응답 스키마와 정확히 일치함을 확인 — 아래 "실 배포 전 확인할 것"의 오피넷 항목 해결됨.
- **빠른 입력 "수동 전용" 동작 검증 중 버그 발견 및 수정**: "오피넷 연동 없이도 완전히 수동으로 다 되는가?"라는 사용자 질문에 코드를 직접 확인하다가, 주유 빠른 입력의 주유소 이름(`location`) 입력란이 `{location && (<input .../>)}`로 감싸져 있어 **오피넷에서 주유소를 한 번 선택하기 전까지는 화면에 아예 나타나지 않는** 버그를 발견함(`apps/web/app/vehicles/[id]/quick-log/page.tsx`). 조건부 렌더링을 제거해 항상 노출되게 하고, 함께 있던 "위치 입력 시 단가 필수" 검증도 제거(단가는 리터/비용 계산 보조용일 뿐 저장되는 필드가 아니라서 강제할 이유가 없었음). 브라우저로 오피넷 없이 주행거리·주유소명·리터·비용만 수동 입력해 저장 → API로 `location` 필드가 정확히 저장됨을 확인.
- **"주변 주유소 찾기" 클릭 시 최근접 주유소 자동 선택**: 기존에는 버튼을 누르면 목록만 뜨고 사용자가 드롭다운에서 한 번 더 선택해야 위치/단가가 채워졌음(사용자 피드백: "누르면 바로 가장 가까운 곳이 자동 입력되고, 바꾸고 싶을 때만 목록에서 변경하는 방식이어야 할 것 같다"). 오피넷 API가 `sort=1`(거리순)로 조회되는 점을 이용해, 조회 직후 목록의 첫 항목을 자동으로 적용(`applyStation` 헬퍼로 통합)하도록 변경 — 드롭다운은 그대로 남아있어 원하면 다른 주유소로 바꿀 수 있음. 실제 키로 클릭 한 번에 최근접 주유소(1,840원) 자동 입력, 드롭다운에서 다른 주유소 선택 시 정상 교체까지 확인.

### 로드맵상 다음 단계
- **3단계**: 지도 API(네이버/카카오) 연동으로 트립 경로 시각화, 운전 습관 점수 계산, 전용 GPS/OBD 로거 + Traccar 연동, Home Assistant MQTT 센서 노출 (이때 `mosquitto` 서비스 주석 해제)
- **4단계**: Grafana 기반 비용/연비 분석 대시보드, 가족 구성원별 유류비 정산 리포트 고도화

### 실 배포 전 확인할 것
- [ ] Torque Pro / Car Scanner 등 실제 사용할 OBD 앱의 웹훅(Upload URL) 기능이 무료판에서 되는지 확인
- [ ] 차량이 여러 대일 때 앱에서 어떤 값으로 `vehicleId`를 구분해 보낼지 확정
- [ ] Cloudflare Tunnel 연결 및 도메인 설정
- [ ] `.env`의 `JWT_SECRET`, `POSTGRES_PASSWORD`, 관리자 계정 값을 실제 운영값으로 교체
- [x] `OPINET_API_KEY` 실제 발급/등록 후 실 API 응답으로 `apps/api/src/routes/opinet.ts` 파싱 로직 검증 — 완료 (2026-07-09, `/integrations`에서 실제 키로 서울시청 주변 주유소 53건 정상 조회 확인)

## 4. 알려둘 것

- `docker-compose.yml`의 `mosquitto`/`cloudflared`/`redis`/`traccar`는 의도적으로 주석 처리된 상태 — 각 기능이 필요해지는 시점에 하나씩 주석 해제 (`README.md`에 어떤 시점에 어떤 걸 켜야 하는지 정리되어 있음)
- 화폐 단위 전환은 표시 형식만 바꾸고 실제 환율 변환은 하지 않음 (저장된 금액은 항상 입력한 원 그대로)

## 5. GPS 및 오피넷(Opinet) API 연동 — 구현 완료

### 1) 스마트폰 및 웹 브라우저 GPS 연동
- 백엔드 `/api/ingest/obd/:vehicleId` 라우트([ingest.ts](../apps/api/src/routes/ingest.ts))가 위도(`lat`)·경도(`lon`) 등 원시 GPS 데이터를 받아 `TelemetryRaw`에 적재하고, 트립 집계 잡([trips.ts](../apps/api/src/jobs/trips.ts))이 5분 주기로 세그먼트를 트립으로 닫는 구조를 실제 데이터로 검증 완료(2026-07-09, 백데이트 텔레메트리 주입 후 트립/주간 리포트 정상 생성 확인).
- 빠른 입력 화면([quick-log/page.tsx](../apps/web/app/vehicles/[id]/quick-log/page.tsx))에서 `navigator.geolocation.getCurrentPosition`으로 브라우저 GPS를 직접 사용해 현재 위치를 얻는 방식까지 구현되어 있음.

### 2) 오피넷(Opinet) API 기반 주변 주유소 가격 조회
- 백엔드 `/api/opinet/stations` 라우트([opinet.ts](../apps/api/src/routes/opinet.ts))가 KATEC 좌표 변환(`proj4`) 후 오피넷 `aroundAll.do`를 호출해 반경 5km 내 주유소 목록(이름/브랜드/거리/유종별 단가)을 반환. `OPINET_API_KEY` 미설정 시 또는 API 호출 실패 시 실제와 유사한 목(mock) 데이터로 자동 폴백.
- 빠른 입력 폼에서 브라우저 GPS 위치 기준으로 근처 주유소를 조회해 선택하면 유종별 단가가 자동 바인딩되는 흐름까지 구현됨.
- **실제 키로 검증 완료** (2026-07-09): 사용자가 발급받은 실제 `OPINET_API_KEY`를 관리자 화면 `/integrations`에서 등록해 서울시청 좌표로 조회 → 실제 주유소 53건이 정상 응답됨(정유사 브랜드, 실거리, 실제 가격대 1,840~1,856원). 파싱 로직이 실제 API 응답 스키마와 일치함을 확인.
