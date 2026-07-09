# Garage — 차량관리 통합 셀프호스트 서버 아키텍처 검토

프로젝트/GitHub 리포지토리명은 **garage**로 확정한다. 짧고 직관적이며 도메인(garage.내도메인.com)과 npm 워크스페이스 패키지명에도 그대로 쓰기 좋다.

```
garage/
  apps/
    api/      # Node.js + TypeScript 백엔드
    web/      # Next.js 프론트엔드
  packages/
    shared/   # 공유 타입, Zod 스키마
  docker-compose.yml
```

## 1. 요구사항 요약

- 대상: 가족/개인 다수 차량 (2~5대), 사용자별로 접근 가능한 차량이 다를 수 있음
- 기능: 정비/소모품 관리, 주유 관리, 주행 관리(OBD, GPS)
- 데이터 소스: OBD 동글 + 스마트폰 앱(Torque, Car Scanner 등), 전용 GPS/OBD 로거 장치 — 둘 다 지원
- 배포: 홈서버(Docker) + 기존 셀프호스팅 인프라(Home Assistant, Node-RED 등)와 연동
- 기술 스택: ML/예측 기능은 범위 밖(정비는 예방정비, 연비는 이력 집계)이며 배포·관리 편의성과 사용자 경험을 우선시하므로 Node.js/TypeScript 풀스택으로 확정

전체 구조는 아래 다이어그램과 같이 4단계로 나뉜다. 회색 박스는 외부와 맞닿는 경계 지점(입력/출력), 청록색 박스는 자체 구축하는 핵심 서버 구성요소다.

## 2. 확정된 기능 요구사항

**정비/소모품 관리**: 엔진오일/필터, 타이어/브레이크, 배터리·와이퍼 등 기타 소모품, 법정검사·보험·자동차세 갱신일까지 전 항목을 대상으로 한다. 리마인더는 주행거리 기준과 기간(날짜) 기준을 함께 두고 둘 중 먼저 도래하는 시점에 알린다(예: 엔진오일은 5,000km 또는 6개월 중 먼저 오는 조건).

**주유 관리**: 기본 기록(리터/금액/주행거리)에 더해 주유 기록 간 구간 연비 자동 계산, 가족 구성원별 유류비 분담/정산, 영수증 사진 첨부까지 포함한다.

**주행 관리(OBD/GPS)**: 트립 이력(경로·거리·소요시간) 기록, 실시간 위치 확인(차량 찾기), 운전 습관 점수(급제동/급가속/과속), 업무용·개인용 트립 구분(세금/정산용 태깅)까지 전 범위를 대상으로 한다. 단, 한 차량을 여러 명이 운전하는 경우의 운전자 구분은 필요 없다 — 모든 기록은 차량 단위로만 관리한다. 실시간 위치 확인 권한은 전원 공통이 아니라 관리자가 사용자·차량별로 개별 지정한다(예: 부모는 자녀 차량 위치를 볼 수 있지만 자녀는 부모 차량 위치를 못 보게 하는 식의 비대칭 설정 가능).

**사용자 권한**: 관리자/일반 2단계로 구성한다. 관리자는 모든 차량을 수정·삭제할 수 있고, 일반 사용자는 `user_vehicle_access`로 지정된 본인 담당 차량만 입력·조회할 수 있다. 실시간 위치 열람 권한은 이 접근권한과 별개 플래그로 관리자가 따로 켜고 끈다.

**데이터 보존**: 원시 GPS/OBD 텔레메트리(`telemetry_raw`)는 1년치만 보관하고 그 이후는 주기적으로 삭제한다. 트립·정비·주유 등 집계/이력 데이터는 보존 기간 제한 없이 계속 유지한다.

**알림**: 별도 푸시 시스템(ntfy 등)은 구축하지 않는다. 정비일·연료 부족 같은 알림은 웹 대시보드 내 배지/목록으로 확인하는 것을 기본으로 하고, 같은 데이터를 MQTT로 Home Assistant에 노출해 필요하면 사용자가 HA 쪽에서 자체적으로 푸시 자동화를 구성할 수 있게만 열어둔다.

