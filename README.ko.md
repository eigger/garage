# Garage

[![CI](https://github.com/eigger/garage/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/garage/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/garage/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/garage/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/garage)](https://github.com/eigger/garage/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/garage.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fgarage-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/garage/pkgs/container/garage-api)

**[English README](./README.md)**

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
- 전기차 충전소 찾기(한국환경공단 API, 선택) — 주유소와 마찬가지로 거리순/가격순 검색, 지도에 번호 마커로 표시
- OBD 수집(Torque Pro), REST/WebSocket 텔레메트리, 자동 트립 분할
- 주행 리포트, 경로 지도 (OSM / 카카오 / 네이버 / T맵) 및 진행 방향 화살표, 주행 개별 메모 추가/편집 및 역지오코딩
- 대시보드 알림 배지 및 차량 요약 카드 (최근 주유 비용 포함)
- 차량별 관리 레벨·뱃지(게이미피케이션) 전용 화면
- 네비게이션 구조 단일화 (상단 헤더 제거 및 버전 표시 더보기 시트 이동)
- 관리자 백업/복원, PWA, 한/영 i18n
- 사용자 없을 때 최초 관리자 부트스트랩

---

## 스크린샷 & 사용 방법

### 1. 대시보드

로그인 후 홈 화면입니다. 등록된 차량이 1대뿐인 경우 이 화면을 건너뛰고 차량 개요 페이지로 자동 이동합니다. 차량이 여러 대인 경우에는 통합 대시보드가 표시되어 각 차량 카드에서 현재 주행거리, 최근 주행 거리, 최근 주유 비용, 지남/임박 알림 건수를 볼 수 있습니다. 하단 네비게이션 바를 통해 홈, 빠른 입력, 그리고 관리용 설정 항목이 포함된 **더보기** 시트에 빠르게 접근할 수 있습니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/01-dashboard.png" alt="대시보드" width="960" />

### 2. 차량 개요

차량별 허브입니다. 최근 주유 비용을 포함한 요약 카드, 월간 비용 차트, 지도 옆에 표시되는 마지막 주행 정보 패널(시간, 거리, 속도, 소모량, 메모 등), 그리고 **개요 / 정비 스케줄 / 내역** 탭이 제공됩니다. 마지막 주행 위치 지도 바로 아래에서 주변 주유소/충전소를 거리순·가격순으로 찾아 네비게이션 앱으로 바로 연동할 수 있습니다. 톱니바퀴 아이콘에서 차량 설정과 OBD/GPS를 열 수 있습니다. 기존의 상단 헤더 바가 하단 네비게이션 구조로 단일화되었으며, 관리 기능은 하단 네비게이션의 **더보기** 시트 안에 깔끔하게 모여 있습니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/02-vehicle.png" alt="차량 개요" width="960" />

### 3. 빠른 입력

화면 하단 네비게이션 바의 가장 직관적이고 두드러진 중앙 버튼을 누르면 언제든지 주유·정비를 바로 기록할 수 있는 팝업/페이지가 열립니다. 주유 탭은 주변 주유소 검색, 단가, 리터, 금액 단축 버튼, 영수증 첨부를 지원합니다. **정비** 탭에서는 정비 스케줄 항목과 연결된 정비 기록을 손쉽게 남길 수 있습니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/03-quick-log.png" alt="빠른 입력" width="960" />

### 4. 정비 스케줄

거리·시간 기준 정비/행정 항목(엔진오일, 검사, 보험, 세금 등)을 관리합니다. 주기를 수정하고, 완료 처리하며, 알림에서 빠른 입력으로 바로 이동할 수 있습니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/04-schedule.png" alt="정비 스케줄" width="960" />

### 5. 내역

주행·주유·정비 이력을 한곳에서 모아 봅니다. 만탱크 주유 사이의 연비(`km/L`, `L/100km`)와 주행 리포트가 자동으로 계산되며, 개별 주행 기록에 메모를 추가하거나 편집할 수 있습니다. 또한, 각 목록의 수정/삭제 버튼을 더 작고 직관적인 아웃라인 스타일로 단정하게 개선했습니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/05-history.png" alt="내역" width="960" />

### 6. API 연동 관리

오피넷, 전기차 충전소(한국환경공단), 카카오맵, 네이버 지도, T맵 키를 관리하는 관리자 화면입니다. **연료·충전 / 지도 / 알림**으로 성격이 비슷한 연동끼리 묶여 있습니다. 하단 네비게이션 바의 **더보기** 시트를 통해 진입할 수 있으며, 설정값은 저장 즉시 적용되며(재시작 불필요), 백업 파일에는 포함되지 않습니다. 전기차 충전소 API 키는 data.go.kr 특성상 2년 후 자동 만료되는데, 만료일을 입력해두면 30일 전부터 경고가 표시됩니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/06-integrations.png" alt="API 연동 관리" width="960" />

### 7. 차량 관리 레벨

주유·정비를 꾸준히 기록할수록 레벨이 오르고 뱃지를 획득하는 게이미피케이션 화면입니다. 차량별로 독립적으로 집계되며, 하단 네비게이션의 **더보기** 시트 → 해당 차량 메뉴에서 진입합니다.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/ko/07-level.png" alt="차량 관리 레벨" width="960" />

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

공개 회원가입은 없습니다. 이후 계정은 관리자가 **사용자 관리**에서만 만듭니다.

### 3. 차량 등록

1. 하단 네비게이션 바 **더보기 시트** → **차량 관리**
2. 이름, 번호판, 제조사/모델/연식, **연료 타입** 입력
3. 저장

해당 연료 타입 정비 프리셋과 행정·법정 스케줄(검사, 보험, 세금 등)이 자동으로 복사됩니다. 기본값은 더보기 시트 아래의 **정비 마스터 프리셋 관리**에서 수정합니다.

### 4. 일상 사용

| 할 일 | 위치 |
|---|---|
| 주유 / 정비 기록 | 하단 네비게이션 → **빠른 입력** |
| 주기 수정 | 차량 → **정비 스케줄** |
| 이력·연비·주행 | 차량 → **내역** |
| OBD / Torque / REST 토큰 | 차량 → 톱니바퀴 → **OBD & GPS** |
| 가족 계정 | 하단 네비게이션 더보기 시트 → **사용자 관리** |
| 오피넷 / 지도 API 키 | 하단 네비게이션 더보기 시트 → **API 연동 관리** |
| 백업 / 복원 | 하단 네비게이션 더보기 시트 → **백업/복원** |

### 5. OBD / Home Assistant (요약)

텔레메트리는 로그인 JWT가 아니라 차량 `apiToken`을 사용합니다.

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

---

## CI/CD

| 워크플로 | 트리거 | 목적 |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | `master` Push / PR | 설치·빌드·테스트 |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release | GHCR 이미지 푸시 |

---

## 라이선스

MIT. [LICENSE](./LICENSE) 참고.
