# Garage 프로젝트 진행 현황

마지막 업데이트: 2026-07-08 (영수증/등록증 파일 업로드, 차량 정보/VIN 관리, 백업/복원 시스템 및 Vitest 테스트 구축 완료)

## 1. 프로젝트 개요

- 이름: **garage** (`~/Documents/GitHub/garage`)
- 스택: Node.js/TypeScript 풀스택 — Fastify(API) + Prisma(ORM) + Next.js(웹), npm workspaces 모노레포
- DB: PostgreSQL (TimescaleDB는 데이터량 늘면 나중에 확장자만 추가)
- 배포: Docker Compose, 외부 노출은 Cloudflare Tunnel 예정(서버 자체는 내부 HTTP만 사용)
- 상세 아키텍처 설계는 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) 참고
- git: 아직 커밋 안 함 — 전체 구현이 어느 정도 마무리되면 사용자가 직접 이니셜 커밋 예정

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
- [ ] 리마인더 배지(대시보드) 및 주행 리포트는 각각 소모품 등록 후 크론잡이 리마인더를 계산해야 뜨고, 트립은 텔레메트리 데이터가 있어야 집계되므로 이번 세션에서는 "데이터 없음" 상태만 확인함 — 실사용 중 자연스럽게 쌓이는지 추가 확인 필요
- [ ] 확인 끝나면 `git add -A && git commit`으로 이니셜 커밋

### 로드맵상 다음 단계
- **3단계**: 지도 API(네이버/카카오) 연동으로 트립 경로 시각화, 운전 습관 점수 계산, 전용 GPS/OBD 로거 + Traccar 연동, Home Assistant MQTT 센서 노출 (이때 `mosquitto` 서비스 주석 해제)
- **4단계**: Grafana 기반 비용/연비 분석 대시보드, 가족 구성원별 유류비 정산 리포트 고도화

### 실 배포 전 확인할 것
- [ ] Torque Pro / Car Scanner 등 실제 사용할 OBD 앱의 웹훅(Upload URL) 기능이 무료판에서 되는지 확인
- [ ] 차량이 여러 대일 때 앱에서 어떤 값으로 `vehicleId`를 구분해 보낼지 확정
- [ ] Cloudflare Tunnel 연결 및 도메인 설정
- [ ] `.env`의 `JWT_SECRET`, `POSTGRES_PASSWORD`, 관리자 계정 값을 실제 운영값으로 교체

## 4. 알려둘 것

- `docker-compose.yml`의 `mosquitto`/`cloudflared`/`redis`/`traccar`는 의도적으로 주석 처리된 상태 — 각 기능이 필요해지는 시점에 하나씩 주석 해제 (`README.md`에 어떤 시점에 어떤 걸 켜야 하는지 정리되어 있음)
- 화폐 단위 전환은 표시 형식만 바꾸고 실제 환율 변환은 하지 않음 (저장된 금액은 항상 입력한 원 그대로)

## 5. 향후 추가 연동 계획 (GPS 및 오피넷 API)

### 1) 스마트폰 및 웹 브라우저 GPS 연동 방안
- **스마트폰 앱 연동**:
  - 현재 백엔드의 `/api/ingest/obd/:vehicleId` 라우트([ingest.ts](file:///Users/eigger/Documents/GitHub/garage/apps/api/src/routes/ingest.ts))는 이미 위도(`lat`)와 경도(`lon`) 등 원시 GPS 데이터를 받아들일 수 있도록 구축되어 있음.
  - 모바일에서 실행되는 Torque Pro나 전용 GPS 로거 등 수집용 앱을 연동해 백엔드로 운행 정보를 자동 전송하도록 구성 가능.
- **웹 브라우저 직접 수집**:
  - 모바일 브라우저 환경에서 사용자가 주행 기록 시작을 누르면 HTML5 Geolocation API(`navigator.geolocation.watchPosition`)를 사용하여 스마트폰 GPS 정보를 직접 수집하고 백엔드로 주기적인 위치 업데이트를 전송해 수동으로 주행 리포트를 기록하는 방식도 도입 가능.

### 2) 오피넷(Opinet) API 기반 가격 정보 자동 조회 및 주유 입력 고도화
- **현재 위치 기준 주변 주유소 및 가격 검색**:
  - 모바일 기기 GPS 기반의 위경도 좌표를 백엔드로 보낸 뒤, 백엔드에서 오피넷 주변 주유소 조회 API(예: `aroundAll.do`)를 호출하여 사용자의 현재 위치 반경 1~5km 내의 주유소 목록(이름, 정유사 브랜드, 주소, 유종별 단가)을 조회.
- **주유 빠른 입력 폼(`QuickFuelForm`) 개선**:
  - 주유 기록 탭 화면에서 사용자가 근처 주유소를 선택하면, 해당 주유소의 유종별 리터당 단가가 자동으로 입력 폼에 바인딩되도록 개선.
  - 사용자가 주유 금액 또는 주유량을 입력하면 단가를 기반으로 나머지 필드가 자동으로 계산(예: `주유량 = 주유 금액 / 리터당 단가`)되어 입력 편의성 및 데이터 정확성 향상.