**서류 보관**: 정비 견적서, 영수증, 보험증권 등은 사진/PDF 형태로 각 기록에 첨부해 함께 보관한다.

## 3. 데이터 흐름

**입력 → 수집 게이트웨이 → 핵심 서버 → 활용/연동** 순으로 흐른다.

- OBD 앱(Torque Pro 등)은 대부분 "Upload URL" 기능으로 주행 중 주기적으로 GET/POST 요청을 보낼 수 있다. 백엔드(Node.js)에 `/ingest/obd` 엔드포인트를 만들어 받으면 된다.
- 전용 GPS/OBD 로거(텔레매틱스 하드웨어)는 제조사마다 통신 프로토콜이 다르다. 이런 장치를 쓸 계획이 있다면 직접 프로토콜을 구현하기보다 오픈소스 GPS 추적 서버인 **Traccar**를 게이트웨이 앞단에 두는 것을 추천한다. Traccar는 200개 이상의 장치 프로토콜을 이미 지원하고, 표준화된 API/웹훅으로 위치·속도 데이터를 넘겨준다.
- 두 경로 모두 정규화된 이벤트로 변환되어 MQTT 토픽(`car/{vehicle_id}/telemetry`)에 발행되고, 동시에 Postgres에 원시 텔레메트리로 적재된다. MQTT를 쓰는 이유는 Home Assistant/Node-RED와 별도 연동 코드 없이 바로 붙기 때문이고, Node.js의 mqtt.js는 비동기 네이티브라 이 수집 경로와 궁합이 좋다.
- 백엔드(Node.js)는 주기적으로 원시 텔레메트리를 스캔해 트립(주행 단위)을 구성하고, 주행거리 기준으로 소모품 수명과 정비 리마인더를 계산한다. 둘 다 임계값 비교/집계 수준의 로직이라 별도 분석 라이브러리 없이 처리 가능하다.
- 계산 결과는 웹 대시보드의 배지/목록으로 바로 노출되는 것을 기본으로 하고, 동시에 MQTT로도 발행해 Home Assistant에서 센서로 노출되거나 필요 시 자체 알림 자동화에 활용할 수 있게 한다.

## 4. 데이터 모델 (핵심 테이블)

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `users` | id, name, role(admin/general), email | 가족 구성원 계정, 2단계 권한 |
| `vehicles` | id, name, plate, make, model, year, vin | 차량 기본 정보 |
| `user_vehicle_access` | user_id, vehicle_id, can_view_location | 일반 사용자의 담당 차량 지정(관리자는 전체 접근이라 별도 행 불필요). `can_view_location`은 실시간 위치 열람 여부를 관리자가 개별 지정 |
| `telemetry_raw` (하이퍼테이블) | time, vehicle_id, trip_id, source, lat, lon, speed, rpm, fuel_level, dtc_codes | OBD/GPS 원시 데이터, TimescaleDB 하이퍼테이블. `trip_id`는 트립 종료 시점에 채워짐 |
| `trips` | id, vehicle_id, start_time, end_time, distance_km, avg_speed, idle_time, purpose(business/personal), route_polyline | 텔레메트리에서 파생된 주행 단위, 업무/개인 태깅 포함. `route_polyline`은 지도 표시용으로 압축 인코딩한 경로 |
| `fuel_logs` | id, vehicle_id, user_id, date, odometer, liters, cost, full_tank | 주유 기록, `user_id`는 유류비 분담 정산용 |
| `maintenance_records` | id, vehicle_id, date, odometer, type, cost, shop, notes | 정비 이력 |
| `consumable_parts` | id, vehicle_id, part_type, installed_date, installed_odometer, expected_life_km, expected_life_months | 소모품 수명 추적, 거리·기간 이중 기준 |
| `reminders` | id, vehicle_id, type, due_date, due_odometer, status | 거리·기간 중 먼저 도래하는 조건으로 계산되는 정비/소모품 알림 |
| `attachments` | id, related_table, related_id, file_path, mime_type, uploaded_at | 영수증/보험증권/견적서 등 사진·PDF 첨부, `fuel_logs`/`maintenance_records`에 다대일 연결 |

