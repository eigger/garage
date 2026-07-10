# Garage

[![CI](https://github.com/eigger/garage/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/garage/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/garage/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/garage/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/garage)](https://github.com/eigger/garage/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/garage.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fgarage-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/garage/pkgs/container/garage-api)

**[한국어 README](./README.ko.md)**

Self-hosted family car management — maintenance schedules, fuel logs, reminders, OBD/GPS trips, and optional Home Assistant integrations.

> Current release: **v0.2.12**

Docs: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) · [`docs/PROGRESS.md`](./docs/PROGRESS.md)

---

## Features

- Vehicles, users, and per-vehicle access ACL (admin / general)
- Maintenance + administrative schedules with distance/time dual reminders
- Fuel-type maintenance presets and global admin/legal presets
- Fuel logging with receipt attachments; Opinet nearby stations (optional)
- OBD ingest (Torque Pro) and REST/WebSocket telemetry; auto trip segmentation
- Trip reports, route maps (OSM / Kakao / Naver / T map)
- Dashboard reminder badges and vehicle summary cards
- Admin backup/restore, PWA, ko/en i18n
- First-run admin bootstrap when the user table is empty

---

## Screenshots & how to use

### 1. Dashboard

Home screen after login. Open **Manage vehicles**, **Manage users**, **Manage maintenance presets**, or **API Integrations**. Each registered vehicle shows odometer, recent distance, last fuel cost, and overdue / upcoming reminder counts.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/01-dashboard.png" alt="Dashboard" width="960" />

### 2. Vehicle overview

Per-vehicle hub: summary cards, monthly cost, and tabs for **Overview**, **Quick Log**, **Schedule**, and **History**. Use the gear icon for vehicle settings and OBD/GPS.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/02-vehicle.png" alt="Vehicle overview" width="960" />

### 3. Quick Log

Log fuel or maintenance without leaving the vehicle page. Fuel entry supports station, unit price, liters, cost shortcuts, and receipt attachments. Switch to **Maintenance** for service records tied to schedule items.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/03-quick-log.png" alt="Quick Log" width="960" />

### 4. Schedule

Distance- and time-based maintenance / admin items (oil, inspection, insurance, tax, …). Edit intervals, mark completed, and jump into Quick Log from reminders.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/04-schedule.png" alt="Schedule" width="960" />

### 5. History

Trips, fuel logs, and maintenance history in one place. Fuel efficiency is calculated between full-tank fills (`km/L` / `L/100km`).

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/05-history.png" alt="History" width="960" />

### 6. API Integrations

Admin page for Opinet, Kakao Map, Naver Map, and T map keys. Values apply immediately (no restart) and are not included in backup archives.

<img src="https://raw.githubusercontent.com/eigger/garage/master/docs/screenshots/en/06-integrations.png" alt="API Integrations" width="960" />

---

## Quick start

### 1. Install

**Proxmox (recommended)**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/garage/master/proxmox/ct/garage.sh)"
```

Open `http://<LXC_IP>` when finished.

**Docker Compose**

```sh
docker compose -f docker-compose.prod.yml up -d
```

Set `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env` first.

### 2. Create the first admin

On a fresh install, `/login` shows **Create first admin** when no users exist.

1. Open `/login`
2. Enter name, email, password
3. Submit — you are signed in as `ADMIN`

Public sign-up is disabled. Later accounts are created only by an admin under **Manage users**.

### 3. Register a vehicle

1. Dashboard → **Manage vehicles**
2. Fill name, plate, make/model/year, **fuel type**
3. Save

Garage copies maintenance presets for that fuel type and administrative/legal schedule items (inspection, insurance, tax, …). Manage defaults under **Manage maintenance presets**.

### 4. Day-to-day

| Task | Where |
|---|---|
| Log fuel / maintenance | Vehicle → **Quick Log** |
| Edit schedule intervals | Vehicle → **Schedule** |
| History, efficiency, trips | Vehicle → **History** |
| OBD / Torque / REST token | Vehicle → gear → **OBD & GPS** |
| Family accounts | Dashboard → **Manage users** |
| Opinet / map API keys | Dashboard → **API Integrations** |
| Backup / restore | Top bar → **Backup/Restore** |

### 5. OBD / Home Assistant (short)

Telemetry uses the vehicle `apiToken` (not the login JWT):

```http
POST /api/ingest/telemetry/<vehicleId>
Authorization: Bearer <apiToken>
Content-Type: application/json

{ "speed": 65, "lat": 37.56, "lon": 126.97, "odometer": 45230, "inVehicle": true }
```

Fuel / maintenance record APIs: [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md).  
Copy the ingest URL and token from **Vehicles → OBD & GPS**.

---

## Project structure

```
garage/
  apps/
    api/      # Fastify + Prisma
    web/      # Next.js App Router (PWA, ko/en)
  packages/
    shared/   # Shared Zod schemas / catalogs
  docker-compose.yml / docker-compose.prod.yml
  Caddyfile
  proxmox/    # LXC one-click install
```

---

## Local development

```sh
npm install
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d postgres
npm run prisma:migrate
npm run seed -w apps/api   # optional if you prefer seed admin over bootstrap UI
npm run dev:api            # :8080
npm run dev:web            # :3000
```

Open `http://localhost:3000/login`.

Useful scripts: `npm run build`, `npm run test`, `npm run prisma:generate`.

---

## Production notes

- Stack: PostgreSQL 16 + API + Web + Caddy (`:80`)
- API runs `prisma migrate deploy` on startup (prod compose)
- Images: `ghcr.io/<owner>/garage-api` / `garage-web` (`latest` + semver tags)
- Update LXC: `update` in the container (pulls compose images)

---

## CI/CD

| Workflow | Trigger | Purpose |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | Push / PR to `master` | Install, build, test |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release | Push images to GHCR |

---

## License

MIT. See [LICENSE](./LICENSE).
