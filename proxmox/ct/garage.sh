#!/usr/bin/env bash
# The community-scripts engine lives in community-scripts/core. The ct/ and install/
# scripts are resolved against COMMUNITY_SCRIPTS_URL, so point that at this repository's
# proxmox/ directory: install/garage-install.sh is then fetched from here, not upstream.
export COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://raw.githubusercontent.com/eigger/garage/master/proxmox}"
COMMUNITY_SCRIPTS_CORE_URL="${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}"
export COMMUNITY_SCRIPTS_CORE_URL

# `source <(curl ...)` would ignore a failed download and keep going with every function
# undefined, so fetch first and stop on failure.
if ! _garage_build_func="$(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL}/core/build.func")" || [[ -z "$_garage_build_func" ]]; then
  echo "garage: could not download the community-scripts engine from ${COMMUNITY_SCRIPTS_CORE_URL}/core/build.func" >&2
  exit 1
fi
# Source through a pipe like upstream does: the engine treats a regular-file BASH_SOURCE as a
# local checkout.
# shellcheck source=/dev/null
source <(printf '%s\n' "$_garage_build_func")
unset _garage_build_func

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/garage

APP="Garage"
var_tags="${var_tags:-car;vehicle;garage}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-16}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-no}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/garage ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi
  
  msg_info "Updating ${APP} Container Images"
  cd /opt/garage
  # 배포 파일을 저장소 최신본으로 되돌린 뒤 이미지를 갱신한다 — 설치 시점 compose에
  # 결함이 있으면 이미지만 올려서는 복구되지 않는다.
  GARAGE_RAW_BASE="${GARAGE_RAW_BASE:-https://raw.githubusercontent.com/eigger/garage/master}"
  curl -fsSL "${GARAGE_RAW_BASE}/Caddyfile" -o /opt/garage/Caddyfile
  curl -fsSL "${GARAGE_RAW_BASE}/docker-compose.prod.yml" -o /opt/garage/docker-compose.prod.yml
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d --remove-orphans
  # 업데이트 성공 시 새 이미지로 태그가 넘어가면서 예전 이미지가 <none>(dangling)으로 남는데,
  # Docker가 이를 자동으로 지우지 않아 릴리스가 반복될수록 디스크가 계속 쌓인다.
  docker image prune -f
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:80${CL}"
