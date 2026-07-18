#!/usr/bin/env bash
# 컨테이너 안 /usr/bin/update가 매번 이 파일을 새로 받아서 실행한다 — 설치 시점에
# /usr/bin/update에 로직을 그대로 박아두면, 이후 이 스크립트가 개선돼도(예: dangling
# 이미지 정리 추가) 이미 설치된 컨테이너는 그 개선을 영영 못 받는 문제가 있었다.
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