`telemetry_raw`만 시계열 전용 테이블이고 나머지는 일반 관계형 테이블이다. 데이터량이 많지 않은 가정용 규모(차량 5대 이하, 주행 중에만 GPS 핑 수집)에서는 연간 데이터량이 수 GB 수준이라 TimescaleDB 없이 일반 Postgres + 월별 파티셔닝으로도 충분하다. TimescaleDB는 연속 집계(continuous aggregate)로 "이번 달 연비 추이" 같은 쿼리를 쉽게 만들어주는 편의 기능 정도로 보면 된다. 첨부 파일 실물은 DB가 아니라 파일시스템 볼륨(또는 추후 MinIO 등 오브젝트 스토리지)에 저장하고, `attachments.file_path`는 경로만 참조한다. `telemetry_raw`는 매일 밤 배치 작업으로 1년이 지난 행을 삭제하는 보존 정책을 둔다(TimescaleDB를 쓰면 `drop_chunks`로 한 줄이면 되고, 일반 Postgres여도 날짜 조건 DELETE 쿼리로 충분하다).

## 5. 기술 스택 추천 (Node.js/TypeScript 풀스택 확정)

ML/예측 기능이 범위 밖이고 배포·관리 편의성과 사용자 경험이 우선이므로, 프론트엔드와 백엔드를 하나의 언어·툴체인(npm)으로 통일한다. 가족 규모(차량 2~5대)에 맞춰 과도한 엔지니어링은 배제한다.

- **백엔드**: Node.js + TypeScript (Fastify 또는 NestJS). Zod로 OBD/GPS 페이로드 검증. mqtt.js가 비동기 네이티브라 MQTT 수집 경로와 궁합이 좋다.
- **프론트엔드**: Next.js(React) 기반 SPA로 정비/주유 기록 입력 폼과 차량별 대시보드 구성. 백엔드와 TypeScript 타입/Zod 스키마를 그대로 공유해 API 계약 불일치를 줄인다.
- **DB**: PostgreSQL 16 (+ TimescaleDB 확장은 선택 사항, 데이터량이 늘면 나중에 추가). Prisma 또는 Drizzle ORM.
- **작업 스케줄러**: 백엔드 프로세스 안에 내장한 cron(node-cron) 또는 BullMQ. 소모품 수명·리마인더 계산은 임계값 비교 수준이라 무거운 큐 시스템 없이도 충분하다. 작업량이 늘면 BullMQ + Redis 워커로 분리한다.
- **MQTT 브로커**: Eclipse Mosquitto — Home Assistant와 그대로 공유 가능.
- **GPS 프로토콜 게이트웨이**: Traccar — 전용 하드웨어 로거를 실제로 쓰기 시작할 때만 추가. OBD 앱 + 폰 GPS만 쓴다면 처음부터 넣지 않아도 된다.
- **외부 노출**: Cloudflare Tunnel로 외부 접근을 연결할 예정이므로 서버 자체는 포트포워딩 없이 내부 HTTP로만 구성한다. TLS 종료는 Cloudflare가 담당하고, 내부 리버스 프록시(Caddy 등)는 HTTP로 `api`/`frontend`에 라우팅만 하면 된다.
- **리버스 프록시**: Caddy — 설정이 짧다. 이미 Traefik을 쓰고 있다면 그걸 그대로 써도 무방하다. Cloudflare Tunnel을 쓰므로 Caddy의 자동 HTTPS 기능은 필요 없고 HTTP 라우팅 용도로만 쓴다.
- **인증**: 가족 구성원 몇 명 수준이면 백엔드 자체 JWT 인증(Auth.js 등) + 차량별 접근 ACL로 충분하다. 기존에 Authentik/Authelia로 SSO를 구성해뒀다면 forward-auth로 붙이는 것도 가능하다.
- **배포**: 프론트·백엔드 모두 Node.js 런타임이라 Docker 이미지 하나의 베이스(node:20-alpine)로 통일 가능하고, npm 워크스페이스(모노레포)로 한 저장소에서 관리하면 배포 파이프라인이 단순해진다.
- **파일 첨부**: 영수증/서류 사진·PDF는 Docker 볼륨에 마운트한 업로드 디렉터리에 저장하고 `attachments` 테이블은 경로만 관리한다. 이미지 축소는 sharp 라이브러리로 처리. 저장 용량이 부담되면 나중에 MinIO(S3 호환) 컨테이너로 교체 가능.
- **백업**: 매일 밤 `pg_dump` + restic으로 NAS나 외부 스토리지에 백업. 첨부 파일 볼륨도 같은 백업 대상에 포함.

