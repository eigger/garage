#!/usr/bin/env bash
set -euo pipefail

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/garage

export DEBIAN_FRONTEND=noninteractive
APT_QUIET_FLAGS=(-y -qq -o=Dpkg::Use-Pty=0)

echo "[garage-install] Updating apt indexes"
apt-get update "${APT_QUIET_FLAGS[@]}"

echo "[garage-install] Installing base dependencies"
apt-get install "${APT_QUIET_FLAGS[@]}" curl sudo mc jq git openssl ca-certificates gnupg lsb-release

echo "[garage-install] Installing Docker engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update "${APT_QUIET_FLAGS[@]}"
  apt-get install "${APT_QUIET_FLAGS[@]}" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "[garage-install] Preparing /opt/garage"
mkdir -p /opt/garage
cd /opt/garage

echo "[garage-install] Writing deployment files"
cat <<'EOF' > /opt/garage/Caddyfile
:80 {
	handle /api/* {
		reverse_proxy api:8080
	}

	# api의 헬스체크 라우트는 /api 프리픽스가 없어서 별도로 연결해준다.
	handle /health {
		reverse_proxy api:8080
	}

	handle {
		reverse_proxy web:3000
	}
}
EOF

cat <<'EOF' > /opt/garage/docker-compose.prod.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-garage}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-garage}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-garage}"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: ghcr.io/${GH_REPOSITORY_OWNER:-eigger}/garage-api:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -lc "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/index.js"
    volumes:
      - uploads:/app/uploads
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-garage}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-garage}
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      PORT: "8080"
      OPINET_API_KEY: ${OPINET_API_KEY:-}

  web:
    image: ghcr.io/${GH_REPOSITORY_OWNER:-eigger}/garage-web:latest
    restart: unless-stopped
    depends_on:
      - api
    environment:
      NODE_ENV: production

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - api
      - web

volumes:
  pgdata:
  uploads:
EOF

echo "[garage-install] Generating .env secrets"
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
cat <<EOF > /opt/garage/.env
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=garage
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=garage
JWT_SECRET=${JWT_SECRET}
OPINET_API_KEY=
EOF

echo "[garage-install] Creating systemd service"
cat <<'EOF' >/etc/systemd/system/garage.service
[Unit]
Description=Garage Docker Compose Stack
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/garage
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl enable -q --now garage.service

echo "[garage-install] Setting up console auto-login for root"
mkdir -p /etc/systemd/system/container-getty@1.service.d/
cat <<'EOF' >/etc/systemd/system/container-getty@1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF
systemctl daemon-reload
systemctl restart container-getty@1.service || true

# Keep update logic local so rate limits on remote helper scripts cannot break updates.
cat <<'EOF' >/usr/bin/update
#!/usr/bin/env bash
set -euo pipefail

set -a
[ -f /etc/profile.d/90-http-proxy.sh ] && . /etc/profile.d/90-http-proxy.sh
set +a

if [[ ! -d /opt/garage ]]; then
  echo "No Garage installation found at /opt/garage"
  exit 1
fi

cd /opt/garage
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
# 업데이트가 성공했을 때만 이 줄에 도달한다(set -e). 태그가 새 이미지로 넘어가면서
# 남는 예전 <none> 이미지를 지워서, 릴리스가 반복돼도 디스크가 계속 쌓이지 않게 한다.
docker image prune -f
echo "Garage update completed."
EOF
chmod +x /usr/bin/update

IP_ADDR="$(hostname -I | awk '{print $1}')"
echo "[garage-install] Completed successfully"
echo "Access URL: http://${IP_ADDR}:80"
