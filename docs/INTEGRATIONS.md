# API Integrations

This document lists every external service and device integration Garage uses or exposes.  
Implementation status reflects the current source tree. Keys managed in the admin UI (`/integrations`) are kept in sync with the `settingKeySchema` whitelist in `packages/shared/src/schemas/settings.ts`.

## Summary

| Integration | Direction | Status | Configuration | Purpose |
|---|---|---|---|---|
| [Opinet](#1-opinet-fuel-price-api) | Garage → external | **Available** | `/integrations` or `OPINET_API_KEY` | Nearby gas stations & prices |
| [EV charging stations (K-eco)](#14-ev-charging-station-api-한국환경공단-evcharger) | Garage → external | **Available** | `/integrations` or `EV_CHARGER_API_KEY` | Nearby chargers, live status, connector type |
| [OBD app (Torque Pro)](#2-obd-app-torque-pro) | external → Garage | **Available** | per-vehicle `apiToken` | OBD/GPS telemetry ingest |
| [REST telemetry](#3-rest-telemetry-ingest) | external ↔ Garage | **Available** | per-vehicle `apiToken` | HA / generic JSON ingest + status/reminders read |
| [WebSocket telemetry](#4-websocket-live-stream) | Garage → client | **Available** | per-vehicle `apiToken` | Live location & status |
| [MQTT (Mosquitto)](#5-mqtt-mosquitto--home-assistant) | Garage → external | Code ready | `MQTT_URL` + Compose | HA / Node-RED |
| [GitHub Releases](#6-github-releases-update-check) | Garage → external | **Available** | (none) | `/health` update notice |
| [Cloudflare Tunnel](#7-cloudflare-tunnel) | Infrastructure | Planned | `CLOUDFLARE_TUNNEL_TOKEN` | Remote HTTPS access |
| [Traccar](#8-traccar-gpsobd-hardware) | external → Garage | Planned | Compose service | Dedicated GPS/OBD loggers |
| [Map providers (OSM/Kakao/Naver/T map)](#9-map-providers-osm--kakao--naver--t-map) | Garage → external (optional) | **Available** | `/integrations` for Kakao/Naver/T map | Trip route visualization |
| [Navigation deep links](#10-navigation-deep-links-t-map--kakao--naver) | Garage → mobile apps | **Available** | (none) | Open T map / Kakao / Naver nav to saved fuel locations |
| [Vehicle records REST API](#11-vehicle-records-rest-api-fuel--maintenance) | external → Garage | **Available** | Garage user JWT (`/api/auth/login`) | Fuel logs, maintenance records, odometer side-effects |
| [PWA Web Push](#12-pwa-web-push) | Garage → client | **Available** | `VAPID_*` env vars | Due maintenance/admin reminder notifications |
| [API Explorer](#13-api-explorer) | (developer tool) | **Available** | ADMIN login | Browse & test every REST endpoint from the web UI |
| [Hyundai Developers (Bluelink)](#15-hyundai-developers-connected-car-api) | external → Garage | Wired against spec, not live-tested | `/integrations` (`HYUNDAI_CLIENT_ID`/`_SECRET`) | Mileage, EV battery/charging, warning lights — no OBD dongle needed |

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
  &sort={1=price, 2=distance}
```

- Coordinates: browser GPS (WGS84) → KATEC (`proj4`)
- Fuel codes: `GASOLINE`→`B027`, `DIESEL`→`D047`, `LPG`→`K015`, `ELECTRIC`→skipped (empty array)
- `sort` is threaded through from the `NearbyStationsCard` UI's 거리순/가격순 toggle — each toggle re-queries Opinet directly (rather than re-sorting a client-cached list), so whichever 5 stations are shown always match what was actually detail-fetched for nav/map coordinates.

### Proxy API Garage exposes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/opinet/configured` | JWT (logged-in user) | Whether a key is set `{ configured: boolean }` |
| `GET` | `/api/opinet/stations` | JWT | Nearby stations via `lat`, `lon`, `fuelType`, `sort` (`distance` \| `price`, default `distance`) query params |
| `GET` | `/api/opinet/stations/:id` | JWT | Station detail — address, road address, WGS84 coordinates |

**List response fields**: `id`, `name`, `brand`, `brandLabel`, `distance` (m), `price` (KRW/L)

**Detail response fields**: summary fields plus `address`, `roadAddress`, `lat`, `lon`, `tel`

When a station is selected in **Quick Log**, Garage fetches detail and saves `latitude`, `longitude`, `address`, and `opinetStationId` on the fuel log. Saved coordinates power navigation buttons in history.

On the **vehicle overview** page, `NearbyStationsCard` caps results to the top 5 (per whichever sort is active) and numbers them 1–5 — the same numbers are drawn on the last-location map's markers (`LastLocationMap`), so a result can be matched to its map pin without needing per-provider click/hover handling. The vehicle's own position is never part of this numbering or the 5-item cap.

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
GET /api/ingest/obd?token={apiToken}&speed=...&rpm=...&lat=...&lon=...&fuelLevel=...&odometer=...
```

`token` alone identifies the vehicle — it's unique per vehicle (`Vehicle.apiToken`), so no separate `vehicleId` path segment is needed.

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `token` | string | **Required** — vehicle `apiToken`, also identifies which vehicle |
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
https://<your-host>/api/ingest/obd?token=<apiToken>
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
POST /api/ingest/telemetry
Authorization: Bearer {apiToken}
Content-Type: application/json
```

`apiToken` alone identifies the vehicle (unique per vehicle) — no `vehicleId` path segment needed.

The `Bearer` prefix is optional: `Authorization: {apiToken}` (no prefix) works too. This isn't an OAuth token, just a per-vehicle shared secret, so plain clients that can't easily add a prefix are supported.

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

### Vehicle status & reminders (read)

Same `apiToken` auth as above (query `?token=` or `Authorization: Bearer`), but for **reading** instead of writing — this is what a Home Assistant `rest` sensor should poll. No user login is needed.

```
GET /api/ingest/status?token={apiToken}
```

Returns the vehicle row plus its latest known telemetry (never includes `apiToken` itself):

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

Returns every `PENDING` maintenance/admin reminder for the vehicle, each with `currentOdometer` and a computed `isDue` (date or odometer threshold reached):

```json
[
  { "type": "engineOilFilter", "dueDate": "2024-07-01T00:00:00.000Z", "dueOdometer": 50000, "isDue": false, "currentOdometer": 45230 }
]
```

Both return `401 { "error": "unauthorized" }` when the token is missing or invalid — a quick way to sanity-check a token from a terminal:

```bash
curl "https://GARAGE_HOST/api/ingest/status?token=YOUR_VEHICLE_API_TOKEN"
```

Admins can also click through every endpoint (including these) from the web UI — see **[API Explorer](#13-api-explorer)**.

---

### Home Assistant — copy & paste `rest_command`

Copy the block below into `configuration.yaml` (or a package YAML file), replace the three placeholders, then reload REST commands or restart Home Assistant.

**Placeholders**

| Placeholder | Where to find it |
|---|---|
| `GARAGE_HOST` | Garage server hostname or IP (no trailing slash), e.g. `192.168.1.50` or `garage.home` |
| `API_TOKEN` | Garage web UI → **Vehicles → OBD & GPS** — **API token** value (identifies the vehicle too, no separate ID needed) |

**Minimal config** — phone GPS with car Bluetooth presence (`inVehicle`):

```yaml
# --- Garage telemetry ingest (minimal) ---
# Paste into configuration.yaml, replace GARAGE_HOST / API_TOKEN, then reload rest commands.

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

**Full config** — all supported telemetry fields:

```yaml
# --- Garage telemetry ingest (full) ---
# Replace GARAGE_HOST, API_TOKEN, and sensor entity IDs below.

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

**Read Garage back into HA** — `rest` sensors that poll `GET /api/ingest/status` (Garage → HA direction, no telemetry push needed):

```yaml
# --- Garage status sensors (read) ---
# Paste into configuration.yaml, replace GARAGE_HOST / API_TOKEN.

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

**Direct URL example** (no `secrets.yaml`):

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
WS /api/ingest/telemetry/ws?token={apiToken}
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
| Auth | **JWT** from `POST /api/auth/login` (Standard) or per-vehicle **apiToken** (Simplified) |
| Access | User must have access to the target vehicle, or use valid per-vehicle `apiToken` |
| Implementation | `apps/api/src/routes/fuelLogs.ts`, `apps/api/src/routes/maintenanceRecords.ts`, `apps/api/src/routes/ingest.ts` |

For third-party integrations (Home Assistant, scripts, automations), you can use either the **Standard API** (requires user login JWT) or the **Simplified Ingest API** (requires only the per-vehicle `apiToken`).

---

### 1) Simplified Ingest API (Recommended for HA & Scripts)

Identify and authenticate the vehicle using its unique `apiToken` in the query parameter `?token=...` or `Authorization: Bearer <apiToken>` header. No `vehicleId` path segment or body field is required.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ingest/fuel-logs` | Create fuel log |
| `POST` | `/api/ingest/maintenance-records` | Create maintenance record |

#### Fuel logs (Simplified)
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

#### Maintenance records (Simplified)
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

### 2) Standard API (requires User JWT)

Requires a logged-in user account. Get a JWT:

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

Response includes `token` (no expiration by default). Send it on every request: `Authorization: Bearer <JWT>`.

#### Fuel logs (Standard)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vehicles/{id}/fuel-logs?limit=&offset=` | List (newest first) |
| `POST` | `/api/vehicles/{id}/fuel-logs` | Create |
| `PATCH` | `/api/vehicles/{id}/fuel-logs/:logId` | Update (partial body) |
| `DELETE` | `/api/vehicles/{id}/fuel-logs/:logId` | Delete |

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

#### Maintenance records (Standard)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vehicles/{id}/maintenance-records?category=&search=&limit=&offset=` | List (newest first) |
| `POST` | `/api/vehicles/{id}/maintenance-records` | Create |
| `PATCH` | `/api/vehicles/{id}/maintenance-records/:recordId` | Update (partial body) |
| `DELETE` | `/api/vehicles/{id}/maintenance-records/:recordId` | Delete |

**Create body**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vehicleId` | string | yes | |
| `date` | ISO date / string | yes | Past dates allowed |
| `odometer` | integer ≥ 0 | yes | km at time of service |
| `type` | string | yes | e.g. `엔진오일 교환` |
| `category` | `MAINTENANCE` \| `ADMINISTRATIVE` | no | default `MAINTENANCE` |
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

### Home Assistant — Garage API 형식 `rest_command`

아래는 차량의 `apiToken`을 사용한 단순화된 ingest API 형식입니다.

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

## 13. API Explorer

| Field | Value |
|---|---|
| Status | **Available** |
| Access | ADMIN only, web UI `/api-explorer` |
| Implementation | `apps/web/app/api-explorer/page.tsx` |

A built-in page listing every REST endpoint in this document, grouped by how it authenticates:

- **JWT (로그인 세션)** — read-only `GET` endpoints are one-click testable using the admin's own session; the response is shown as formatted JSON.
- **차량 apiToken** — pick a vehicle from a dropdown (its token is fetched the same way `/vehicles/[id]/integration` does), then test `GET /api/ingest/status` and `GET /api/ingest/reminders` live.
- Endpoints that create/modify/delete data (`POST`/`PATCH`/`DELETE`) are listed for reference with a ready-to-copy `curl` command, but are **not** one-click runnable — this page is meant for safely checking that reads work (e.g. before wiring up a Home Assistant sensor), not for driving the app.

---

## 14. EV charging station API (한국환경공단 EvCharger)

| Field | Value |
|---|---|
| Status | Available (verified against live API) |
| Setting key | `EV_CHARGER_API_KEY` (+ `EV_CHARGER_API_KEY_EXPIRES_AT`, plain date, not a secret) |
| Where to set | `/integrations` UI or `.env` / `docker-compose` |
| Issuer | [data.go.kr — 한국환경공단_전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do) |
| Implementation | `apps/api/src/lib/evCharger.ts`, `apps/api/src/routes/evCharger.ts` |

### External API Garage calls

```
GET https://apis.data.go.kr/B552584/EvCharger/getChargerInfo
  ?serviceKey={EV_CHARGER_API_KEY}
  &dataType=JSON
  &numOfRows=1000&pageNo=1
  &zcode={시도 코드, optional}
```

Unlike Opinet, this API has **no lat/lon + radius search** — only `zcode` (시도, 2-digit) / `zscode` (시군구) region filtering. Garage works around this:

1. Frontend reverse-geocodes the vehicle's last-known coordinates (existing Kakao/Naver `reverseGeocode()`) to get an address string.
2. Backend extracts the first token (시도 name, e.g. `서울특별시`) and maps it to a `zcode` via a static 17-entry table in `evCharger.ts` (no Kakao REST key needed — the map JS key can't call Kakao's REST-only `coord2regioncode`).
3. All chargers in that 시도 are fetched, grouped by `statId` (one row per connector), and re-sorted by real `haversineKm()` distance — same "nearest first" UX as Opinet, at the cost of over-fetching within a large 시도.

### Proxy API Garage exposes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/ev-charger/configured` | JWT | Whether a key is set `{ configured: boolean }` |
| `GET` | `/api/ev-charger/stations` | JWT | Nearby chargers via `lat`, `lon`, `address` (optional, for zcode resolution) query params |

**Response fields**: `id` (statId), `name`, `operator`, `distance` (m), `lat`, `lon`, `address`, `parkingFree`, `connectors[]` (`chgerId`, `type`, `status`, `output` kW)

`status` is normalized from the API's `stat` code into `AVAILABLE | CHARGING | RESERVED | OUT_OF_SERVICE | UNKNOWN`. Both `type` (01–11) and `status` are locale-agnostic codes — the frontend translates them to a human-readable label (`NearbyStationsCard.tsx`), so the API never returns Korean-only display text for these fields.

Surfaced on the **vehicle overview page** (`NearbyStationsCard`) as a standalone "주변 충전소 찾기" card, separate from Quick Log — checking charger availability is a pre-departure decision for EV owners, not something tied to logging a completed charge. Each result links out via the existing nav deep-link buttons (T map / Kakao / Naver). Same top-5 cap and map-marker numbering as the Opinet flow above (§1) — there's no price field here, so only distance sort applies.

### Fallback behavior

- Missing `EV_CHARGER_API_KEY`, unresolvable `zcode`, or API error → **4 mock chargers** returned (synthesized near the query coordinates)
- No separate "configured" gate on the button — the card always shows a "찾기" button and silently falls back to mock data, since browsing chargers has no cost/price side effect worth blocking (unlike Opinet, which hides the button to avoid saving fake prices to a fuel log)

### Key expiration

data.go.kr key applications default to a **2-year validity period** and expire automatically — there's no API to query the expiry date. `/integrations` has a dedicated date-input card (separate from the masked-secret rows) where the admin records the expiry manually; a warning banner appears starting 30 days out (`EV_CHARGER_API_KEY_EXPIRES_AT` is the one setting key whose plain value `GET /api/settings` returns, since it's a date, not a secret).

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

## 15. Hyundai Developers (connected car API)

| Field | Value |
|---|---|
| Status | **Wired against the confirmed API spec, not yet live-tested** — every endpoint below is implemented and unit-tested against the console's own API specification pages. No account has actually completed the full OAuth + data-consent flow yet, so nothing has been verified against a real response. |
| Setting keys | `HYUNDAI_CLIENT_ID`, `HYUNDAI_CLIENT_SECRET` |
| Where to set | `/integrations` UI |
| Issuer | [developers.hyundai.com](https://developers.hyundai.com) ("Hyundai Developers") |
| Implementation | `apps/api/src/lib/hyundai.ts` (+ `hyundai.test.ts`), `apps/api/src/lib/hyundaiToken.ts`, `apps/api/src/routes/hyundai.ts`, `apps/api/src/routes/hyundaiWebhook.ts`, `apps/api/src/jobs/hyundaiSync.ts` |

### Why

Reviewed as an alternative to OBD-dongle-based ingest (see [OBD app](#2-obd-app-torque-pro)):
domestic (Korea-registered) Bluelink-connected vehicles expose real odometer, EV battery/charging
state, and dashboard warning lights directly from Hyundai's own cloud — no phone app, no Bluetooth
dongle. Note this only gives periodic odometer/status *snapshots* (updated by the car itself at
ignition-off) — not per-trip route/duration/speed history like the OBD/GPS ingest path produces;
the two are complementary, not a replacement for one another.

### Automatic odometer sync

`apps/api/src/jobs/hyundaiSync.ts` runs once on server boot and twice daily (07:00, 19:00 — matching
the `reminders` job's cadence, chosen because Bluelink odometer data only updates at ignition-off,
so polling more often has no effect). For every `HyundaiVehicleLink`, it fetches mileage and bumps
`Vehicle.odometer` **only if the fetched value is higher** than what's stored — the same
non-destructive rule the OBD webhook ingest uses (`bumpOdometerIfHigher`), so a more-recent manual
entry is never overwritten by a stale Bluelink read.

### Data model

- `Setting` (`HYUNDAI_CLIENT_ID` / `HYUNDAI_CLIENT_SECRET`) — app-level OAuth client credentials, admin-managed, excluded from backup like other integration keys.
- `HyundaiAccountLink` — one row per Garage `User` who has linked their own Hyundai account (access/refresh token, the `redirectUri` used at login so refresh can reuse it, and `hyundaiUserId` — Hyundai's own user id from `/user/profile`, used to match the deletion webhook below). Personal, not admin-scoped — each family member links their own Bluelink account.
- `HyundaiVehicleLink` — maps one Garage `Vehicle` to one Hyundai `carId`, referencing whichever `HyundaiAccountLink` owns it (not necessarily the requester — token lookups always resolve through the vehicle's own link, per `getValidAccessTokenForVehicleLink` in the route file).

### API Garage exposes (`/api/hyundai/*`, all JWT-authenticated)

| Method | Path | Description |
|---|---|---|
| `GET` | `/configured` | Whether admin has set Client ID/Secret |
| `GET` | `/account` | Whether the current user has linked their own Hyundai account |
| `GET` | `/authorize-url?redirectUri=` | Login URL to redirect the user to |
| `POST` | `/link` | Exchange an authorization code for tokens, store against the current user |
| `DELETE` | `/account` | Unlink the current user's Hyundai account (revokes the token and withdraws data consent) |
| `GET` | `/vehicles` | List the linked account's Hyundai vehicles (candidates for matching to a Garage vehicle) |
| `PUT` | `/vehicles/:vehicleId/link` | Link a Garage vehicle to a Hyundai `carId` |
| `DELETE` | `/vehicles/:vehicleId/link` | Unlink |
| `GET` | `/vehicles/:vehicleId/mileage` | Odometer + distance-to-empty |
| `GET` | `/vehicles/:vehicleId/status` | Warning lights (7 types) |
| `GET` | `/vehicles/:vehicleId/driving-habit` | Not yet available — see below |

`POST /api/hyundai/webhook` (no JWT, public) is Hyundai's "데이터 조회 불가 상태 알림" callback —
register it as the Callback URL in the console's "설정 - 데이터 API" page. On account deletion,
vehicle deletion, or consent withdrawal it deletes the corresponding `HyundaiAccountLink`/
`HyundaiVehicleLink` row, per the 개인정보보호법 requirement to purge data immediately on notice.

### Confirmed against the console's own API specification (not just the walkthrough guide)

- Login: `GET https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/authorize` (`response_type`, `client_id`, `redirect_uri`, `state`)
- Token issue/refresh/revoke: `POST https://prd.kr-ccapi.hyundai.com/api/v1/user/oauth2/token`, `Authorization: Basic base64(client_id:client_secret)`, form-encoded, `grant_type` = `authorization_code` | `refresh_token` | `delete`. Access tokens last 24h, refresh tokens 1 year (server-controlled; not hardcoded here since `expires_in` is read from the actual response).
- User profile: `GET https://prd.kr-ccapi.hyundai.com/api/v1/user/profile` → `{id, email, name, mobileNum, birthdate, lang, social}` (the field is `id`, not `userId`).
- Data consent: `POST https://dev.kr-ccapi.hyundai.com/api/v1/car-service/terms/agreement` (`token`, `state`) — redirect-based like login, not a plain server-to-server call; required before *any* data endpoint works (otherwise every call fails with `5005 No Agreement Error`). Withdrawal: `GET .../api/v1/car-service/terms/reject`.
- Vehicle list: `GET https://dev.kr-ccapi.hyundai.com/api/v1/car/profile/carlist` → `{cars: [{carId, carNickname, carType, carName, carSellname}]}`.
- Connected-service subscription dates: `GET .../api/v1/car/profile/:carId/contract` → `{subscribeDate, endDate}` (YYYYMMDD).
- Mileage: `GET .../api/v1/car/status/:carId/dte` → `{value, unit, timestamp}`; `GET .../api/v1/car/status/:carId/odometer` → `{odometers: [{value, unit, date, timestamp}]}`. Both use the same unit code (0:feet, 1:km, 2:meter, 3:miles).
- EV battery/charging: `GET .../ev/battery` → `{soc}`; `GET .../ev/charging` → `{batteryPlugin, batteryCharge, soc, targetSOC, remainTime}`.
- Warning lights (7): `GET .../api/v1/car/status/warning/:carId/{lowFuel|tirePressure|lampWire|smartKeyBattery|washerFluid|breakOil|engineOil}` → `{status: boolean}` (note `breakOil`, not `brakeOil` — that's the real path).
- Every endpoint's error body is `{errCode, errMsg, errId}` — `hyundai.ts`'s `describeError()` surfaces this in logs instead of a bare HTTP status.
- All data-api hosts are `dev.kr-ccapi.hyundai.com` — confirmed across every endpoint in the spec, so this is a fixed host rather than an environment flag.

### Still not available

- **Last-parked location** and **90-day driving-habit safety score** — no endpoint for either has appeared in the specification pages reviewed so far. `fetchVehicleStatus`'s `lastParkedLat`/`lastParkedLon` stay `null`, and `fetchDrivingHabit` returns `null` until an endpoint is found.
- No account has completed the OAuth + data-consent flow end-to-end yet, so the parsing logic above is verified against the spec's documented sample responses, not a live call.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design & data flow
- [PROGRESS.md](./PROGRESS.md) — implementation status & verification log
- [README.md](../README.md) — install & deployment
