# Garage

[![CI](https://github.com/eigger/garage/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/garage/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/garage/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/garage/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/garage)](https://github.com/eigger/garage/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/garage.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fgarage-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/garage/pkgs/container/garage-api)

**[English README](./README.en.md)**

가족·홈랩용 셀프호스팅 차량 관리 — 정비 스케줄, 주유 기록, 알림, OBD/GPS 주행, Home Assistant 연동(선택).

> 최신 릴리스는 [GitHub Releases](https://github.com/eigger/garage/releases)에서 확인하세요.

문서: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) · [`docs/PROGRESS.md`](./docs/PROGRESS.md)

---

## 기능

- 차량·사용자·차량별 접근 ACL (관리자 / 일반)
- 모바일 우선의 고정형 하단 네비게이션 바로 한 손 조작 편의성 극대화
- 스마트 홈 리다이렉트: 계정에 등록된 차량이 1대뿐인 경우 차량 목록 대시보드를 건너뛰고 바로 차량 개요로 진입
- 정비 + 행정·법정 스케줄, 거리·시간 이중 알림
- 연료 타입별 정비 프리셋, 전역 행정·법정 프리셋
- 주유 기록·영수증 첨부, 오피넷 주변 주유소(선택)
- 천안사랑카드 가맹 주유소(옵트인) — 가격·거리순 전체 목록, 전 유종 가격 표시
- 전기차 충전소 찾기(한국환경공단 API, 선택) — 주유소와 마찬가지로 거리순/가격순 검색, 지도에 번호 마커로 표시
- OBD 수집(Torque Pro), REST/WebSocket 텔레메트리, 자동 트립 분할
- 현대 블루링크 커넥티드카 연동(베타, 국내 전용) — OBD 동글 없이 실제 주행거리·주행가능거리·경고등 조회, 오도미터 자동 동기화. 가족 구성원 각자 프로필에서 본인 계정 연동
- 주행 리포트, 경로 지도 (OSM / 카카오 / 네이버 / T맵) 및 진행 방향 화살표, 주행 개별 메모 추가/편집 및 역지오코딩
- 대시보드 알림 배지 및 차량 요약 카드 (최근 주유 비용 포함)
- 차량별 관리 레벨·뱃지(게이미피케이션) 전용 화면
- 네비게이션 구조 단일화 (상단 헤더 제거 및 버전 표시 더보기 시트 이동)
- 관리자 백업/복원, PWA, 한/영 i18n
- 사용자 없을 때 최초 관리자 부트스트랩

---

## 스크린샷 & 사용 방법

### 1. 대시보드

로그인 후 홈 화면입니다. 차량이 여러 대인 경우에는 통합 대시보드가 표시되어 모바일에 최적화된 화면에서 각 차량 카드별 현재 주행거리, 최근 주행 거리, 최근 주유 비용, 지남/임박 알림 건수를 한눈에 볼 수 있습니다. 하단 네비게이션 바를 통해 홈, 빠른 입력, 설정으로 바로 이동할 수 있습니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/01-dashboard.png" alt="대시보드" width="375" />
</p>

### 2. 차량 개요 (전기차 vs. 내연차)

차량별 허브입니다. 최근 지출 요약 카드, 월간 비용 차트, 마지막 주행 정보 및 지도가 제공됩니다. 전기차 화면은 충전 상태와 배터리 관련 정보를 표시하며 주변 충전소 찾기가 연동되고, 내연차 화면은 연료 게이지와 오피넷 기반 주변 주유소 찾기 연동을 제공합니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/02-vehicle-ev.png" alt="차량 개요 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/02-vehicle-ice.png" alt="차량 개요 (내연차)" width="375" />
</p>

### 3. 빠른 입력 (전기차 vs. 내연차)

어디서나 주유/충전 및 정비를 바로 기록하는 화면입니다. 전기차는 충전 전력량(kWh) 입력, kWh당 단가, 충전소 검색을 지원하며, 내연차는 정유사 브랜드 로고 선택(오피넷), 주유량(L), 리터당 단가 입력을 지원합니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/03-quick-log-ev.png" alt="빠른 입력 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/03-quick-log-ice.png" alt="빠른 입력 (내연차)" width="375" />
</p>

### 4. 정비 스케줄 (전기차 vs. 내연차)

거리 및 시간 기준 정비 스케줄과 행정 알림을 관리합니다. 엔진오일/오일필터 교체 주기(내연차 전용) 등 차종에 최적화된 정비 프리셋이 기본 적용됩니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/04-schedule-ev.png" alt="정비 스케줄 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/04-schedule-ice.png" alt="정비 스케줄 (내연차)" width="375" />
</p>

### 5. 내역 (전기차 vs. 내연차)

주행 리포트, 충전/주유 로그, 정비 이력을 한곳에 모아 보여줍니다. 내연차는 풀탱크 기준 주유 연비(`km/L`)가 자동 계산되고, 전기차는 에너지 소모량 지표를 중심으로 내역을 표시합니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/05-history-ev.png" alt="내역 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/05-history-ice.png" alt="내역 (내연차)" width="375" />
</p>

### 6. 차량 관리 레벨 (전기차 vs. 내연차)

주유/충전 및 정비를 꾸준히 기록해 경험치를 모으고 차량 레벨을 올려 뱃지를 획득하는 화면입니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/07-level-ev.png" alt="차량 관리 레벨 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/07-level-ice.png" alt="차량 관리 레벨 (내연차)" width="375" />
</p>

### 7. 통계 & 리포트 내보내기 (전기차 vs. 내연차)

주행거리·비용·연비 통계 차트를 제공하며 1주/1달 단위 기간 필터링 및 주행·주유·정비 이력의 CSV/Excel 내보내기를 지원합니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/13-analytics-ev.png" alt="통계 & 리포트 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/13-analytics-ice.png" alt="통계 & 리포트 (내연차)" width="375" />
</p>

### 8. 주유소 & 충전소 찾기 (전기차 vs. 내연차)

오피넷 기반 주변 주유소, 천안사랑카드 가맹 주유소, 환경공단 EV 충전소 검색을 단일 메뉴에서 지도 번호 마커와 함께 거리순/가격순으로 제공합니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/14-stations-ev.png" alt="충전소 찾기 (전기차)" width="375" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/14-stations-ice.png" alt="주유소 찾기 (내연차)" width="375" />
</p>

### 9. 더보기 시트 메뉴 (관리 및 계정)

차량 등록/관리, 사용자 추가/수정, 연료타입별 정비 프리셋 설정, 지도/날씨/알림 API 연동, 백업/복원, 그리고 개인 프로필 변경 등 모든 관리용 설정 기능을 하단 네비게이션 시트에서 간편하게 사용할 수 있습니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/06-integrations.png" alt="API 연동" width="240" />
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/08-vehicles.png" alt="차량 관리" width="240" />
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/09-users.png" alt="사용자 관리" width="240" />
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/10-presets.png" alt="정비 프리셋" width="240" />
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/11-backup.png" alt="백업 및 복원" width="240" />
  <img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/12-profile.png" alt="프로필 설정" width="240" />
</p>

---

## 빠른 시작

### 1. 설치

**Proxmox (권장)**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/garage/master/proxmox/ct/garage.sh)"
```

완료 후 브라우저에서 `http://<LXC_IP>` 로 접속합니다.

**Docker Compose**

```sh
docker compose -f docker-compose.prod.yml up -d
```

시작 전에 `.env`에 `POSTGRES_PASSWORD`, `JWT_SECRET`을 설정하세요.

### 2. 최초 관리자 생성

신규 설치 시 사용자가 없으면 `/login`에 **최초 관리자 생성**이 표시됩니다.

1. `/login` 열기
2. 이름·이메일·비밀번호 입력
3. 제출 → `ADMIN`으로 로그인됨

이후 가족 구성원은 두 가지 방법으로 추가합니다.

- **본인이 직접 가입**: `/login`의 **회원가입**으로 신청 → 관리자가 **사용자 관리**의 *승인 대기* 목록에서 승인. 승인 전에는 로그인해도 안내 화면만 보이고 어떤 데이터에도 접근하지 못합니다.
- **관리자가 직접 생성**: **사용자 관리** → *구성원 추가*. 승인 절차 없이 바로 사용 가능하고 권한도 지정할 수 있습니다.

관리자는 사용자 관리 화면에서 권한(관리자/일반) 변경, 차량 배정, 비밀번호 초기화, 계정 삭제를 할 수 있습니다. 마지막 관리자를 강등·삭제하는 것은 앱이 잠기는 것을 막기 위해 차단됩니다.

### 3. 차량 등록

1. 하단 네비게이션 바 **더보기 시트** → **차량 관리**
2. 이름, 번호판, 제조사/모델/연식, **연료 타입** 입력
3. 저장

관리자뿐 아니라 일반 사용자도 자기 차량을 등록할 수 있습니다. 등록한 사람이 그 차량의 소유자가 되어 수정·삭제·공유를 할 수 있습니다. 한 차량을 여러 명이 함께 쓸 때는 **각자 등록하지 말고**(기록이 갈라집니다) 한 명이 등록한 뒤 차량 → 더보기 시트 → **차량 공유**에서 가족을 추가하세요. 위치(좌표·주행 경로) 열람은 공유와 별개로 사람마다 켜고 끌 수 있습니다.

해당 연료 타입 정비 프리셋과 행정·법정 스케줄(검사, 보험, 세금 등)이 자동으로 복사됩니다. 기본값은 더보기 시트 아래의 **정비 마스터 프리셋 관리**에서 수정합니다.

### 4. 일상 사용

| 할 일 | 위치 |
|---|---|
| 주유 / 정비 기록 | 하단 네비게이션 → **빠른 입력** |
| 주기 수정 | 차량 → **정비 스케줄** |
| 이력·연비·주행 | 차량 → **내역** |
| 통계 & 리포트 내보내기 | 차량 → **통계** |
| 주유소 / 충전소 찾기 | 차량 → **주유소/충전소** |
| OBD / Torque / REST 토큰 | 차량 → 톱니바퀴 → **OBD & GPS** |
| 가족 계정 | 하단 네비게이션 더보기 시트 → **사용자 관리** |
| 오피넷 / 지도 API 키 | 하단 네비게이션 더보기 시트 → **API 연동 관리** |
| 백업 / 복원 | 하단 네비게이션 더보기 시트 → **백업/복원** |

### 5. OBD / Home Assistant (요약)

Home Assistant는 [hass-garage](https://github.com/eigger/hass-garage) 커스텀 통합구성요소(HACS)로
YAML 편집 없이 화면에서 바로 연동할 수 있습니다 — 위치/RPM/속도/연료/주행거리를 자동 전송하고,
Garage가 계산한 마지막 위치·리마인더를 센서로 받아옵니다.

YAML로 직접 붙이고 싶다면 아래처럼 차량 `apiToken`으로 텔레메트리를 전송할 수도 있습니다(로그인 JWT 아님).

```http
POST /api/ingest/telemetry
Authorization: Bearer <apiToken>
Content-Type: application/json

{ "speed": 65, "lat": 37.56, "lon": 126.97, "odometer": 45230, "inVehicle": true }
```

`apiToken` 자체가 차량을 특정하므로 URL에 별도 `vehicleId`가 필요 없습니다.

주유·정비 기록 API는 [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md)를 참고하세요.  
수집 URL·토큰은 **차량 → OBD & GPS**에서 복사합니다.

---

## 프로젝트 구조

```
garage/
  apps/
    api/      # Fastify + Prisma
    web/      # Next.js App Router (PWA, 한/영)
  packages/
    shared/   # 공유 Zod 스키마 / 카탈로그
  docker-compose.yml / docker-compose.prod.yml
  Caddyfile
  proxmox/    # LXC 원클릭 설치
```

---

## 로컬 개발

```sh
npm install
cp .env.example .env   # POSTGRES_PASSWORD, JWT_SECRET 설정
docker compose up -d postgres
npm run prisma:migrate
npm run seed -w apps/api   # 부트스트랩 UI 대신 시드 관리자를 쓸 때
npm run dev:api            # :8080
npm run dev:web            # :3000
```

`http://localhost:3000/login` 으로 접속합니다.

유용한 스크립트: `npm run build`, `npm run test`, `npm run prisma:generate`.

---

## 운영 참고

- 구성: PostgreSQL 16 + API + Web + Caddy (`:80`)
- 프로덕션 compose에서 API 기동 시 `prisma migrate deploy` 실행
- 이미지: `ghcr.io/<owner>/garage-api` / `garage-web` (`latest` + semver)
- LXC 업데이트: 컨테이너에서 `update` (compose 이미지 pull)

### 업데이트 시 참고 (사용자 관리 개편)

이메일이 소문자로 정규화됩니다. **대소문자만 다른 계정이 두 개 이상 있으면** 마이그레이션이 다음 메시지와 함께 중단되고 API 컨테이너가 기동되지 않습니다(데이터는 변경되지 않고 그대로 롤백됩니다).

```
Cannot normalize emails to lowercase: these addresses exist more than once ignoring case (...)
```

해당 계정 중 하나를 지우거나 이메일을 바꾼 뒤, 실패로 표시된 마이그레이션을 되돌리고 다시 올리면 됩니다.

```bash
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate resolve --rolled-back 20260806230000_user_management_lifecycle --schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts
```

그 외에는 별도 조치가 필요 없습니다 — 기존 계정은 전부 **사용 중(ACTIVE)** 상태로 유지되고, 로그인 세션도 끊기지 않습니다. 기존 차량은 등록자 정보가 없으므로 종전과 동일하게 관리자만 수정·삭제할 수 있습니다.

---

## CI/CD

| 워크플로 | 트리거 | 목적 |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | `master` Push / PR | 설치·빌드·테스트, 마이그레이션 검증 |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release | GHCR 이미지 푸시 |

### 마이그레이션 검증 (`migrations` 잡)

프로덕션 compose가 `prisma migrate deploy && node ...`로 기동하는 구조라, 마이그레이션이 실패하면 API 컨테이너가 아예 뜨지 않습니다. 그래서 매 PR마다 [`scripts/ci/check-migrations.sh`](./scripts/ci/check-migrations.sh)가 두 가지를 자동 확인합니다.

1. **신규 설치** — 빈 DB에 전체 마이그레이션을 적용하고, 그 결과가 `schema.prisma`와 일치하는지 확인합니다(드리프트 검출). `schema.prisma`만 고치고 마이그레이션을 만들지 않은 경우를 잡습니다.
2. **업그레이드** — 직전 릴리스 태그의 마이그레이션만 적용한 DB에 [기존 운영 데이터를 흉내낸 행](./scripts/ci/legacy-fixture.sql)을 넣고, 이번 변경의 마이그레이션을 그 위에 적용합니다. 빈 DB에서는 통과하지만 기존 데이터가 있으면 제약 위반으로 실패하는 마이그레이션을 잡습니다.

로컬에서도 같은 검사를 돌릴 수 있습니다.

```bash
DATABASE_URL_BASE=postgresql://garage:<password>@localhost:5432 PG_CONTAINER=garage-postgres-1 scripts/ci/check-migrations.sh
```

`User`/`Vehicle`의 필수 컬럼이 바뀌면 `scripts/ci/legacy-fixture.sql`도 함께 갱신해야 합니다(픽스처 삽입이 실패하면 그 사실을 알려줍니다).

---

## 라이선스

MIT. [LICENSE](./LICENSE) 참고.
