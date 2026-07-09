# Garage

[![CI](https://github.com/eigger/garage/actions/workflows/docker-publish.yml/badge.svg?branch=master)](https://github.com/eigger/garage/actions/workflows/docker-publish.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/garage)](https://github.com/eigger/garage/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/garage.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fgarage-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/garage/pkgs/container/garage-api)

An all-in-one self-hosted car management server (maintenance, consumables, fueling, and trip logging via OBD/GPS).

Detailed architecture design is available at [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Project Structure

```
garage/
  apps/
    api/      # Node.js Fastify backend + Prisma ORM
    web/      # Next.js frontend (App Router)
  packages/
    shared/   # Shared Zod schemas between API and Web
  docker-compose.yml       # Local development/build stack
  docker-compose.prod.yml  # Production deployment stack (pulls prebuilt images)
  Caddyfile                # Reverse proxy configuration
  mosquitto/               # MQTT broker configuration for OBD/GPS integration
```

## Features & Roadmap

- **Phase 1 (MVP - Available Now)**:
  - Maintenance & consumable items tracking.
  - Fuel logging and statistics.
  - Complete multi-container production stack (PostgreSQL + API + Web + Caddy).
- **Phase 2 (Upcoming)**:
  - MQTT broker integration (Mosquitto) for OBD data ingestion.
  - Cloudflare Tunnels integration for secure remote access.
- **Phase 3 (Upcoming)**:
  - Background task worker (Redis + BullMQ).
  - Dedicated GPS/OBD hardware logging server (Traccar).

---

## Local Development Setup

### Prerequisites
- Node.js >= 20
- Docker (for database)

### Installation
1. Clone the repository and install workspace dependencies:
   ```sh
   npm install
   ```
2. Copy the environment variables template and configure the required variables:
   ```sh
   cp .env.example .env
   ```
   > [!IMPORTANT]
   > Make sure to specify strong secrets for `POSTGRES_PASSWORD` and `JWT_SECRET`.

3. Spin up the development PostgreSQL database:
   ```sh
   docker compose up -d postgres
   ```

4. Run Prisma database migrations:
   ```sh
   npm run prisma:migrate
   ```

5. Seed the initial admin account (necessary as public sign-up is disabled):
   ```sh
   npm run seed -w apps/api
   ```
   *Verify default admin credentials inside `.env` (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).*

6. Start both backend and frontend development servers:
   ```sh
   npm run dev:api   # API: http://localhost:8080
   npm run dev:web   # Web: http://localhost:3000
   ```

7. Access the Web UI at `http://localhost:3000/login` and log in using your admin credentials.

---

## Production Deployment (Docker Compose)

To pull prebuilt Docker images and run the full stack immediately, use the production compose configuration:

```sh
docker compose -f docker-compose.prod.yml up -d
```

### Environment Variables
Configure the `/opt/garage/.env` file before starting:
- `POSTGRES_PASSWORD`: Database password
- `JWT_SECRET`: Web token signing secret
- `OPINET_API_KEY`: Opinet API key for gas station data (optional)
- `GH_REPOSITORY_OWNER`: GitHub username to pull images from (defaults to `eigger`)

---

## Proxmox VE LXC One-Click Installation

You can bootstrap a fully isolated self-hosted environment on Proxmox VE. The helper script automatically provisions a Debian 12 LXC container, configures Docker, pulls the latest production Docker images, generates cryptographic credentials, and starts the service.

Run the following command in your **Proxmox VE shell**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/garage/master/proxmox/ct/garage.sh)"
```

Once the setup completes, navigate to `http://<LXC_IP>` in your browser to access the system.

---

## CI/CD Pipeline

The project includes a GitHub Actions pipeline under [`.github/workflows/docker-publish.yml`](./.github/workflows/docker-publish.yml).
- Automatically builds and pushes containerized images to the GitHub Container Registry (GHCR) on push to the `master` branch.
- Generates `garage-api:latest` and `garage-web:latest`.

```yaml
# To publish your own, adjust permissions and trigger actions in your repository:
# Repository Settings -> Actions -> General -> Workflow Permissions -> "Read and write permissions"
```

## License

MIT License. See [LICENSE](./LICENSE) for details.
