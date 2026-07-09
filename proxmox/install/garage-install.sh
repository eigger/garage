#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/garage

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y curl sudo mc jq git openssl
msg_ok "Installed Dependencies"

msg_info "Installing Docker"
if ! command -v docker &> /dev/null; then
  $STD apt-get install -y ca-certificates gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  $STD apt-get update
  $STD apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
msg_ok "Installed Docker"

msg_info "Setting up Garage directory"
mkdir -p /opt/garage
cd /opt/garage
msg_ok "Created /opt/garage"

msg_info "Fetching Deployment Configurations"
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
msg_ok "Fetched Deployment Configurations"

msg_info "Generating Secrets and .env"
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
msg_ok "Generated Secrets and .env"

msg_info "Creating Garage Service"
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
msg_ok "Created Garage Service"

motd_ssh
customize
cleanup_lxc