나중에 정말 예측형 기능(운행 패턴 기반 소모품 마모 예측 등)이 필요해지면, 전체를 Python으로 바꾸는 대신 그 기능만 담당하는 별도 Python 서비스를 붙이는 쪽을 추천한다.

## 6. 알림 및 Home Assistant 연동

- 알림의 1차 채널은 웹 대시보드다. 정비 임박·연료 부족 같은 항목은 로그인 시 배지/목록으로 바로 보이면 되고, 별도 푸시 인프라(ntfy 등)는 만들지 않는다.
- 같은 계산 결과(차량별 최신 주행거리, 연료 잔량, 다음 정비까지 남은 거리)를 MQTT discovery 형식으로도 발행해두면 Home Assistant가 자동으로 센서 엔티티를 생성한다. 폰 푸시가 필요해지면 이 데이터를 HA 쪽 자동화(또는 Node-RED)에서 알아서 가져다 쓸 수 있다 — 우리 서버는 데이터만 내보내고, 푸시 로직은 이미 갖춰진 HA 생태계에 맡긴다.
- 이렇게 나누면 알림 시스템을 이중으로 구축하지 않고도 "지금 당장은 대시보드만, 나중에 필요하면 HA로 확장"이 자연스럽게 된다.

## 7. 배포 구성 (Docker Compose 스켈레톤)

```yaml
services:
  postgres:
    image: postgres:16-alpine   # 나중에 timescale/timescaledb:latest-pg16 으로 교체 가능
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine   # BullMQ로 작업 분리할 때만 사용

  mosquitto:
    image: eclipse-mosquitto:2
    volumes: ["./mosquitto:/mosquitto/config"]

  # 전용 GPS/OBD 하드웨어를 실제로 쓸 때만 추가
  traccar:
    image: traccar/traccar:latest
    ports: ["5000-5150:5000-5150"]

  api:
    build: ./backend      # Node.js + TypeScript (Fastify/NestJS)
    depends_on: [postgres, mosquitto]
    volumes: ["uploads:/app/uploads"]   # 영수증/서류 첨부 파일
    environment:
      DATABASE_URL: postgresql://...
      MQTT_BROKER: mosquitto

  frontend:
    build: ./frontend     # Next.js
    depends_on: [api]

  caddy:
    image: caddy:2
    ports: ["80:80"]      # 내부 HTTP 라우팅만, TLS는 Cloudflare Tunnel이 담당
    depends_on: [api, frontend]

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ...
    depends_on: [caddy]
```

`api`와 `frontend`는 npm 워크스페이스 모노레포로 관리하고, 같은 `node:20-alpine` 베이스 이미지를 공유하면 빌드/배포 파이프라인이 단순해진다. 리마인더 계산 같은 백그라운드 작업은 처음엔 `api` 프로세스 안의 cron으로 돌리다가 부하가 늘면 BullMQ + Redis 워커로 분리한다.

## 8. 단계별 구축 로드맵

