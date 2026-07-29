# API 연동

Garage가 사용하거나 노출하는 모든 외부 서비스·기기 연동을 정리한 문서입니다.
구현 상태는 현재 소스 트리 기준입니다. 관리자 UI(`/integrations`)에서 관리하는 키는 `packages/shared/src/schemas/settings.ts`의 `settingKeySchema` 화이트리스트와 동기화되어 있습니다.

## 요약

| 연동 | 방향 | 상태 | 설정 | 용도 |
|---|---|---|---|---|
| [오피넷](#1-오피넷opinet-주유소-가격-api) | Garage → 외부 | **사용 가능** | `/integrations` 또는 `OPINET_API_KEY` | 주변 주유소 및 가격 |
| [전기차 충전소(한국환경공단)](#14-전기차-충전소-api-한국환경공단-evcharger) | Garage → 외부 | **사용 가능** | `/integrations` 또는 `EV_CHARGER_API_KEY` | 주변 충전소, 실시간 상태, 커넥터 타입 |
| [OBD 앱(Torque Pro)](#2-obd-앱torque-pro) | 외부 → Garage | **사용 가능** | 차량별 `apiToken` | OBD/GPS 텔레메트리 수집 |
| [REST 텔레메트리](#3-rest-텔레메트리-수집) | 외부 ↔ Garage | **사용 가능** | 차량별 `apiToken` | HA / 범용 JSON 수집 + 상태·리마인더 조회 |
| [WebSocket 텔레메트리](#4-websocket-실시간-스트림) | Garage → 클라이언트 | **사용 가능** | 차량별 `apiToken` | 실시간 위치·상태 |
| [MQTT(Mosquitto)](#5-mqttmosquitto--home-assistant) | Garage → 외부 | 코드 준비됨 | `MQTT_URL` + Compose | HA / Node-RED |
| [GitHub Releases](#6-github-releases업데이트-확인) | Garage → 외부 | **사용 가능** | (없음) | `/health` 업데이트 알림 |
| [Cloudflare Tunnel](#7-cloudflare-tunnel) | 인프라 | 계획됨 | `CLOUDFLARE_TUNNEL_TOKEN` | 포트포워딩 없는 원격 HTTPS 접속 |
| [Traccar](#8-traccargpsobd-하드웨어) | 외부 → Garage | 계획됨 | Compose 서비스 | 전용 GPS/OBD 로거 |
| [지도 제공자(OSM/카카오/네이버/티맵)](#9-지도-제공자-osm--카카오--네이버--티맵) | Garage → 외부(선택) | **사용 가능** | 카카오/네이버/티맵은 `/integrations`에서 | 주행 경로 시각화 |
| [내비게이션 딥링크](#10-내비게이션-딥링크-티맵--카카오--네이버) | Garage → 모바일 앱 | **사용 가능** | (없음) | 저장된 주유 위치로 티맵/카카오/네이버 내비 열기 |
| [차량 기록 REST API](#11-차량-기록-rest-api-주유--정비) | 외부 → Garage | **사용 가능** | Garage 사용자 JWT(`/api/auth/login`) | 주유 기록, 정비 기록, 주행거리 부수효과 |
| [PWA 웹 푸시](#12-pwa-웹-푸시) | Garage → 클라이언트 | **사용 가능** | `VAPID_*` 환경변수 | 정비/행정 예정 리마인더 알림 |
| [API 익스플로러](#13-api-익스플로러) | (개발자 도구) | **사용 가능** | ADMIN 로그인 | 웹 UI에서 모든 REST 엔드포인트 탐색·테스트 |
| [현대 Developers(블루링크)](#15-현대-developers커넥티드카-api) | 외부 → Garage | 규격서 기준 구현 완료, 실제 검증 전 | `/integrations`(`HYUNDAI_CLIENT_ID`/`_SECRET`) | 주행거리, EV 배터리/충전, 경고등 — OBD 동글 불필요 |

---

## 연동 키 관리 방식

### 관리자 UI (`/integrations`)

- **접근**: ADMIN만 가능
- **API**: `GET/PUT/DELETE /api/settings` (`apps/api/src/routes/settings.ts`)
- **저장소**: PostgreSQL `Setting` 테이블
- **우선순위**: DB 값 → `.env` / docker-compose 환경변수 폴백 (`getSetting()`)
- **보안**: 평문 키는 절대 응답에 포함되지 않음(마스킹만 반환). **백업 파일에서 제외**

### 차량별 API 토큰 (`apiToken`)

- **발급**: 차량 등록 시 자동 생성 (UUID)
- **관리**: ADMIN만 조회·재발급 가능 (`POST /api/vehicles/:id/token/reset`)
- **UI**: 웹 **차량 상세 → OBD & GPS** (`/vehicles/[id]/integration`)
- **용도**: 로그인 없이 텔레메트리를 수집할 때 쓰는 인증 정보 — OBD 앱, Home Assistant, 스크립트 등에서 사용

---

## 1. 오피넷(Opinet) 주유소 가격 API

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능 (실제 API로 검증됨) |
| 설정 키 | `OPINET_API_KEY` |
| 설정 위치 | `/integrations` UI 또는 `.env` / `docker-compose` |
| 발급처 | [www.opinet.co.kr](https://www.opinet.co.kr) 오픈 API |
| 구현 | `apps/api/src/routes/opinet.ts` |

### Garage가 호출하는 외부 API

```
GET https://www.opinet.co.kr/api/aroundAll.do
  ?code={OPINET_API_KEY}
  &out=json
  &x={KATEC_X}&y={KATEC_Y}
  &radius=5000
  &prodcd={B027|D047|K015}
  &sort={1=가격순, 2=거리순}
```

- 좌표: 브라우저 GPS(WGS84) → KATEC 변환 (`proj4`)
- 연료 코드: `GASOLINE`→`B027`, `DIESEL`→`D047`, `LPG`→`K015`, `ELECTRIC`→건너뜀(빈 배열)
- `sort`는 `NearbyStationsCard` UI의 거리순/가격순 토글에서 그대로 전달됩니다 — 토글할 때마다 오피넷을 직접 재조회(클라이언트 캐시를 재정렬하는 방식이 아님)하므로, 화면에 표시되는 5개 결과가 내비/지도 좌표로 실제 상세 조회한 대상과 항상 일치합니다.

### Garage가 노출하는 프록시 API

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/api/opinet/configured` | JWT(로그인 사용자) | 키 설정 여부 `{ configured: boolean }` |
| `GET` | `/api/opinet/stations` | JWT | `lat`, `lon`, `fuelType`, `sort`(`distance` \| `price`, 기본 `distance`) 쿼리 파라미터로 주변 주유소 조회 |
| `GET` | `/api/opinet/stations/:id` | JWT | 주유소 상세 — 주소, 도로명주소, WGS84 좌표 |

**목록 응답 필드**: `id`, `name`, `brand`, `brandLabel`, `distance`(m), `price`(원/L)

**상세 응답 필드**: 요약 필드 + `address`, `roadAddress`, `lat`, `lon`, `tel`

**빠른 입력**에서 주유소를 선택하면 Garage가 상세 정보를 조회해 주유 기록에 `latitude`, `longitude`, `address`, `opinetStationId`를 저장합니다. 저장된 좌표는 이후 내역 화면의 내비게이션 버튼에 쓰입니다.

**차량 개요** 페이지의 `NearbyStationsCard`는 (활성화된 정렬 기준으로) 상위 5개 결과만 보여주고 1~5번 번호를 매기는데, 이 번호는 마지막 위치 지도(`LastLocationMap`)의 마커에도 그대로 표시됩니다 — 제공자별 클릭/호버 핸들링 없이도 결과와 지도 핀을 바로 매칭할 수 있습니다. 차량 자신의 위치는 이 번호 매김이나 5개 제한에 포함되지 않습니다.

### 폴백 동작

- `OPINET_API_KEY`가 없거나 API 오류 발생 시 → **모의(mock) 주유소 4개** 반환
- `GET /api/opinet/configured`가 `false`이면 빠른 입력에서 **주변 주유소 찾기** 버튼이 숨겨짐(가짜 가격 저장 방지)
- 오피넷 상태와 무관하게 주유소 이름 수동 입력은 항상 가능

---

## 2. OBD 앱(Torque Pro)

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능 |
| 인증 | 쿼리 `token={apiToken}` |
| 구현 | `apps/api/src/routes/ingest.ts` |

### 엔드포인트

```
GET /api/ingest/obd?token={apiToken}&speed=...&rpm=...&lat=...&lon=...&fuelLevel=...&odometer=...
```

`token` 하나만으로 차량을 식별합니다 — 차량마다 유일(`Vehicle.apiToken`)하므로 별도의 `vehicleId` 경로 세그먼트가 필요 없습니다.

### 쿼리 파라미터

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `token` | string | **필수** — 차량 `apiToken`, 어느 차량인지도 함께 식별 |
| `speed` | number | 속도(km/h) |
| `rpm` | number | 엔진 회전수 |
| `lat` | number | 위도(WGS84) |
| `lon` | number | 경도(WGS84) |
| `fuelLevel` | number | 연료량(%) |
| `odometer` | number | 주행거리 — 저장된 값보다 클 때만 갱신 |
| `inVehicle` | boolean | 선택 — `true`/`false`/`1`/`0`. 값이 있으면 트립 감지에 그대로 신뢰됨 |

### Torque Pro 설정

1. **Settings → Web Queue / OBD Web Server**
2. **Send data to web server** 활성화
3. 아래 URL을 **Web Server URL**에 붙여넣기 (웹 **OBD & GPS** 탭에서 복사):

```
https://<your-host>/api/ingest/obd?token=<apiToken>
```

### 처리 흐름

1. `source: "obd_app_get"`으로 `TelemetryRaw`에 저장
2. `MQTT_URL`이 설정돼 있으면 `car/{vehicleId}/telemetry` MQTT 토픽에 발행
3. WebSocket 구독자에게 브로드캐스트
4. 백그라운드 트립 잡이 GPS 포인트들을 트립으로 묶음

---

## 3. REST 텔레메트리 수집

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능 |
| 인증 | `Authorization: Bearer {apiToken}` 또는 쿼리 `?token=` |
| 구현 | `apps/api/src/routes/ingest.ts` |

### 엔드포인트

```
POST /api/ingest/telemetry
Authorization: Bearer {apiToken}
Content-Type: application/json
```

`apiToken` 하나만으로 차량을 식별합니다(차량마다 유일) — `vehicleId` 경로 세그먼트 불필요.

`Bearer` 접두사는 선택사항입니다: `Authorization: {apiToken}`(접두사 없이)도 동작합니다. OAuth 토큰이 아니라 차량별 공유 비밀값이라, 접두사를 쉽게 붙이기 어려운 단순한 클라이언트도 지원하기 위함입니다.

### 요청 바디(JSON)

```json
{
  "speed": 65,
  "rpm": 2000,
  "lat": 37.5665,
  "lon": 126.9780,
  "fuelLevel": 85,
  "dtcCodes": "P0300",
  "odometer": 45230,
  "inVehicle": true
}
```

모든 필드는 선택사항입니다. `odometer`는 Torque GET 라우트와 동일하게 "더 클 때만 갱신" 규칙을 따릅니다.

### 트립 감지 (`inVehicle`)

트립 잡(`apps/api/src/jobs/trips.ts`, `apps/api/src/lib/tripDetection.ts`)이 어떤 포인트를 주행 트립에 포함시킬지 결정합니다:

| 요청의 `inVehicle` | 동작 |
|---|---|
| `true` | 실제 주행 포인트로 신뢰(경로 계산을 위해 `lat`/`lon` 필요) |
| `false` | 트립 집계에서 제외 |
| 생략 | 서버가 신호로 추론 (아래 참고) |

**서버 폴백** (`inVehicle`을 생략한 경우):

1. 이전 포인트 대비 `odometer` 증가
2. `rpm >= 400`
3. `source = obd_app_get`이고 `speed >= 8` km/h
4. `speed >= 18` km/h이고 이전 포인트로부터 80m 이상 이동(GPS 전용 필터)

Torque Pro는 보통 `inVehicle`을 생략하며, 규칙 1~3으로 자동 처리됩니다.

### 처리 흐름

1. `source: "rest_api_post"`로 `TelemetryRaw`에 저장
2. WebSocket 구독자에게 브로드캐스트
3. *(참고: 이 라우트는 MQTT에 발행하지 않습니다 — Torque GET 라우트만 발행합니다)*

### 차량 상태 & 리마인더 (조회)

위와 동일한 `apiToken` 인증(쿼리 `?token=` 또는 `Authorization: Bearer`)을 쓰지만, 쓰기가 아니라 **조회**용입니다 — Home Assistant `rest` 센서가 폴링하기에 적합합니다. 사용자 로그인이 필요 없습니다.

```
GET /api/ingest/status?token={apiToken}
```

차량 정보와 가장 최근 텔레메트리를 함께 반환합니다(`apiToken` 자체는 절대 포함하지 않음):

```json
{
  "id": "clx...",
  "name": "쏘나타",
  "plate": "12가3456",
  "fuelType": "GASOLINE",
  "odometer": 45230,
  "fuelLevel": 62,
  "latitude": 37.5665,
  "longitude": 126.978,
  "locationUpdatedAt": "2024-06-01T09:12:00.000Z",
  "speed": 0
}
```

```
GET /api/ingest/reminders?token={apiToken}
```

해당 차량의 `PENDING` 상태 정비/행정 리마인더를 전부 반환하며, 각 항목에 `currentOdometer`와 계산된 `isDue`(날짜 또는 주행거리 기준 도달 여부)가 포함됩니다:

```json
[
  { "type": "engineOilFilter", "dueDate": "2024-07-01T00:00:00.000Z", "dueOdometer": 50000, "isDue": false, "currentOdometer": 45230 }
]
```

토큰이 없거나 잘못되면 둘 다 `401 { "error": "unauthorized" }`를 반환합니다 — 터미널에서 빠르게 토큰을 확인하는 방법:

```bash
curl "https://GARAGE_HOST/api/ingest/status?token=YOUR_VEHICLE_API_TOKEN"
```

관리자는 웹 UI에서 이 엔드포인트들을 포함해 전부 클릭 한 번으로 테스트할 수 있습니다 — **[API 익스플로러](#13-api-익스플로러)** 참고.

---

### Home Assistant — 복사해서 붙여넣는 `rest_command`

아래 블록을 `configuration.yaml`(또는 패키지 YAML 파일)에 붙여넣고, 세 개의 자리표시자를 바꾼 뒤 REST 커맨드를 다시 로드하거나 Home Assistant를 재시작하세요.

**자리표시자**

| 자리표시자 | 확인 위치 |
|---|---|
| `GARAGE_HOST` | Garage 서버 호스트명 또는 IP(끝에 슬래시 없이), 예: `192.168.1.50` 또는 `garage.home` |
| `API_TOKEN` | Garage 웹 UI → **차량 → OBD & GPS** — **API 토큰** 값(차량 식별도 이 값 하나로 됨, 별도 ID 불필요) |

**최소 설정** — 폰 GPS + 차량 블루투스 연결 여부(`inVehicle`):

```yaml
# --- Garage 텔레메트리 수집 (최소) ---
# configuration.yaml에 붙여넣고 GARAGE_HOST / API_TOKEN을 바꾼 뒤 REST 커맨드를 다시 로드하세요.

rest_command:
  garage_send_telemetry:
    url: "http://GARAGE_HOST/api/ingest/telemetry"
    method: POST
    headers:
      Authorization: "Bearer API_TOKEN"
      Content-Type: "application/json"
    payload: >-
      {
        "lat": {{ states('sensor.YOUR_LATITUDE_SENSOR') | float(0) }},
        "lon": {{ states('sensor.YOUR_LONGITUDE_SENSOR') | float(0) }},
        "speed": {{ states('sensor.YOUR_SPEED_SENSOR') | float(0) }},
        "inVehicle": {{ is_state('sensor.YOUR_CAR_BLUETOOTH_SENSOR', 'connected') | lower }}
      }
```

**전체 설정** — 지원하는 모든 텔레메트리 필드:

```yaml
# --- Garage 텔레메트리 수집 (전체) ---
# GARAGE_HOST, API_TOKEN, 아래 센서 엔티티 ID들을 바꾸세요.

rest_command:
  garage_send_telemetry:
    url: "http://GARAGE_HOST/api/ingest/telemetry"
    method: POST
    headers:
      Authorization: "Bearer API_TOKEN"
      Content-Type: "application/json"
    payload: >-
      {
        "lat": {{ states('sensor.YOUR_LATITUDE_SENSOR') | float(0) }},
        "lon": {{ states('sensor.YOUR_LONGITUDE_SENSOR') | float(0) }},
        "speed": {{ states('sensor.YOUR_SPEED_SENSOR') | float(0) }},
        "rpm": {{ states('sensor.YOUR_RPM_SENSOR') | float(0) }},
        "fuelLevel": {{ states('sensor.YOUR_FUEL_SENSOR') | float(0) }},
        "odometer": {{ states('sensor.YOUR_ODOMETER_SENSOR') | int(0) }},
        "dtcCodes": "{{ states('sensor.YOUR_DTC_SENSOR') }}",
        "inVehicle": {{ is_state('sensor.YOUR_CAR_BLUETOOTH_SENSOR', 'connected') | lower }}
      }
```

**Garage → HA로 다시 읽어오기** — `GET /api/ingest/status`를 폴링하는 `rest` 센서(Garage → HA 방향, 텔레메트리 전송 불필요):

```yaml
# --- Garage 상태 센서 (읽기) ---
# configuration.yaml에 붙여넣고 GARAGE_HOST / API_TOKEN을 바꾸세요.

sensor:
  - platform: rest
    name: "Garage Odometer"
    resource: "http://GARAGE_HOST/api/ingest/status?token=API_TOKEN"
    value_template: "{{ value_json.odometer }}"
    unit_of_measurement: "km"
    scan_interval: 300
  - platform: rest
    name: "Garage Fuel Level"
    resource: "http://GARAGE_HOST/api/ingest/status?token=API_TOKEN"
    value_template: "{{ value_json.fuelLevel }}"
    unit_of_measurement: "%"
    scan_interval: 300
  - platform: rest
    name: "Garage Due Reminders"
    resource: "http://GARAGE_HOST/api/ingest/reminders?token=API_TOKEN"
    value_template: "{{ value_json | selectattr('isDue') | list | count }}"
    scan_interval: 3600
```

**선택 자동화** — 주행 중(속도 5km/h 초과) 1분마다 텔레메트리 전송:

```yaml
# --- Garage 텔레메트리 자동화 (선택) ---
# automations.yaml에 추가하세요. 엔티티 ID와 속도 임계값은 필요에 맞게 조정.

automation:
  - id: garage_push_telemetry_while_driving
    alias: "Garage: push telemetry while driving"
    mode: single
    trigger:
      - platform: time_pattern
        minutes: "/1"
    condition:
      - condition: numeric_state
        entity_id: sensor.YOUR_SPEED_SENSOR
        above: 5
    action:
      - service: rest_command.garage_send_telemetry
```

**수동 테스트** — **개발자 도구 → 액션**에서 실행:

```yaml
service: rest_command.garage_send_telemetry
```

**직접 URL 예시** (`secrets.yaml` 없이):

```yaml
rest_command:
  garage_send_telemetry:
    url: "http://192.168.0.244/api/ingest/telemetry"
    method: POST
    headers:
      Authorization: "Bearer YOUR_VEHICLE_API_TOKEN"
      Content-Type: "application/json"
    payload: >-
      {
        "lat": {{ states('sensor.YOUR_LATITUDE_SENSOR') | float(0) }},
        "lon": {{ states('sensor.YOUR_LONGITUDE_SENSOR') | float(0) }},
        "speed": {{ states('sensor.YOUR_SPEED_SENSOR') | float(0) }},
        "inVehicle": {{ is_state('sensor.YOUR_CAR_BLUETOOTH_SENSOR', 'connected') | lower }}
      }
```

> **HTTPS**: Garage가 HTTPS 뒤에 있다면 URL의 `http://`를 `https://`로 바꾸세요.
> **`inVehicle`**: 차량 블루투스 연결 여부(또는 유사한 신호)로 설정하세요. 생략하면 Garage가 서버 측 규칙을 적용하는데, 폰 GPS만으로는 걷는 중에도 트립이 생성되지 않을 수 있습니다.
> **컴패니언 앱 GPS**: 흔히 쓰는 엔티티 ID는 지오코딩 전용인 `sensor.<device>_geocoded_location`입니다. 원시 좌표가 필요하면 GPS/로거 연동을 쓰거나 `device_tracker` 속성으로 템플릿 센서를 만드세요.

---

## 4. WebSocket 실시간 스트림

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능 |
| 인증 | 쿼리 `?token={apiToken}` |
| 구현 | `apps/api/src/routes/ingest.ts` |

### 엔드포인트

```
WS /api/ingest/telemetry/ws?token={apiToken}
```

텔레메트리가 수집될 때마다 JSON 페이로드를 푸시합니다. 인증 실패 시 연결이 즉시 종료됩니다.

---

## 5. MQTT(Mosquitto / Home Assistant)

| 항목 | 값 |
|---|---|
| 상태 | 코드 준비됨 — Compose에서 Mosquitto 활성화 필요 |
| 설정 | `MQTT_URL` (예: `mqtt://mosquitto:1883`) |
| 구현 | `apps/api/src/lib/mqtt.ts`, `mosquitto/mosquitto.conf` |

### 동작

- `MQTT_URL`이 설정되지 않으면 `publish()`는 **아무 동작도 하지 않는 스텁**입니다
- Torque Pro GET 수집이 성공하면 아래로 JSON을 발행합니다:

```
토픽: car/{vehicleId}/telemetry
페이로드: { speed, rpm, lat, lon, fuelLevel, odometer, time }
```

### 활성화 방법

1. `docker-compose.yml`의 `mosquitto` 서비스 주석 해제
2. API 컨테이너에 `MQTT_URL=mqtt://mosquitto:1883` 추가
3. Home Assistant를 브로커에 연결하고 해당 토픽 구독

> `docs/ARCHITECTURE.md`에는 리마인더/연료량에 대한 MQTT 디스커버리를 다루는 향후 단계가 설명되어 있습니다. 현재는 텔레메트리 발행만 구현되어 있습니다.

---

## 6. GitHub Releases(업데이트 확인)

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능 |
| 설정 | 없음(고정값: `eigger/garage`) |
| 구현 | `apps/api/src/index.ts` — `/health` |

### 호출

```
GET https://api.github.com/repos/eigger/garage/releases/latest
```

30분간 캐시됩니다. `/health`는 `version`, `latestVersion`, `updateAvailable`을 반환합니다.
네트워크 오류 시 마지막으로 알려진 버전을 유지합니다(헬스체크 자체는 실패하지 않음).

---

## 7. Cloudflare Tunnel

| 항목 | 값 |
|---|---|
| 상태 | 계획됨 — Compose 템플릿만 존재 |
| 설정 | `CLOUDFLARE_TUNNEL_TOKEN` |
| 위치 | `docker-compose.yml`의 `cloudflared` 서비스(주석 처리됨) |

계획: 내부 Caddy(HTTP :80) 앞단에 터널을 두어 포트포워딩 없이 원격 접속.

---

## 8. Traccar(GPS/OBD 하드웨어)

| 항목 | 값 |
|---|---|
| 상태 | 계획됨 |
| 설정 | `docker-compose.yml`의 `traccar` 서비스(주석 처리됨) |
| 계획 | Traccar → Garage로 웹훅/MQTT를 통해 정규화된 위치·속도 전달 |

Traccar는 200종 이상의 기기 프로토콜을 지원하며, Garage는 정규화된 이벤트를 게이트웨이로서 소비하는 구조가 될 예정입니다(`docs/ARCHITECTURE.md` 참고).

---

## 9. 지도 제공자 (OSM / 카카오 / 네이버 / 티맵)

| 항목 | 값 |
|---|---|
| 상태 | **사용 가능** — 기본은 OSM, API 키를 설정하면 카카오/네이버/티맵도 사용 |
| 기본값 | OpenStreetMap(Leaflet) — API 키 불필요 |
| 선택 키 | `/integrations`에서 `KAKAO_MAP_APP_KEY`, `NAVER_MAP_CLIENT_ID`, `TMAP_APP_KEY` |
| 구현 | `apps/web/components/maps/*`, `GET /api/map/providers` |

### 동작

- 트립 경로는 `trips.routePolyline`에 Google 인코딩 폴리라인으로 저장됩니다.
- **내역 → 주행 리포트 → 지도**에서 경로를 지도에 표시합니다.
- 지도 제공자 드롭다운은 사용 가능한 제공자가 2개 이상일 때만 표시됩니다(`osm`은 항상 포함).
- 제공자 선호도는 브라우저 `localStorage`(`garage_map_provider`)에 저장됩니다.

### API 키(선택)

| 키 | 발급처 | 참고 |
|---|---|---|
| `KAKAO_MAP_APP_KEY` | [카카오 디벨로퍼스](https://developers.kakao.com) | JavaScript 키; Garage 웹 도메인 등록 필요 |
| `NAVER_MAP_CLIENT_ID` | [네이버클라우드플랫폼 Maps](https://www.ncloud.com/product/applicationService/maps) | 사이트 URL 등록 필요 |
| `TMAP_APP_KEY` | [TMAP 오픈 API](https://openapi.sk.com/) | JavaScript v2 SDK; 웹 도메인 등록 필요 |

### 클라이언트 API

```
GET /api/map/providers
Authorization: Bearer <JWT>
```

응답:

```json
{
  "providers": ["osm", "kakao", "tmap"],
  "kakaoAppKey": "...",
  "naverClientId": null,
  "tmapAppKey": "..."
}
```

인증된 사용자에게 브라우저 지도 SDK 로딩용 키가 그대로 반환됩니다(도메인 제한이 걸린 클라이언트 키).

---

## 10. 내비게이션 딥링크 (티맵 / 카카오 / 네이버)

| 항목 | 값 |
|---|---|
| 상태 | **사용 가능** |
| 설정 | 없음 — 주유 기록에 저장된 좌표를 사용 |
| 구현 | `apps/web/lib/navigation/deepLinks.ts`, `NavLaunchButtons` |

주유 기록에 `latitude`/`longitude`가 있으면(오피넷 주유소 상세 또는 향후 다른 출처), **빠른 입력**과 **내역 → 주유**에서 아래 앱을 여는 버튼이 표시됩니다:

| 앱 | URL 스킴 |
|---|---|
| 티맵 | `tmap://route?goalname=…&goaly={lat}&goalx={lon}` |
| 카카오내비 | `https://map.kakao.com/link/to/{name},{lat},{lon}` |
| 네이버지도 | `nmap://route/car?dlat={lat}&dlng={lon}&dname={name}` |

표준 모바일 딥링크이므로 해당 앱이 설치돼 있어야 합니다. 웹 폴백은 코드에 존재하지만 아직 UI에는 노출되지 않습니다.

---

## 11. 차량 기록 REST API (주유 / 정비)

| 항목 | 값 |
|---|---|
| 상태 | **사용 가능** |
| 인증 | `POST /api/auth/login`으로 받는 **JWT**(표준) 또는 차량별 **apiToken**(단순) |
| 접근 권한 | 대상 차량에 접근 권한이 있는 사용자, 또는 유효한 차량별 `apiToken` |
| 구현 | `apps/api/src/routes/fuelLogs.ts`, `apps/api/src/routes/maintenanceRecords.ts`, `apps/api/src/routes/ingest.ts` |

외부 연동(Home Assistant, 스크립트, 자동화)에는 **표준 API**(사용자 로그인 JWT 필요) 또는 **단순화된 수집 API**(차량별 `apiToken`만 필요) 둘 중 하나를 쓸 수 있습니다.

---

### 1) 단순화된 수집 API (HA·스크립트에 권장)

쿼리 파라미터 `?token=...` 또는 `Authorization: Bearer <apiToken>` 헤더의 고유 `apiToken`으로 차량을 식별·인증합니다. `vehicleId` 경로 세그먼트나 바디 필드가 필요 없습니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/ingest/fuel-logs` | 주유 기록 생성 |
| `POST` | `/api/ingest/maintenance-records` | 정비 기록 생성 |

#### 주유 기록 (단순화)
```
POST /api/ingest/fuel-logs?token={apiToken}
Content-Type: application/json
```
```json
{
  "date": "2024-03-15",
  "odometer": 45230,
  "liters": 45.2,
  "cost": 75000,
  "fullTank": true,
  "location": "OO주유소"
}
```

#### 정비 기록 (단순화)
```
POST /api/ingest/maintenance-records?token={apiToken}
Content-Type: application/json
```
```json
{
  "date": "2024-06-01",
  "odometer": 48000,
  "type": "자동차보험 갱신",
  "category": "ADMINISTRATIVE",
  "cost": 850000,
  "shop": "OO정비소"
}
```

---

### 2) 표준 API (사용자 JWT 필요)

로그인된 사용자 계정이 필요합니다. JWT 발급:

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

응답에 `token`이 포함됩니다(기본적으로 만료 없음). 모든 요청에 `Authorization: Bearer <JWT>`로 전달하세요.

#### 주유 기록 (표준)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/vehicles/{id}/fuel-logs?limit=&offset=` | 목록 조회(최신순) |
| `POST` | `/api/vehicles/{id}/fuel-logs` | 생성 |
| `PATCH` | `/api/vehicles/{id}/fuel-logs/:logId` | 수정(부분 바디) |
| `DELETE` | `/api/vehicles/{id}/fuel-logs/:logId` | 삭제 |

**생성 바디** (`packages/shared/src/schemas/records.ts`):

| 필드 | 타입 | 필수 | 참고 |
|---|---|---|---|
| `vehicleId` | string | 예 | 대상 차량 |
| `date` | ISO 날짜 / 문자열 | 예 | 과거 날짜 입력 가능(소급 등록) |
| `odometer` | integer ≥ 0 | 예 | 주유 시점 주행거리(km) |
| `liters` | number > 0 | 예 | |
| `cost` | integer ≥ 0 | 예 | 원(KRW) |
| `fullTank` | boolean | 아니오 | 기본값 `true` |
| `location` | string | 아니오 | 주유소 이름 |
| `latitude` | number \| null | 아니오 | WGS84 |
| `longitude` | number \| null | 아니오 | WGS84 |
| `address` | string \| null | 아니오 | 도로명 또는 지번 주소 |
| `opinetStationId` | string \| null | 아니오 | 오피넷 `UNI_ID` |

```json
{
  "vehicleId": "clx...",
  "date": "2024-03-15",
  "odometer": 45230,
  "liters": 45.2,
  "cost": 75000,
  "fullTank": true,
  "location": "OO주유소"
}
```

#### 정비 기록 (표준)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/vehicles/{id}/maintenance-records?category=&search=&limit=&offset=` | 목록 조회(최신순) |
| `POST` | `/api/vehicles/{id}/maintenance-records` | 생성 |
| `PATCH` | `/api/vehicles/{id}/maintenance-records/:recordId` | 수정(부분 바디) |
| `DELETE` | `/api/vehicles/{id}/maintenance-records/:recordId` | 삭제 |

**생성 바디**:

| 필드 | 타입 | 필수 | 참고 |
|---|---|---|---|
| `vehicleId` | string | 예 | |
| `date` | ISO 날짜 / 문자열 | 예 | 과거 날짜 입력 가능 |
| `odometer` | integer ≥ 0 | 예 | 정비 시점 주행거리(km) |
| `type` | string | 예 | 예: `엔진오일 교환` |
| `category` | `MAINTENANCE` \| `ADMINISTRATIVE` | 아니오 | 기본값 `MAINTENANCE` |
| `cost` | integer ≥ 0 | 아니오 | |
| `shop` | string | 아니오 | 정비소 이름 |
| `notes` | string | 아니오 | |

```json
{
  "vehicleId": "clx...",
  "date": "2024-06-01",
  "odometer": 48000,
  "type": "자동차보험 갱신",
  "category": "ADMINISTRATIVE",
  "cost": 850000,
  "shop": "OO정비소"
}
```

### 주행거리 (`Vehicle.odometer`)

**독립적인 "주행거리 설정" 엔드포인트는 없습니다.** 저장된 차량 주행거리는 아래 시점에 갱신됩니다:

| 출처 | 규칙 |
|---|---|
| `POST/PATCH` 주유 기록 | 바디의 `odometer`가 현재 `Vehicle.odometer`**보다 크면** → 차량 정보 갱신 |
| `POST/PATCH` 정비 기록 | 동일 |
| 텔레메트리 수집(2~3절) | 쿼리/바디의 `odometer` 필드, 동일한 "더 클 때만" 규칙 |

**현재 값 조회:**

```
GET /api/vehicles/:id/odometer
Authorization: Bearer <JWT>
```

→ `{ "odometer": 45230 }`

현재 차량 값보다 **낮은** 주행거리로 소급 등록한 기록은 정상 저장되지만 `Vehicle.odometer`는 낮추지 않습니다.

### 첨부파일 (선택)

기록 생성 후 영수증을 업로드할 수 있습니다:

```
POST /api/attachments?fuelLogId={id}
POST /api/attachments?maintenanceRecordId={id}
Authorization: Bearer <JWT>
Content-Type: multipart/form-data
```

허용 MIME 타입: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

---

### Home Assistant — Garage API 형식 `rest_command`

아래는 차량의 `apiToken`을 사용한 단순화된 수집 API 형식입니다.

```yaml
rest_command:
  garage_create_fuel_log:
    url: "http://192.168.0.244/api/ingest/fuel-logs"
    method: post
    content_type: "application/json"
    headers:
      Authorization: "Bearer YOUR_VEHICLE_API_TOKEN"
    payload: >
      {
        "date": "{{ now().strftime('%Y-%m-%d') }}",
        "odometer": {{ states('sensor.your_odometer') | int(0) }},
        "liters": {{ states('input_number.fuel_liters') | float(0) }},
        "cost": {{ states('input_number.fuel_cost') | int(0) }},
        "fullTank": true,
        "location": "{{ states('input_text.fuel_station') }}"
      }

  garage_create_maintenance_record:
    url: "http://192.168.0.244/api/ingest/maintenance-records"
    method: post
    content_type: "application/json"
    headers:
      Authorization: "Bearer YOUR_VEHICLE_API_TOKEN"
    payload: >
      {
        "date": "{{ now().strftime('%Y-%m-%d') }}",
        "odometer": {{ states('sensor.your_odometer') | int(0) }},
        "type": "{{ states('input_text.maintenance_type') }}",
        "category": "MAINTENANCE",
        "cost": {{ states('input_number.maintenance_cost') | int(0) }},
        "shop": "{{ states('input_text.maintenance_shop') }}",
        "notes": "{{ states('input_text.maintenance_notes') }}"
      }
```

수동 호출 예시:

```yaml
service: rest_command.garage_create_fuel_log
```

```yaml
service: rest_command.garage_create_maintenance_record
```

> `YOUR_VEHICLE_API_TOKEN`은 웹 **차량 상세 → OBD & GPS** (`/vehicles/[id]/integration`) 탭에서 확인할 수 있는 고유 토큰입니다.


---

## 12. PWA 웹 푸시

| 항목 | 값 |
|---|---|
| 상태 | **사용 가능** |
| 설정 | `.env`에 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, 선택적으로 `VAPID_SUBJECT` |
| 구현 | `apps/api/src/lib/push.ts`, `apps/api/src/jobs/pushReminders.ts`, `apps/web/public/sw.js` |

### VAPID 키 생성

```bash
npx web-push generate-vapid-keys
```

`.env`에 추가:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

키 설정 후 API 서버를 재시작하세요.

### 사용자 설정

1. **HTTPS**로 Garage에 접속(웹 푸시 필수 조건; 개발 시 `localhost`는 예외)
2. **프로필 → 푸시 알림 → 활성화**
3. 브라우저 알림 권한 허용
4. iOS는 먼저 Garage를 **홈 화면에 추가**해야 함(iOS 16.4+)

### 푸시 발송 시점

- 매일 **03:00**, **08:00**(서버 로컬 시간)에 리마인더 동기화 후
- `PENDING` 상태이면서 **실제로 기한이 된**(날짜 또는 주행거리) 리마인더 중 아직 푸시되지 않은 항목(`pushNotifiedAt`이 null)
- 수신자: **ADMIN** 사용자 + 해당 차량에 접근 권한이 있는 사용자
- 알림을 탭하면 차량 **정비 스케줄** 페이지로 이동

한 번 확인 처리한 리마인더는 다시 푸시되지 않습니다. 스케줄 항목을 완료 처리하면 새 주기가 시작되고, 기한 날짜/주행거리가 바뀌면 푸시 대상 여부도 다시 계산됩니다.

### API

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/api/push/config` | 없음 | `{ configured, publicKey }` |
| `GET` | `/api/push/status` | JWT | 현재 사용자의 구독 상태 |
| `POST` | `/api/push/subscribe` | JWT | 브라우저 푸시 구독 등록 |
| `DELETE` | `/api/push/subscribe` | JWT | 구독 해제(`{ endpoint }`) |

---

## 13. API 익스플로러

| 항목 | 값 |
|---|---|
| 상태 | **사용 가능** |
| 접근 권한 | ADMIN 전용, 웹 UI `/api-explorer` |
| 구현 | `apps/web/app/api-explorer/page.tsx` |

이 문서의 모든 REST 엔드포인트를 인증 방식별로 그룹화해 보여주는 내장 페이지입니다:

- **JWT(로그인 세션)** — 읽기 전용 `GET` 엔드포인트는 관리자 본인의 세션으로 클릭 한 번에 테스트할 수 있고, 응답이 정돈된 JSON으로 표시됩니다.
- **차량 apiToken** — 드롭다운에서 차량을 선택하면(`/vehicles/[id]/integration`과 동일한 방식으로 토큰을 가져옴) `GET /api/ingest/status`, `GET /api/ingest/reminders`를 바로 테스트할 수 있습니다.
- 데이터를 생성·수정·삭제하는 엔드포인트(`POST`/`PATCH`/`DELETE`)는 참고용으로 바로 복사 가능한 `curl` 명령과 함께 나열되지만 **클릭 한 번으로 실행되지는 않습니다** — 이 페이지는 (예: Home Assistant 센서를 연결하기 전에) 읽기 동작이 정상인지 안전하게 확인하는 용도이지, 앱을 조작하는 용도가 아닙니다.

---

## 14. 전기차 충전소 API (한국환경공단 EvCharger)

| 항목 | 값 |
|---|---|
| 상태 | 사용 가능(실제 API로 검증됨) |
| 설정 키 | `EV_CHARGER_API_KEY` (+ `EV_CHARGER_API_KEY_EXPIRES_AT`, 평문 날짜, 비밀값 아님) |
| 설정 위치 | `/integrations` UI 또는 `.env` / `docker-compose` |
| 발급처 | [data.go.kr — 한국환경공단_전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do) |
| 구현 | `apps/api/src/lib/evCharger.ts`, `apps/api/src/routes/evCharger.ts` |

### Garage가 호출하는 외부 API

```
GET https://apis.data.go.kr/B552584/EvCharger/getChargerInfo
  ?serviceKey={EV_CHARGER_API_KEY}
  &dataType=JSON
  &numOfRows=1000&pageNo=1
  &zcode={시도 코드, 선택}
```

오피넷과 달리 이 API는 **위경도 + 반경 검색을 지원하지 않고**, `zcode`(시도, 2자리) / `zscode`(시군구) 지역 필터만 제공합니다. Garage는 이를 다음과 같이 우회합니다:

1. 프런트엔드가 차량의 마지막 위치 좌표를 (기존 카카오/네이버 `reverseGeocode()`로) 역지오코딩해 주소 문자열을 얻습니다.
2. 백엔드가 첫 토큰(시도명, 예: `서울특별시`)을 추출해 `evCharger.ts`의 고정 17개 테이블로 `zcode`에 매핑합니다(카카오 REST 키 불필요 — 지도 JS 키로는 카카오의 REST 전용 `coord2regioncode`를 호출할 수 없기 때문).
3. 해당 시도의 모든 충전소를 가져와 `statId`별로 그룹화(커넥터 하나당 한 행)하고, 실제 `haversineKm()` 거리로 재정렬합니다 — 큰 시도 안에서는 다소 과도하게 가져오는 대신, 오피넷과 동일한 "가까운 순" UX를 제공합니다.

### Garage가 노출하는 프록시 API

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/api/ev-charger/configured` | JWT | 키 설정 여부 `{ configured: boolean }` |
| `GET` | `/api/ev-charger/stations` | JWT | `lat`, `lon`, `address`(선택, zcode 판별용) 쿼리 파라미터로 주변 충전소 조회 |

**응답 필드**: `id`(statId), `name`, `operator`, `distance`(m), `lat`, `lon`, `address`, `parkingFree`, `connectors[]`(`chgerId`, `type`, `status`, `output` kW)

`status`는 API의 `stat` 코드를 `AVAILABLE | CHARGING | RESERVED | OUT_OF_SERVICE | UNKNOWN`으로 정규화합니다. `type`(01~11)과 `status` 모두 로케일 무관 코드이며, 프런트엔드가 사람이 읽을 수 있는 라벨로 번역합니다(`NearbyStationsCard.tsx`) — 즉 API는 이 필드들에 대해 한국어 전용 표시 텍스트를 절대 직접 반환하지 않습니다.

**차량 개요 페이지**(`NearbyStationsCard`)에 빠른 입력과는 별개의 "주변 충전소 찾기" 독립 카드로 노출됩니다 — 충전소 여부 확인은 EV 차주에게 출발 전 의사결정 사항이지, 완료된 충전 기록과 묶일 개념이 아니기 때문입니다. 각 결과는 기존 내비 딥링크 버튼(티맵 / 카카오 / 네이버)으로 연결됩니다. 위 오피넷 흐름(§1)과 동일하게 상위 5개 제한과 지도 마커 번호 매김이 적용되지만, 가격 필드가 없으므로 거리순 정렬만 가능합니다.

### 폴백 동작

- `EV_CHARGER_API_KEY`가 없거나, `zcode`를 판별할 수 없거나, API 오류 발생 시 → **모의(mock) 충전소 4개** 반환(쿼리 좌표 근처에 합성)
- 버튼에 별도의 "설정됨" 게이트가 없습니다 — 카드는 항상 "찾기" 버튼을 보여주고 조용히 모의 데이터로 폴백합니다. 충전소를 둘러보는 행위 자체에는 막을 만한 비용/가격 부수효과가 없기 때문입니다(오피넷은 가짜 가격이 주유 기록에 저장되는 걸 막기 위해 버튼을 숨김).

### 키 만료

data.go.kr 키 신청은 기본적으로 **유효기간 2년**이며 자동 만료됩니다 — 만료일을 조회하는 API는 없습니다. `/integrations`에는 (마스킹된 비밀값 행과는 별도로) 관리자가 만료일을 직접 기록하는 전용 날짜 입력 카드가 있고, 만료 30일 전부터 경고 배너가 표시됩니다(`EV_CHARGER_API_KEY_EXPIRES_AT`은 `GET /api/settings`가 평문으로 반환하는 유일한 설정 키인데, 비밀값이 아니라 날짜이기 때문입니다).

---

## 새 연동 추가하기 (개발자용)

**외부 API 키(관리자 UI):**

1. `packages/shared/src/schemas/settings.ts` — `settingKeySchema`에 키 추가
2. `apps/web/app/integrations/page.tsx` — `SETTING_META` 라벨/도움말 매핑
3. `apps/web/lib/i18n/translations.ts` — ko/en 번역 키
4. 기능 라우트 — `getSetting("NEW_KEY")`로 읽기
5. `.env.example` — 선택적으로 환경변수 안내 추가

**인바운드 기기 연동:**

1. `apps/api/src/routes/ingest.ts` 또는 전용 라우트
2. `packages/shared/src/schemas/` — Zod 검증 스키마
3. `apps/web/app/vehicles/[id]/integration/page.tsx` — 설정 안내 UI

---

## 15. 현대 Developers(커넥티드카 API)

| 항목 | 값 |
|---|---|
| 상태 | **확인된 API 규격서 기준으로 구현 완료, 아직 실제 검증 전** — 아래 모든 엔드포인트는 콘솔이 제공하는 API 규격서 페이지를 그대로 구현·단위테스트했습니다. 아직 실제 OAuth + 데이터 동의 흐름을 끝까지 완료한 계정이 없어서, 실제 응답으로는 검증되지 않았습니다. |
| 설정 키 | `HYUNDAI_CLIENT_ID`, `HYUNDAI_CLIENT_SECRET` |
| 설정 위치 | `/integrations` UI |
| 발급처 | [developers.hyundai.com](https://developers.hyundai.com) ("현대 Developers") |
| 구현 | `apps/api/src/lib/hyundai.ts`(+ `hyundai.test.ts`), `apps/api/src/lib/hyundaiToken.ts`, `apps/api/src/routes/hyundai.ts`, `apps/api/src/routes/hyundaiWebhook.ts`, `apps/api/src/jobs/hyundaiSync.ts` |

### 왜 필요한가

OBD 동글 기반 수집([OBD 앱](#2-obd-앱torque-pro) 참고)의 대안으로 검토했습니다:
국내(한국 등록) 블루링크 연동 차량은 실제 주행거리, EV 배터리/충전 상태, 계기판 경고등을
현대 클라우드에서 직접 가져올 수 있어 — 폰 앱도, 블루투스 동글도 필요 없습니다. 다만 이건
(시동을 끌 때 차량이 갱신하는) 주기적인 주행거리/상태 *스냅샷*만 제공할 뿐, OBD/GPS 수집
경로처럼 트립별 경로·시간·속도 이력을 주지는 않습니다 — 서로 대체재가 아니라 상호 보완
관계입니다.

### 자동 주행거리 동기화

`apps/api/src/jobs/hyundaiSync.ts`는 서버 부팅 시 1회, 그리고 하루 두 번(07:00, 19:00 —
블루링크 주행거리 데이터가 시동을 끌 때만 갱신되므로 더 자주 폴링해도 의미가 없어서
`reminders` 잡과 동일한 주기로 맞춤) 실행됩니다. 모든 `HyundaiVehicleLink`에 대해
주행거리를 조회한 뒤, 가져온 값이 **기존 저장값보다 클 때만** `Vehicle.odometer`를
갱신합니다 — OBD 웹훅 수집이 쓰는 것과 동일한 비파괴적 규칙(`bumpOdometerIfHigher`)이라,
더 최근에 수동으로 입력한 값을 오래된 블루링크 값이 덮어쓰는 일이 없습니다.

### 데이터 모델

- `Setting`(`HYUNDAI_CLIENT_ID` / `HYUNDAI_CLIENT_SECRET`) — 앱 레벨 OAuth 클라이언트 자격증명, 관리자가 관리, 다른 연동 키와 마찬가지로 백업에서 제외됩니다.
- `HyundaiAccountLink` — 본인의 현대 계정을 연결한 Garage `User`마다 한 행(액세스/리프레시 토큰, 로그인 시 사용한 `redirectUri`(리프레시에 재사용하기 위해 저장), `hyundaiUserId`(`/user/profile`에서 받은 현대 측 사용자 ID, 아래 삭제 웹훅 매칭에 사용)). 관리자 전용이 아니라 개인용입니다 — 가족 구성원마다 각자의 블루링크 계정을 연결합니다.
- `HyundaiVehicleLink` — Garage `Vehicle` 하나를 현대의 `carId` 하나에 매핑하고, 이를 소유한 `HyundaiAccountLink`를 참조합니다(요청자 본인이 아닐 수도 있음 — 토큰 조회는 항상 라우트 파일의 `getValidAccessTokenForVehicleLink`를 통해 차량 자신의 연결로 해결됩니다).

### Garage가 노출하는 API (`/api/hyundai/*`, 전부 JWT 인증)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/configured` | 관리자가 Client ID/Secret을 설정했는지 여부 |
| `GET` | `/account` | 현재 사용자가 본인의 현대 계정을 연결했는지 여부 |
| `GET` | `/authorize-url?redirectUri=` | 사용자를 리디렉션할 로그인 URL |
| `POST` | `/link` | 인가 코드를 토큰으로 교환하고 현재 사용자에게 저장 |
| `DELETE` | `/account` | 현재 사용자의 현대 계정 연결 해제(토큰 폐기 및 데이터 동의 철회) |
| `GET` | `/vehicles` | 연결된 계정의 현대 차량 목록(Garage 차량과 매칭할 후보) |
| `PUT` | `/vehicles/:vehicleId/link` | Garage 차량을 현대 `carId`에 연결 |
| `DELETE` | `/vehicles/:vehicleId/link` | 연결 해제 |
| `GET` | `/vehicles/:vehicleId/mileage` | 주행거리 + 잔여 주행가능거리 |
| `GET` | `/vehicles/:vehicleId/status` | 경고등(7종) |
| `GET` | `/vehicles/:vehicleId/driving-habit` | 아직 사용 불가 — 아래 참고 |

`POST /api/hyundai/webhook`(JWT 없음, 공개)은 현대의 "데이터 조회 불가 상태 알림" 콜백입니다 —
콘솔의 "설정 - 데이터 API" 페이지에 콜백 URL로 등록하세요. 계정 삭제, 차량 삭제, 동의 철회
시 해당하는 `HyundaiAccountLink`/`HyundaiVehicleLink` 행을 삭제합니다 — 통지 즉시 데이터를
삭제해야 하는 개인정보보호법 요건에 따른 것입니다.

### 콘솔이 제공하는 API 규격서 기준으로 확인함 (안내 가이드가 아니라)

- 로그인: `GET https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/authorize` (`response_type`, `client_id`, `redirect_uri`, `state`)
- 토큰 발급/갱신/폐기: `POST https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/token`, `Authorization: Basic base64(client_id:client_secret)`, form-encoded, `grant_type` = `authorization_code` | `refresh_token` | `delete`. 액세스 토큰은 24시간, 리프레시 토큰은 1년 유효(서버가 결정하는 값이라 여기서 하드코딩하지 않고 실제 응답의 `expires_in`을 읽음).
- 사용자 프로필: `GET https://prd.kr-ccapi.hyundai.com/api/v1/user/profile` → `{id, email, name, mobileNum, birthdate, lang, social}` (필드명은 `userId`가 아니라 `id`).
- 데이터 동의: `POST https://dev.kr-ccapi.hyundai.com/api/v1/car-service/terms/agreement` (`token`, `state`) — 로그인과 마찬가지로 리디렉션 기반이며 단순 서버-서버 호출이 아닙니다. 이걸 먼저 하지 않으면 데이터 엔드포인트가 전부 `5005 No Agreement Error`로 실패합니다. 철회: `GET .../api/v1/car-service/terms/reject`.
- 차량 목록: `GET https://dev.kr-ccapi.hyundai.com/api/v1/car/profile/carlist` → `{cars: [{carId, carNickname, carType, carName, carSellname}]}`.
- 커넥티드 서비스 가입 기간: `GET .../api/v1/car/profile/:carId/contract` → `{subscribeDate, endDate}` (YYYYMMDD).
- 주행거리: `GET .../api/v1/car/status/:carId/dte` → `{value, unit, timestamp}`; `GET .../api/v1/car/status/:carId/odometer` → `{odometers: [{value, unit, date, timestamp}]}`. 둘 다 동일한 단위 코드 사용(0:feet, 1:km, 2:meter, 3:miles).
- EV 배터리/충전: `GET .../ev/battery` → `{soc}`; `GET .../ev/charging` → `{batteryPlugin, batteryCharge, soc, targetSOC, remainTime}`.
- 경고등(7종): `GET .../api/v1/car/status/warning/:carId/{lowFuel|tirePressure|lampWire|smartKeyBattery|washerFluid|breakOil|engineOil}` → `{status: boolean}` (오타가 아니라 실제로 `brakeOil`이 아닌 `breakOil` 경로입니다).
- 모든 엔드포인트의 에러 바디는 `{errCode, errMsg, errId}` 형태 — `hyundai.ts`의 `describeError()`가 단순 HTTP 상태 코드 대신 이 내용을 로그에 남깁니다.
- 모든 데이터 API 호스트는 `dev.kr-ccapi.hyundai.com`입니다 — 규격서의 모든 엔드포인트에서 동일하게 확인됨. 즉 환경별 플래그가 아니라 고정 호스트입니다.

### 아직 사용할 수 없는 것

- **마지막 주차 위치**와 **90일 주행습관 안전점수** — 지금까지 검토한 규격서 페이지 어디에도 관련 엔드포인트가 없습니다. `fetchVehicleStatus`의 `lastParkedLat`/`lastParkedLon`은 계속 `null`이고, `fetchDrivingHabit`은 엔드포인트를 찾기 전까지 `null`을 반환합니다.
- 아직 OAuth + 데이터 동의 흐름을 끝까지 완료한 계정이 없어서, 위 파싱 로직은 규격서에 문서화된 예시 응답 기준으로만 검증되었고 실제 호출로는 검증되지 않았습니다.

---

## 관련 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 시스템 설계 & 데이터 흐름
- [PROGRESS.md](./PROGRESS.md) — 구현 현황 & 검증 로그
- [README.md](../README.md) — 설치 & 배포
