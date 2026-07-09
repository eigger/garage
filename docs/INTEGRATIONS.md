# API Integrations

This document lists every external service and device integration Garage uses or exposes.  
Implementation status reflects the current source tree. Keys managed in the admin UI (`/integrations`) are kept in sync with the `settingKeySchema` whitelist in `packages/shared/src/schemas/settings.ts`.

## Summary

| Integration | Direction | Status | Configuration | Purpose |
|---|---|---|---|---|
| [Opinet](#1-opinet-fuel-price-api) | Garage → external | **Available** | `/integrations` or `OPINET_API_KEY` | Nearby gas stations & prices |
| [OBD app (Torque Pro)](#2-obd-app-torque-pro) | external → Garage | **Available** | per-vehicle `apiToken` | OBD/GPS telemetry ingest |
| [REST telemetry](#3-rest-telemetry-ingest) | external → Garage | **Available** | per-vehicle `apiToken` | HA / generic JSON ingest |
| [WebSocket telemetry](#4-websocket-live-stream) | Garage → client | **Available** | per-vehicle `apiToken` | Live location & status |
| [MQTT (Mosquitto)](#5-mqtt-mosquitto--home-assistant) | Garage → external | Code ready | `MQTT_URL` + Compose | HA / Node-RED |
| [GitHub Releases](#6-github-releases-update-check) | Garage → external | **Available** | (none) | `/health` update notice |
| [Cloudflare Tunnel](#7-cloudflare-tunnel) | Infrastructure | Planned | `CLOUDFLARE_TUNNEL_TOKEN` | Remote HTTPS access |
| [Traccar](#8-traccar-gpsobd-hardware) | external → Garage | Planned | Compose service | Dedicated GPS/OBD loggers |
| [Map providers (OSM/Kakao/Naver/T map)](#9-map-providers-osm--kakao--naver--t-map) | Garage → external (optional) | **Available** | `/integrations` for Kakao/Naver/T map | Trip route visualization |
| [Navigation deep links](#10-navigation-deep-links-t-map--kakao--naver) | Garage → mobile apps | **Available** | (none) | Open T map / Kakao / Naver nav to saved fuel locations |
| [Vehicle records REST API](#11-vehicle-records-rest-api-fuel--maintenance) | external → Garage | **Available** | Garage user JWT (`/api/auth/login`) | Fuel logs, maintenance records, odometer side-effects |
| [PWA Web Push](#12-pwa-web-push) | Garage → client | **Available** | `VAPID_*` env vars | Due maintenance/admin reminder notifications |

---

## How integration keys are managed

### Admin UI (`/integrations`)

- **Access**: ADMIN only
- **API**: `GET/PUT/DELETE /api/settings` (`apps/api/src/routes/settings.ts`)
- **Storage**: PostgreSQL `Setting` table
- **Priority**: DB value → `.env` / docker-compose env fallback (`getSetting()`)
- **Security**: Plaintext keys are never returned (masked only). **Excluded from backup files**

### Per-vehicle API token (`apiToken`)

- **Issued**: Automatically on vehicle creation (UUID)
- **Management**: ADMIN view & reset only (`POST /api/vehicles/:id/token/reset`)
- **UI**: Web **Vehicle detail → OBD & GPS** (`/vehicles/[id]/integration`)
- **Purpose**: Credential for unauthenticated telemetry ingest — used by OBD apps, Home Assistant, scripts

---

## 1. Opinet fuel price API

| Field | Value |
|---|---|
| Status | Available (verified against live API) |
| Setting key | `OPINET_API_KEY` |
| Where to set | `/integrations` UI or `.env` / `docker-compose` |
| Issuer | [www.opinet.co.kr](https://www.opinet.co.kr) open API |
| Implementation | `apps/api/src/routes/opinet.ts` |

### External API Garage calls

```
GET https://www.opinet.co.kr/api/aroundAll.do
  ?code={OPINET_API_KEY}
  &out=json
  &x={KATEC_X}&y={KATEC_Y}
  &radius=5000
  &prodcd={B027|D047|K015}
  &sort=1
```

- Coordinates: browser GPS (WGS84) → KATEC (`proj4`)
- Fuel codes: `GASOLINE`→`B027`, `DIESEL`→`D047`, `LPG`→`K015`, `ELECTRIC`→skipped (empty array)

### Proxy API Garage exposes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/opinet/configured` | JWT (logged-in user) | Whether a key is set `{ configured: boolean }` |
| `GET` | `/api/opinet/stations` | JWT | Nearby stations via `lat`, `lon`, `fuelType` query params |
| `GET` | `/api/opinet/stations/:id` | JWT | Station detail — address, road address, WGS84 coordinates |

**List response fields**: `id`, `name`, `brand`, `brandLabel`, `distance` (m), `price` (KRW/L)

**Detail response fields**: summary fields plus `address`, `roadAddress`, `lat`, `lon`, `tel`

When a station is selected in **Quick Log**, Garage fetches detail and saves `latitude`, `longitude`, `address`, and `opinetStationId` on the fuel log. Saved coordinates power navigation buttons in history.

### Fallback behavior

- Missing `OPINET_API_KEY` or API error → **4 mock stations** returned
- Quick Log hides the **Find nearby stations** button when `GET /api/opinet/configured` is `false` (prevents saving fake prices)
- Manual station name input always works regardless of Opinet status

---

## 2. OBD app (Torque Pro)

| Field | Value |
|---|---|
| Status | Available |
| Auth | Query `token={apiToken}` |
| Implementation | `apps/api/src/routes/ingest.ts` |

### Endpoint

```
GET /api/ingest/obd/:vehicleId?token={apiToken}&speed=...&rpm=...&lat=...&lon=...&fuelLevel=...&odometer=...
```

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `token` | string | **Required** — vehicle `apiToken` |
| `speed` | number | Speed (km/h) |
| `rpm` | number | Engine RPM |
| `lat` | number | Latitude (WGS84) |
| `lon` | number | Longitude (WGS84) |
| `fuelLevel` | number | Fuel level (%) |
| `odometer` | number | Odometer — updated only when greater than stored value |
| `inVehicle` | boolean | Optional — `true`/`false`/`1`/`0`. When set, trusted for trip detection |

### Torque Pro setup

1. **Settings → Web Queue / OBD Web Server**
2. Enable **Send data to web server**
3. Paste the URL below into **Web Server URL** (copy from web **OBD & GPS** tab):

```
https://<your-host>/api/ingest/obd/<vehicleId>?token=<apiToken>
```

### Processing flow

1. Stored in `TelemetryRaw` with `source: "obd_app_get"`
2. Published to MQTT topic `car/{vehicleId}/telemetry` (when `MQTT_URL` is set)
3. Broadcast to WebSocket subscribers
4. Background trip job groups GPS points into trips

---

## 3. REST telemetry ingest

| Field | Value |
|---|---|
| Status | Available |
| Auth | `Authorization: Bearer {apiToken}` or query `?token=` |
| Implementation | `apps/api/src/routes/ingest.ts` |

### Endpoint

```
POST /api/ingest/telemetry/:vehicleId
Authorization: Bearer {apiToken}
Content-Type: application/json
```

### Request body (JSON)

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

All fields are optional. `odometer` follows the same monotonic-update rule as the Torque GET route.

### Trip detection (`inVehicle`)

The trip job (`apps/api/src/jobs/trips.ts`, `apps/api/src/lib/tripDetection.ts`) decides which points count toward a driving trip:

| `inVehicle` in request | Behavior |
|---|---|
| `true` | Trusted as an active driving point (requires `lat`/`lon` for route math) |
| `false` | Excluded from trip aggregation |
| omitted | Server infers from signals (see below) |

**Server fallback** (when `inVehicle` is omitted):

1. `odometer` increased vs. previous point
2. `rpm >= 400`
3. `source = obd_app_get` and `speed >= 8` km/h
4. `speed >= 18` km/h and ≥ 80 m displacement from previous point (GPS-only filter)

Torque Pro typically omits `inVehicle` and is handled by rules 1–3 automatically.

### Processing flow

1. Stored in `TelemetryRaw` with `source: "rest_api_post"`
2. Broadcast to WebSocket subscribers
3. *(Note: this route does not publish to MQTT today — only the Torque GET route does)*

---

### Home Assistant — copy & paste `rest_command`

Copy the block below into `configuration.yaml` (or a package YAML file), replace the three placeholders, then reload REST commands or restart Home Assistant.

**Placeholders**

| Placeholder | Where to find it |
|---|---|
| `GARAGE_HOST` | Garage server hostname or IP (no trailing slash), e.g. `192.168.1.50` or `garage.home` |
| `VEHICLE_ID` | Garage web UI → **Vehicles → OBD & GPS** (vehicle ID in the ingest URL) |
| `API_TOKEN` | Same page — **API token** value |

**Minimal config** — phone GPS with car Bluetooth presence (`inVehicle`):

```yaml
# --- Garage telemetry ingest (minimal) ---
# Paste into configuration.yaml, replace GARAGE_HOST / VEHICLE_ID / API_TOKEN, then reload rest commands.

rest_command:
  garage_send_telemetry:
    url: "http://GARAGE_HOST/api/ingest/telemetry/VEHICLE_ID"
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

**Full config** — all supported telemetry fields:

```yaml
# --- Garage telemetry ingest (full) ---
# Replace GARAGE_HOST, VEHICLE_ID, API_TOKEN, and sensor entity IDs below.

rest_command:
  garage_send_telemetry:
    url: "http://GARAGE_HOST/api/ingest/telemetry/VEHICLE_ID"
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

**Optional automation** — push telemetry every minute while driving (speed > 5 km/h):

```yaml
# --- Garage telemetry automation (optional) ---
# Add to automations.yaml. Adjust entity IDs and the speed threshold as needed.

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

**Manual test** — run from **Developer tools → Actions**:

```yaml
service: rest_command.garage_send_telemetry
```

**Using `secrets.yaml`** (recommended for the API token):

```yaml
# secrets.yaml
garage_host: "192.168.1.50"
garage_vehicle_id: "clxxxxxxxxxxxxxxxx"
garage_api_token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

```yaml
# configuration.yaml
rest_command:
  garage_send_telemetry:
    url: "http://!secret garage_host/api/ingest/telemetry/!secret garage_vehicle_id"
    method: POST
    headers:
      Authorization: "Bearer !secret garage_api_token"
      Content-Type: "application/json"
    payload: >-
      {
        "lat": {{ states('sensor.YOUR_LATITUDE_SENSOR') | float(0) }},
        "lon": {{ states('sensor.YOUR_LONGITUDE_SENSOR') | float(0) }},
        "speed": {{ states('sensor.YOUR_SPEED_SENSOR') | float(0) }},
        "inVehicle": {{ is_state('sensor.YOUR_CAR_BLUETOOTH_SENSOR', 'connected') | lower }}
      }
```

> **HTTPS**: If Garage is behind HTTPS, change `http://` to `https://` in the URL.  
> **`inVehicle`**: Set from car Bluetooth connection (or similar). When omitted, Garage applies server-side rules — phone GPS alone may not create trips while walking.  
> **Companion app GPS**: Common entity IDs are `sensor.<device>_geocoded_location` for geocoding only; for raw coordinates use a GPS/logger integration or create template sensors from `device_tracker` attributes.

---

## 4. WebSocket live stream

| Field | Value |
|---|---|
| Status | Available |
| Auth | Query `?token={apiToken}` |
| Implementation | `apps/api/src/routes/ingest.ts` |

### Endpoint

```
WS /api/ingest/telemetry/:vehicleId/ws?token={apiToken}
```

Pushes a JSON payload whenever telemetry is ingested. Connection closes immediately on auth failure.

---

## 5. MQTT (Mosquitto / Home Assistant)

| Field | Value |
|---|---|
| Status | Code ready — enable Mosquitto in Compose |
| Setting | `MQTT_URL` (e.g. `mqtt://mosquitto:1883`) |
| Implementation | `apps/api/src/lib/mqtt.ts`, `mosquitto/mosquitto.conf` |

### Behavior

- When `MQTT_URL` is unset, `publish()` is a **silent no-op** stub
- On successful Torque Pro GET ingest, publishes JSON to:

```
Topic: car/{vehicleId}/telemetry
Payload: { speed, rpm, lat, lon, fuelLevel, odometer, time }
```

### Enable

1. Uncomment the `mosquitto` service in `docker-compose.yml`
2. Add `MQTT_URL=mqtt://mosquitto:1883` to the API container
3. Connect Home Assistant to the broker and subscribe to the topic

> `docs/ARCHITECTURE.md` describes a future phase with MQTT discovery for reminders and fuel level. Only telemetry publish is implemented today.

---

## 6. GitHub Releases (update check)

| Field | Value |
|---|---|
| Status | Available |
| Configuration | None (hardcoded: `eigger/garage`) |
| Implementation | `apps/api/src/index.ts` — `/health` |

### Call

```
GET https://api.github.com/repos/eigger/garage/releases/latest
```

Cached for 30 minutes. `/health` returns `version`, `latestVersion`, `updateAvailable`.  
Network errors keep the last known version (health check does not fail).

---

## 7. Cloudflare Tunnel

| Field | Value |
|---|---|
| Status | Planned — Compose template only |
| Setting | `CLOUDFLARE_TUNNEL_TOKEN` |
| Location | `docker-compose.yml` `cloudflared` service (commented out) |

Planned setup: Tunnel in front of internal Caddy (HTTP :80) for remote access without port forwarding.

---

## 8. Traccar (GPS/OBD hardware)

| Field | Value |
|---|---|
| Status | Planned |
| Configuration | `docker-compose.yml` `traccar` service (commented out) |
| Plan | Traccar → Garage via webhook/MQTT with normalized location & speed |

Traccar handles 200+ device protocols; Garage would consume normalized events as a gateway (see `docs/ARCHITECTURE.md`).

---

## 9. Map providers (OSM / Kakao / Naver / T map)

| Field | Value |
|---|---|
| Status | **Available** — OSM by default; Kakao/Naver/T map when API keys are configured |
| Default | OpenStreetMap (Leaflet) — no API key required |
| Optional keys | `KAKAO_MAP_APP_KEY`, `NAVER_MAP_CLIENT_ID`, `TMAP_APP_KEY` via `/integrations` |
| Implementation | `apps/web/components/maps/*`, `GET /api/map/providers` |

### Behavior

- Trip routes are stored as Google-encoded polylines in `trips.routePolyline`.
- **History → Driving report → Map** opens the route on a map.
- Map provider dropdown appears only when more than one provider is available (`osm` is always included).
- Provider preference is saved in browser `localStorage` (`garage_map_provider`).

### API keys (optional)

| Key | Issuer | Notes |
|---|---|---|
| `KAKAO_MAP_APP_KEY` | [Kakao Developers](https://developers.kakao.com) | JavaScript key; register your Garage web domain |
| `NAVER_MAP_CLIENT_ID` | [Naver Cloud Platform Maps](https://www.ncloud.com/product/applicationService/maps) | Register site URL |
| `TMAP_APP_KEY` | [TMAP Open API](https://openapi.sk.com/) | JavaScript v2 SDK; register your web domain |

### Client API

```
GET /api/map/providers
Authorization: Bearer <JWT>
```

Response:

```json
{
  "providers": ["osm", "kakao", "tmap"],
  "kakaoAppKey": "...",
  "naverClientId": null,
  "tmapAppKey": "..."
}
```

Keys are returned to authenticated users for loading browser map SDKs (domain-restricted client keys).

---

## 10. Navigation deep links (T map / Kakao / Naver)

| Field | Value |
|---|---|
| Status | **Available** |
| Configuration | None — uses coordinates saved on fuel logs |
| Implementation | `apps/web/lib/navigation/deepLinks.ts`, `NavLaunchButtons` |

When a fuel log has `latitude` and `longitude` (from Opinet station detail or future sources), **Quick Log** and **History → Fuel** show buttons to open:

| App | URL scheme |
|---|---|
| T map | `tmap://route?goalname=…&goaly={lat}&goalx={lon}` |
| Kakao Navi | `https://map.kakao.com/link/to/{name},{lat},{lon}` |
| Naver Map | `nmap://route/car?dlat={lat}&dlng={lon}&dname={name}` |

These are standard mobile deep links; the user must have the app installed. Web fallbacks exist in code but are not shown in the UI yet.

---

## 11. Vehicle records REST API (fuel / maintenance)

| Field | Value |
|---|---|
| Status | **Available** |
| Auth | **JWT** from `POST /api/auth/login` (not the per-vehicle `apiToken`) |
| Access | User must have access to the target vehicle (`canAccessVehicle`) |
| Implementation | `apps/api/src/routes/fuelLogs.ts`, `apps/api/src/routes/maintenanceRecords.ts` |

Unlike telemetry ingest (sections 2–3), fuel and maintenance records require a **logged-in Garage account**. Use this for scripts, Home Assistant automations, or bulk backfill of historical data.

### Get a JWT

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

Response includes `token` (no expiration by default). Send it on every request:

```
Authorization: Bearer <JWT>
```

### Fuel logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/fuel-logs?vehicleId={id}&limit=&offset=` | List (newest first) |
| `POST` | `/api/fuel-logs` | Create |
| `PATCH` | `/api/fuel-logs/:id` | Update (partial body) |
| `DELETE` | `/api/fuel-logs/:id` | Delete |

**Create body** (`packages/shared/src/schemas/records.ts`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `vehicleId` | string | yes | Target vehicle |
| `date` | ISO date / string | yes | Past dates allowed (backfill) |
| `odometer` | integer ≥ 0 | yes | km at time of fill-up |
| `liters` | number > 0 | yes | |
| `cost` | integer ≥ 0 | yes | KRW |
| `fullTank` | boolean | no | default `true` |
| `location` | string | no | Station name |
| `latitude` | number \| null | no | WGS84 |
| `longitude` | number \| null | no | WGS84 |
| `address` | string \| null | no | Road or lot address |
| `opinetStationId` | string \| null | no | Opinet `UNI_ID` |

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

### Maintenance records

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/maintenance-records?vehicleId={id}&category=&search=&limit=&offset=` | List (newest first). `category`: `MAINTENANCE` or `ADMINISTRATIVE` |
| `POST` | `/api/maintenance-records` | Create |
| `PATCH` | `/api/maintenance-records/:id` | Update (partial body) |
| `DELETE` | `/api/maintenance-records/:id` | Delete |

**Create body**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vehicleId` | string | yes | |
| `date` | ISO date / string | yes | Past dates allowed |
| `odometer` | integer ≥ 0 | yes | km at time of service |
| `type` | string | yes | e.g. `엔진오일 교환` — syncs matching `ConsumablePart` schedule |
| `category` | `MAINTENANCE` \| `ADMINISTRATIVE` | no | default `MAINTENANCE`. Use `ADMINISTRATIVE` for inspection, insurance, tax |
| `cost` | integer ≥ 0 | no | |
| `shop` | string | no | Shop name |
| `notes` | string | no | |

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

### Odometer (`Vehicle.odometer`)

There is **no standalone “set odometer” endpoint**. The stored vehicle odometer is updated when:

| Source | Rule |
|---|---|
| `POST/PATCH` fuel log | `odometer` in body **>** current `Vehicle.odometer` → update vehicle |
| `POST/PATCH` maintenance record | same |
| Telemetry ingest (sections 2–3) | `odometer` query/body field, same monotonic rule |

**Read current value:**

```
GET /api/vehicles/:id/odometer
Authorization: Bearer <JWT>
```

→ `{ "odometer": 45230 }`

Backdated records with a **lower** odometer than the current vehicle value are saved normally but do **not** lower `Vehicle.odometer`.

### Attachments (optional)

After creating a record, upload a receipt:

```
POST /api/attachments?fuelLogId={id}
POST /api/attachments?maintenanceRecordId={id}
Authorization: Bearer <JWT>
Content-Type: multipart/form-data
```

Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

---

### Home Assistant — copy & paste `rest_command`

These commands use a **Garage login JWT**, not the vehicle `apiToken` used for telemetry. Obtain the JWT once via login and store it in `secrets.yaml`.

> Garage has **no standalone odometer endpoint** like LubeLogger.  
> `garage_add_odometer` uses a lightweight administrative maintenance record to bump `Vehicle.odometer` when the value is higher.  
> For live GPS/telemetry sync, use `garage_send_telemetry` (section 3) with the per-vehicle `apiToken` instead.

**Placeholders**

| Placeholder | Where to find it |
|---|---|
| `garage_host` | Garage server hostname or IP (no trailing slash), e.g. `192.168.0.244` |
| `garage_vehicle_id` | Garage web UI → vehicle detail URL (`/vehicles/{id}`) — string ID, not a number |
| `garage_jwt` | `POST /api/auth/login` response `token`, or Developer tools curl |

**`secrets.yaml`**

```yaml
garage_host: "192.168.0.244"
garage_vehicle_id: "clxxxxxxxxxxxxxxxx"
garage_jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
```

**LubeLogger-style commands** — pass values from automations via `service: rest_command...` `data:` (sensor/entity IDs stay in the automation, not in `configuration.yaml`):

```yaml
rest_command:
  garage_add_odometer:
    url: "http://!secret garage_host/api/maintenance-records"
    method: post
    content_type: "application/json"
    headers:
      Authorization: "Bearer !secret garage_jwt"
    payload: >
      {
        "vehicleId": "{{ vehicle_id | default('') }}",
        "date": "{{ date | default(now().strftime('%Y-%m-%d'), true) }}",
        "odometer": {{ odometer | default(0) | int }},
        "type": "주행거리 동기화",
        "category": "ADMINISTRATIVE",
        "notes": "{{ notes | default('홈어시스턴트 자동 동기화') }}"
      }

  garage_add_fuel:
    url: "http://!secret garage_host/api/fuel-logs"
    method: post
    content_type: "application/json"
    headers:
      Authorization: "Bearer !secret garage_jwt"
    payload: >
      {
        "vehicleId": "{{ vehicle_id | default('') }}",
        "date": "{{ date | default(now().strftime('%Y-%m-%d'), true) }}",
        "odometer": {{ odometer | default(0) | int }},
        "liters": {{ fuel_consumed | default(0.0) | float }},
        "cost": {{ cost | default(0) | int }},
        "fullTank": {% if is_full | default(true) %}true{% else %}false{% endif %},
        "location": "{{ location | default(notes | default('홈어시스턴트 자동 동기화'), true) }}"
      }
```

**Call from an automation** (sensor values supplied here):

```yaml
automation:
  - id: garage_sync_odometer_from_sensor
    alias: "Garage: sync odometer"
    trigger:
      - platform: state
        entity_id: sensor.your_odometer
    action:
      - service: rest_command.garage_add_odometer
        data:
          vehicle_id: !secret garage_vehicle_id
          odometer: "{{ states('sensor.your_odometer') }}"
          notes: "홈어시스턴트 자동 동기화"

  - id: garage_log_fuel_from_sensor
    alias: "Garage: log fuel"
    trigger:
      - platform: state
        entity_id: input_button.submit_fuel_log
    action:
      - service: rest_command.garage_add_fuel
        data:
          vehicle_id: !secret garage_vehicle_id
          odometer: "{{ states('sensor.your_odometer') }}"
          fuel_consumed: "{{ states('input_number.fuel_liters') }}"
          cost: "{{ states('input_number.fuel_cost') }}"
          is_full: true
          location: "{{ states('input_text.fuel_station') }}"
```

**Manual test** — Developer tools → Actions:

```yaml
service: rest_command.garage_add_fuel
data:
  vehicle_id: !secret garage_vehicle_id
  odometer: 45230
  fuel_consumed: 45.2
  cost: 75000
  is_full: true
  location: "OO주유소"
```

**Create fuel log** (entity IDs in `configuration.yaml` — older style):

```yaml
# --- Garage: create fuel log ---
rest_command:
  garage_create_fuel_log:
    url: "http://!secret garage_host/api/fuel-logs"
    method: POST
    headers:
      Authorization: "Bearer !secret garage_jwt"
      Content-Type: "application/json"
    payload: >-
      {
        "vehicleId": "!secret garage_vehicle_id",
        "date": "{{ now().strftime('%Y-%m-%d') }}",
        "odometer": {{ states('sensor.YOUR_ODOMETER_SENSOR') | int(0) }},
        "liters": {{ states('input_number.fuel_liters') | float(0) }},
        "cost": {{ states('input_number.fuel_cost') | int(0) }},
        "fullTank": true,
        "location": "{{ states('input_text.fuel_station') }}"
      }
```

**Create maintenance record**:

```yaml
# --- Garage: create maintenance record ---
rest_command:
  garage_create_maintenance:
    url: "http://!secret garage_host/api/maintenance-records"
    method: POST
    headers:
      Authorization: "Bearer !secret garage_jwt"
      Content-Type: "application/json"
    payload: >-
      {
        "vehicleId": "!secret garage_vehicle_id",
        "date": "{{ now().strftime('%Y-%m-%d') }}",
        "odometer": {{ states('sensor.YOUR_ODOMETER_SENSOR') | int(0) }},
        "type": "{{ states('input_text.maintenance_type') }}",
        "cost": {{ states('input_number.maintenance_cost') | int(0) }},
        "shop": "{{ states('input_text.maintenance_shop') }}"
      }
```

**Backfill a past fuel log** — set `date` and `odometer` explicitly:

```yaml
rest_command:
  garage_backfill_fuel_log:
    url: "http://!secret garage_host/api/fuel-logs"
    method: POST
    headers:
      Authorization: "Bearer !secret garage_jwt"
      Content-Type: "application/json"
    payload: >-
      {
        "vehicleId": "!secret garage_vehicle_id",
        "date": "2023-11-20",
        "odometer": 38500,
        "liters": 42.0,
        "cost": 68000,
        "fullTank": true,
        "location": "과거 주유소"
      }
```

> **JWT vs `apiToken`**: Telemetry (sections 2–3) uses the per-vehicle `apiToken` and does not create fuel/maintenance rows. Records API needs a user JWT.  
> **HTTPS**: Use `https://` when Garage is served over TLS.  
> **Field mapping (LubeLogger → Garage)**: `fuelConsumed` → `liters`, `isFillToFull` → `fullTank`, `vehicleId` is a string (`clx...`), not an integer.

---

## 12. PWA Web Push

| Field | Value |
|---|---|
| Status | **Available** |
| Configuration | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT` in `.env` |
| Implementation | `apps/api/src/lib/push.ts`, `apps/api/src/jobs/pushReminders.ts`, `apps/web/public/sw.js` |

### Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Add to `.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

Restart the API server after setting keys.

### User setup

1. Open Garage over **HTTPS** (required for Web Push; `localhost` is OK for dev)
2. **Profile → Push notifications → Enable**
3. Grant browser notification permission
4. On iOS: add Garage to the **home screen** first (iOS 16.4+)

### When pushes are sent

- Daily at **03:00** and **08:00** (server local time), after reminder sync
- For each `PENDING` reminder that is **actually due** (date or odometer) and not yet pushed (`pushNotifiedAt` is null)
- Recipients: **ADMIN** users + users with access to that vehicle
- Tapping the notification opens the vehicle **schedule** page

Dismissed reminders are not pushed again. Completing a schedule item starts a new cycle and resets push eligibility when the due date/odometer changes.

### API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/push/config` | none | `{ configured, publicKey }` |
| `GET` | `/api/push/status` | JWT | Current user's subscription state |
| `POST` | `/api/push/subscribe` | JWT | Register browser push subscription |
| `DELETE` | `/api/push/subscribe` | JWT | Remove subscription (`{ endpoint }`) |

---

## Adding a new integration (developers)

**External API key (admin UI):**

1. `packages/shared/src/schemas/settings.ts` — add key to `settingKeySchema`
2. `apps/web/app/integrations/page.tsx` — `SETTING_META` label/help mapping
3. `apps/web/lib/i18n/translations.ts` — ko/en translation keys
4. Feature route — read via `getSetting("NEW_KEY")`
5. `.env.example` — optional env var note

**Inbound device integration:**

1. `apps/api/src/routes/ingest.ts` or a dedicated route
2. `packages/shared/src/schemas/` — Zod validation schema
3. `apps/web/app/vehicles/[id]/integration/page.tsx` — setup instructions UI

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design & data flow
- [PROGRESS.md](./PROGRESS.md) — implementation status & verification log
- [README.md](../README.md) — install & deployment