1. **1단계 (MVP)**: 차량/사용자 CRUD(관리자/일반 권한 포함), 주유·정비 수기 입력 + 영수증 첨부, 소모품 등록, 거리·기간 이중 기준 리마인더, 대시보드 배지 알림, 기본 웹 UI.
2. **2단계**: OBD 앱 웹훅 연동으로 주행거리·연료 자동 반영, GPS 기반 트립 자동 기록(업무/개인 태깅 포함), 기간별 주행 리포트(거리/시간/트립 수 집계).
3. **3단계**: 지도 API(네이버/카카오) 연동으로 트립 경로 시각화, 운전 습관 점수 계산, 전용 GPS/OBD 로거 + Traccar 연동, Home Assistant MQTT 센서 노출.
4. **4단계**: Grafana 기반 비용/연비 분석 대시보드, 가족 구성원별 유류비 정산 리포트 고도화.

처음부터 4단계를 한 번에 설계하지 말고 1단계부터 실제로 써보면서 필요한 만큼만 확장하는 방식을 권한다. 특히 Traccar와 BullMQ+Redis는 "필요해지면 추가하는" 컴포넌트로 남겨두는 게 유지보수 부담을 줄인다.

## 9. 주요 트레이드오프

- **Node.js vs Python(FastAPI)**: 정비는 예방정비(임계값 비교), 연비는 이력 집계라 ML이 필요 없어 Python 데이터 분석 생태계의 이점이 실효성이 없다. 반면 Next.js 프론트엔드와 언어·타입을 통일하고 배포 파이프라인을 하나로 묶을 수 있는 Node.js 쪽이 관리 편의성 우선순위에 더 맞는다. 나중에 예측형 기능이 필요해지면 그 기능만 담당하는 별도 Python 서비스를 추가하는 쪽을 추천한다.
- **TimescaleDB vs 일반 Postgres**: 데이터량이 가정용 규모에서는 크지 않아 처음엔 일반 Postgres로 시작하고, 나중에 시계열 쿼리가 느려지면 TimescaleDB 확장을 붙이는 순서를 추천한다. 애초에 하이퍼테이블로 설계해두면 확장은 SQL 한 줄이다.
- **Traccar 필요 여부**: OBD 앱 + 스마트폰 GPS만 쓴다면 불필요한 구성요소다. 상시 전원 연결형 전용 트래커(예: 텔레매틱스 장치)를 실제로 도입할 때만 추가한다.
- **BullMQ+Redis vs 내장 cron**: 가족 규모에서는 내장 cron으로 충분하다. 처리할 트립/알림 작업이 늘어나 지연이 생기면 그때 BullMQ + Redis 큐로 분리한다.
- **자체 프론트엔드 vs HA Lovelace/Grafana 활용**: 정비/주유 기록 입력 같은 CRUD 폼은 자체 UI가 필요하지만, 추이 분석은 Grafana로 대체하면 개발 시간을 크게 아낄 수 있다.
- **자체 푸시 시스템 미구축**: ntfy 등 별도 알림 서버를 두지 않기로 하면서 "지금 당장 폰 푸시가 꼭 필요한가"를 미리 점검해야 한다. 대시보드를 자주 확인하지 않는 가족 구성원이 있다면 1단계부터 HA 알림 연동을 앞당기는 것도 고려할 만하다.

## 10. 주행 리포트 및 지도 연동

둘 다 가능하고, 이미 설계된 `trips`/`telemetry_raw` 구조 위에 얹으면 된다.

**주행 리포트**: 일/주/월 단위 총 주행거리, 총 운행시간, 트립 수, 평균 속도, 업무/개인 비중 같은 지표는 `trips` 테이블을 기간·차량별로 group by 집계하면 되는 수준이라 별도 분석 엔진 없이 일반 SQL로 충분하다. 프론트엔드에서는 표/차트(Chart.js 등)로 보여주면 된다.

