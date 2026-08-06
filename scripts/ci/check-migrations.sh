#!/usr/bin/env bash
#
# 설치와 업데이트가 깨지지 않는지 자동으로 검증한다.
#
#   1) 신규 설치  — 빈 DB에 전체 마이그레이션을 적용하고, 그 결과가 schema.prisma와
#                   정확히 일치하는지 확인한다(드리프트 검출).
#   2) 업그레이드 — 직전 릴리스 태그의 마이그레이션만 적용한 DB에 기존 운영 데이터를
#                   흉내낸 행을 넣고, 이번 변경의 마이그레이션을 그 위에 적용한다.
#
# 2번이 핵심이다. 마이그레이션은 빈 DB에서는 잘 돌지만 기존 데이터가 있으면 제약 위반
# 으로 실패할 수 있고, 그러면 프로덕션 compose가 `migrate deploy && node ...`로 기동하는
# 구조라 API 컨테이너가 아예 뜨지 않는다.
#
# 로컬 실행 예:
#   DATABASE_URL_BASE=postgresql://garage:pass@localhost:5432 scripts/ci/check-migrations.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
MIGRATIONS_DIR="$API_DIR/prisma/migrations"
FIXTURE="$REPO_ROOT/scripts/ci/legacy-fixture.sql"

if [[ -z "${DATABASE_URL_BASE:-}" ]]; then
  echo "DATABASE_URL_BASE가 필요합니다 (예: postgresql://user:pass@localhost:5432)" >&2
  exit 1
fi

FRESH_DB="${FRESH_DB:-garage_ci_fresh}"
UPGRADE_DB="${UPGRADE_DB:-garage_ci_upgrade}"
ADMIN_URL="$DATABASE_URL_BASE/postgres"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

# CI(ubuntu-latest)에는 psql이 깔려 있다. 로컬에서는 보통 컨테이너 안에만 있으므로
# PG_CONTAINER를 주면 docker exec으로 우회한다.
if command -v psql >/dev/null 2>&1; then
  psql_run() { psql "$@"; }
elif [[ -n "${PG_CONTAINER:-}" ]]; then
  psql_run() { docker exec -i "$PG_CONTAINER" psql "$@"; }
else
  echo "psql을 찾을 수 없습니다. 설치하거나 PG_CONTAINER=<컨테이너 이름>을 지정하세요." >&2
  exit 1
fi

recreate_db() {
  psql_run "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $1;"
  psql_run "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $1;"
}

deploy_to() {
  (cd "$API_DIR" && DATABASE_URL="$1" npx prisma migrate deploy \
    --schema prisma/schema.prisma --config prisma.config.ts)
}

# 마이그레이션 디렉터리를 임시로 과거 버전으로 바꿔치기하므로, 어떤 경로로 끝나든
# 반드시 원래 상태로 되돌린다(로컬에서 커밋되지 않은 마이그레이션을 날리지 않기 위해).
BACKUP_DIR="$(mktemp -d)"
cp -R "$MIGRATIONS_DIR" "$BACKUP_DIR/migrations"
restore_migrations() {
  rm -rf "$MIGRATIONS_DIR"
  cp -R "$BACKUP_DIR/migrations" "$MIGRATIONS_DIR"
  rm -rf "$BACKUP_DIR"
}
trap restore_migrations EXIT

# ---------------------------------------------------------------- 1) 신규 설치
step "신규 설치: 빈 DB에 전체 마이그레이션 적용"
recreate_db "$FRESH_DB"
deploy_to "$DATABASE_URL_BASE/$FRESH_DB" || fail "빈 DB에 마이그레이션을 적용하지 못했습니다."

step "스키마 드리프트 검사: 마이그레이션 결과 == schema.prisma"
# schema.prisma는 고쳤는데 마이그레이션을 만들지 않은 경우를 잡는다. 이 상태로 배포하면
# 신규 설치는 컬럼이 없는 DB로 기동되어 런타임에 터진다(과거에 실제로 있었던 사고다).
DRIFT_LOG="$(mktemp)"
# --from-config-datasource = 방금 마이그레이션을 적용한 실제 DB, --to-schema = schema.prisma의 모델.
# 둘이 다르면 --exit-code가 2로 끝난다.
if ! (cd "$API_DIR" && DATABASE_URL="$DATABASE_URL_BASE/$FRESH_DB" npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --config prisma.config.ts \
  --exit-code) >"$DRIFT_LOG" 2>&1; then
  cat "$DRIFT_LOG"
  fail "schema.prisma와 마이그레이션 결과가 다릅니다. 'prisma migrate dev'로 마이그레이션을 생성하세요."
fi
echo "드리프트 없음."

# ---------------------------------------------------------------- 2) 업그레이드
BASE_TAG="$(git -C "$REPO_ROOT" tag --list 'v*' --sort=-v:refname | head -1 || true)"
if [[ -z "$BASE_TAG" ]]; then
  echo "릴리스 태그가 없어 업그레이드 검증을 건너뜁니다." >&2
  exit 0
fi

step "업그레이드: $BASE_TAG 상태의 DB에 이번 변경을 적용"
recreate_db "$UPGRADE_DB"

rm -rf "$MIGRATIONS_DIR"
git -C "$REPO_ROOT" archive "$BASE_TAG" apps/api/prisma/migrations \
  | tar -x -C "$REPO_ROOT" || fail "$BASE_TAG 의 마이그레이션을 가져오지 못했습니다."

deploy_to "$DATABASE_URL_BASE/$UPGRADE_DB" || fail "$BASE_TAG 마이그레이션 적용에 실패했습니다."
echo "$BASE_TAG 상태 재현 완료."

step "기존 운영 데이터를 흉내낸 행 삽입"
psql_run "$DATABASE_URL_BASE/$UPGRADE_DB" -v ON_ERROR_STOP=1 -q < "$FIXTURE" \
  || fail "픽스처를 넣지 못했습니다. $BASE_TAG 스키마에 맞게 scripts/ci/legacy-fixture.sql을 갱신하세요."

restore_migrations
trap - EXIT
rm -rf "$BACKUP_DIR" 2>/dev/null || true

step "이번 변경의 마이그레이션 적용"
deploy_to "$DATABASE_URL_BASE/$UPGRADE_DB" \
  || fail "기존 데이터가 있는 DB에서 마이그레이션이 실패했습니다 — 이 상태로 배포하면 API 컨테이너가 기동되지 않습니다."

step "업그레이드 후 데이터 확인"
# 마이그레이션이 기존 행을 지워버리지 않았는지(그리고 정규화 같은 변환이 실제로
# 적용됐는지) 최소한으로 확인한다.
SURVIVORS="$(psql_run "$DATABASE_URL_BASE/$UPGRADE_DB" -t -A -c \
  "SELECT count(*) FROM \"User\" WHERE id IN ('fixture-admin','fixture-member');")"
[[ "$SURVIVORS" == "2" ]] || fail "업그레이드 후 기존 사용자 행이 사라졌습니다 (남은 수: $SURVIVORS)."

LOGS="$(psql_run "$DATABASE_URL_BASE/$UPGRADE_DB" -t -A -c \
  "SELECT count(*) FROM \"FuelLog\" WHERE id = 'fixture-fuel-log';")"
[[ "$LOGS" == "1" ]] || fail "업그레이드 후 기존 주유 기록이 사라졌습니다."

echo
echo "신규 설치 · 업그레이드 모두 정상."
