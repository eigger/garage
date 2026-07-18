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
      EV_CHARGER_API_KEY: ${EV_CHARGER_API_KEY:-}

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
EV_CHARGER_API_KEY=
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

# /usr/bin/update는 실행 시점마다 최신 업데이트 스크립트를 받아서 실행하는 얇은 래퍼다.
# 로직을 여기(설치 시점)에 그대로 박아두면, 이후 이 저장소에서 업데이트 스크립트가
# 개선돼도(예: dangling 이미지 정리 추가) 이미 설치된 컨테이너는 그 개선을 영영 못
# 받는 문제가 있었다 — 실제로 v0.2.14에 추가된 `docker image prune -f`가 그 이전에
# 설치된 컨테이너에는 반영되지 않아 디스크가 계속 쌓인 사례가 있었음.
cat <<'EOF' >/usr/bin/update
#!/usr/bin/env bash
set -euo pipefail

set -a
[ -f /etc/profile.d/90-http-proxy.sh ] && . /etc/profile.d/90-http-proxy.sh
set +a

curl -fsSL https://raw.githubusercontent.com/eigger/garage/master/proxmox/ct-update.sh | bash
EOF
chmod +x /usr/bin/update

IP_ADDR="$(hostname -I | awk '{print $1}')"
echo "[garage-install] Completed successfully"
echo "Access URL: http://${IP_ADDR}:80"