**GPS 경로 요약**: 트립이 끝나는 시점에 해당 시간대의 `telemetry_raw` 포인트들을 모아 경로를 하나의 폴리라인으로 압축 인코딩해서 `trips.route_polyline`에 저장해두는 방식을 추천한다(구글 폴리라인 인코딩, npm `@mapbox/polyline` 등으로 처리). 이렇게 하면 리포트/지도를 열 때마다 원시 텔레메트리를 다시 훑지 않아도 되고 저장 공간도 절약된다. 재생(리플레이)처럼 시간 흐름에 따른 상세 궤적이 필요해지면 `telemetry_raw.trip_id`로 원본 포인트를 그대로 조회할 수 있다.

**지도 API 연동**: 네이버 지도(NCP Maps)와 카카오맵 둘 다 JS SDK로 지도 위에 폴리라인·마커를 그리는 기능을 기본 제공해서, 나중에 API 키를 발급받아 프론트엔드에 스크립트만 추가하면 된다. 두 서비스 모두 콘솔에서 사용할 도메인(홈서버 도메인)을 등록해야 키가 정상 동작한다. 좌표를 "출발: OO동 ~ 도착: XX동" 같은 주소로 바꿔 보여주고 싶다면 리버스 지오코딩 REST API를 쓰면 되는데, 이건 키 노출을 막기 위해 프론트에서 직접 부르지 말고 백엔드가 프록시해서 호출하고 결과를 캐싱하는 걸 추천한다(가정용 호출량이면 무료 티어로 충분할 것으로 보인다). 나중에 두 업체 중 무엇을 쓸지, 혹은 둘 다 옵션으로 둘지 바꿀 수 있도록 지도 렌더링 부분만 별도 컴포넌트로 분리해두면 교체 부담이 적다.

## 11. 정비 항목 카탈로그와 i18n

정비·행정 스케줄 항목명은 DB에 **catalog key** 문자열(예: `engineOilFilter`, `autoInsuranceRenewal`)로 저장한다. 표시 문구는 `@garage/shared` 카탈로그가 단일 진실 공급원이다.

```
packages/shared/src/catalog/
  maintenanceItems.ts   # 정비 항목 key + legacyKo + ko/en labels
  adminItems.ts         # 행정·법정 항목
  recordTypes.ts        # 특수 기록 유형 (주행거리 기록 등)
  presetDefs.ts         # 연료타입별 마스터 프리셋 기본값
  resolve.ts            # resolveCatalogKey, formatStoredItemLabel, buildCatalogTranslationMap
```

**표시 흐름**

1. DB에서 `partType` / `type` / `preset.name` 문자열을 읽는다.
2. `resolveCatalogKey(stored)`로 catalog key를 찾는다 (key 직접 저장 또는 legacy 한글 역매핑).
3. 웹 UI는 `formatItemLabel(t, stored)` → `translations`의 `item*` / `admin*` / `record*` 키로 렌더링한다.
4. 카탈로그에 없는 **사용자 직접 입력** 항목(예: `사고 수리`)은 저장 문자열을 그대로 표시한다.

**번역 키 규칙**

| 접두어 | 예시 | 용도 |
|---|---|---|
| (없음) | `loginButton` | UI 고정 문구 |
| `item` | `itemEngineOilFilter` | 정비 카탈로그 |
| `admin` | `adminVehicleInspection` | 행정·법정 카탈로그 |
| `record` | `recordOdometerLog` | 특수 기록 유형 |

`translations.ts`의 카탈로그 라벨은 `buildCatalogTranslationMap()`에서 병합하므로, 항목 추가 시 카탈로그 `labels`만 수정하면 웹·푸시 알림이 함께 맞춰진다.

**푸시 알림**: `PushSubscription.locale`에 구독 시점의 UI 언어를 저장하고, 서버가 `buildReminderPushMessage()`로 기기별 문구를 생성한다.

**마스터 프리셋 UI**: 시스템 항목은 카탈로그에서 선택(이름은 key로 고정), 관리자 전용 커스텀 항목만 자유 입력한다.
