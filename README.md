# Garage

[![CI](https://github.com/eigger/garage/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/garage/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/garage/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/garage/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/garage)](https://github.com/eigger/garage/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/garage.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fgarage-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/garage/pkgs/container/garage-api)

An all-in-one self-hosted car management server for families and home labs — maintenance & consumables, fuel logging, reminders, OBD/GPS trip tracking, and optional Home Assistant-friendly MQTT.

Detailed architecture design: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · API integrations: [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) · Progress notes: [`docs/PROGRESS.md`](./docs/PROGRESS.md)

## Project Structure

```
garage/
  apps/
    api/      # Fastify + Prisma (JWT auth, ingest, jobs, Opinet, backup)
    web/      # Next.js App Router (PWA, ko/en i18n)
  packages/
    shared/   # Shared Zod schemas between API and Web
  docker-compose.yml       # Local build stack (postgres + api + web + caddy)
  docker-compose.prod.yml  # Production stack (pulls prebuilt GHCR images)
  Caddyfile                # Reverse proxy (/api → api, else → web)
  mosquitto/               # MQTT broker config (optional; enable when needed)
  proxmox/                 # Proxmox VE LXC one-click install scripts
```

## Features

**Available now**
- Vehicles, users, and per-vehicle access ACL (admin / general; optional live-location permission)
- Maintenance records, consumable/schedule items, distance + time dual-basis reminders
- Fuel-type maintenance preset templates (copied onto new vehicles)
- Fuel logging with receipt attachments; Opinet nearby-station lookup (optional API key)
- OBD app webhook ingest (Torque Pro Upload URL) and JSON telemetry ingest; auto trip segmentation
- Trip reports (weekly/monthly) with business/personal purpose tagging
- Dashboard due-reminder badges; admin backup/restore (`.tar.gz`)
- Settings UI for integration keys (e.g. Opinet, Kakao/Naver maps); PWA; language / distance / currency display prefs
- Trip route map (OpenStreetMap default; Kakao/Naver when API keys configured)
- Vehicle details including tire size and battery capacity

**Optional / upcoming**
- Mosquitto MQTT publish for Home Assistant (code ready; enable broker + `MQTT_URL`)
- Cloudflare Tunnel for remote access
- Traccar hardware gateway, driving-habit scores
- Redis + BullMQ worker split; Grafana cost/economy dashboards; family fuel-cost settlement

---

## Local Development Setup

### Prerequisites
- Node.js >= 20
- Docker (for PostgreSQL)

### Installation
1. Clone the repository and install workspace dependencies:
   ```sh
   npm install
   ```
2. Copy the environment template and set secrets:
   ```sh
   cp .env.example .env
   ```
   > [!IMPORTANT]
   > Set strong values for `POSTGRES_PASSWORD` and `JWT_SECRET`.
   >
   > For host-side Prisma/seed (outside Compose), also set:
   > `DATABASE_URL=postgresql://garage:<password>@localhost:5432/garage`
   > (Compose services use hostname `postgres`; the host machine must use `localhost`.)

3. Start PostgreSQL:
   ```sh
   docker compose up -d postgres
   ```

4. Run migrations:
   ```sh
   npm run prisma:migrate
   ```

5. Seed the initial admin (public sign-up is disabled):
   ```sh
   npm run seed -w apps/api
   ```
   Default credentials come from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

6. Start API and Web:
   ```sh
   npm run dev:api   # http://localhost:8080
   npm run dev:web   # http://localhost:3000
   ```

7. Open `http://localhost:3000/login` and sign in with the admin account.

Useful scripts: `npm run build`, `npm run test`, `npm run prisma:generate`.

---

## Production Deployment (Docker Compose)

Pull prebuilt images and run the full stack:

```sh
docker compose -f docker-compose.prod.yml up -d
```

Configure `/opt/garage/.env` (or the compose working directory `.env`) before starting:
- `POSTGRES_PASSWORD` — database password
- `JWT_SECRET` — JWT signing secret
- `OPINET_API_KEY` — Opinet open API key (optional; can also be set in the admin **API Integrations** UI)
- `GH_REPOSITORY_OWNER` — GHCR image owner (defaults to `eigger`)

Stack: PostgreSQL 16 + API + Web + Caddy on port 80. Mosquitto, cloudflared, Redis, and Traccar are commented out in `docker-compose.yml` until needed.

---

## Proxmox VE LXC One-Click Installation

Bootstrap an isolated Debian 12 LXC with Docker, pull production images, generate credentials, and start the stack from the **Proxmox VE shell**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/garage/master/proxmox/ct/garage.sh)"
```

When finished, open `http://<LXC_IP>` in a browser.

---

## API Integrations

External services, OBD/GPS ingest, and integration key management are documented in [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md).

Quick reference:
- **Opinet** (fuel prices): set `OPINET_API_KEY` in **API Integrations** (`/integrations`)
- **Torque Pro / REST / WebSocket**: per-vehicle `apiToken` on **Vehicles → OBD & GPS**
- **MQTT** (optional): set `MQTT_URL` and enable Mosquitto in Compose

---

## CI/CD

| Workflow | Trigger | Purpose |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | Push / PR to `master` | Install, Prisma generate, build, test |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release (or manual) | Build & push `garage-api` / `garage-web` to GHCR |

Images: `ghcr.io/<owner>/garage-api:latest` and `ghcr.io/<owner>/garage-web:latest` (also semver tags on release).

```yaml
# Forks: Repository Settings → Actions → General → Workflow permissions → Read and write
```

## License

MIT License. See [LICENSE](./LICENSE) for details.
