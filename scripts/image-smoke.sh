#!/usr/bin/env bash
# Usage: scripts/image-smoke.sh [db-push[=IMAGE]] [server[=IMAGE]]
# Runs each image in order against throwaway Postgres and Redis. Builds it from this checkout unless IMAGE is given.
set -euo pipefail

prefix=${SMOKE_PREFIX:-image-smoke-$$}
timeout=${SMOKE_TIMEOUT:-10}
network=$prefix-net
postgres=$prefix-postgres
redis=$prefix-redis
database_url=postgres://smoke:smoke@$postgres:5432/smoke
build_log=$(mktemp)

now() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }
elapsed() { perl -e 'printf "%.2f", $ARGV[1] - $ARGV[0]' "$1" "$(now)"; }
before() { perl -e 'exit !($ARGV[1] - $ARGV[0] < $ARGV[2])' "$1" "$(now)" "$2"; }

fail() {
  echo "image smoke: FAIL $1"
  if [ -n "${2:-}" ]; then docker logs --tail 40 "$2" 2>&1 | cut -c1-400; fi
  exit 1
}

cleanup() {
  docker rm -fv "$prefix-db-push" "$prefix-server" "$postgres" "$redis" >/dev/null 2>&1 || true
  docker rmi -f "$prefix-db-push" "$prefix-server" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -f "$build_log"
}

wait_until() {
  local limit=$1 start
  shift
  start=$(now)
  until "$@" >/dev/null 2>&1; do
    before "$start" "$limit" || return 1
    sleep 0.25
  done
}

exited() { [ "$(docker inspect -f '{{.State.Status}}' "$1")" = exited ]; }

answer() {
  local container=$1 path=$2 start=$3 address=$4
  until curl -fsS -m 1 -o /dev/null "http://$address$path" >/dev/null 2>&1; do
    [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] ||
      fail "$container exited with code $(docker inspect -f '{{.State.ExitCode}}' "$container")" "$container"
    before "$start" "$timeout" || fail "$container: $path did not answer within ${timeout}s" "$container"
    sleep 0.25
  done
  before "$start" "$timeout" || fail "$container: $path answered after $(elapsed "$start")s, over ${timeout}s" "$container"
  echo "server: $path answered after $(elapsed "$start")s"
}

dockerfile() {
  case $1 in
    db-push) echo packages/db/Dockerfile ;;
    server) echo apps/server/Dockerfile ;;
    *) return 1 ;;
  esac
}

build() {
  docker build --load -f "$(dockerfile "$1")" -t "$prefix-$1" \
    --build-arg SOURCE_COMMIT=image-smoke \
    --build-arg VITE_SERVER_URL=http://localhost:3000 \
    --build-arg VITE_TURNSTILE_SITE_KEY=ci-public-placeholder . >"$build_log" 2>&1 || {
    tail -n 30 "$build_log"
    fail "$1 image did not build from $(dockerfile "$1")"
  }
}

smoke_db_push() {
  local container=$prefix-db-push start code tables
  start=$(now)
  docker run -d --name "$container" --network "$network" -e DATABASE_URL="$database_url" "$1" >/dev/null
  wait_until 120 exited "$container" || fail "db-push still running after 120s" "$container"
  code=$(docker inspect -f '{{.State.ExitCode}}' "$container")
  [ "$code" = 0 ] || fail "db-push exited with code $code" "$container"
  tables=$(docker exec "$postgres" psql -U smoke -d smoke -tAc \
    "select count(*) from information_schema.tables where table_schema = 'public'")
  [ "$tables" -gt 0 ] || fail "db-push exited 0 but created no tables" "$container"
  echo "db-push: exit 0 after $(elapsed "$start")s, $tables tables"
}

smoke_server() {
  local container=$prefix-server start address
  start=$(now)
  docker run -d --name "$container" --network "$network" -p 127.0.0.1::3000 \
    -e DATABASE_URL="$database_url" -e REDIS_HOST="$redis" -e REDIS_PORT=6379 \
    -e CORS_ORIGIN=http://localhost:3000 -e BETTER_AUTH_URL=http://localhost:3000 \
    -e BETTER_AUTH_SECRET=image-smoke-secret-0123456789abcdef \
    -e TURNSTILE_SECRET_KEY=image-smoke -e RESEND_API_KEY=re_image_smoke \
    -e RESEND_FROM_EMAIL=smoke@example.invalid \
    -e GOOGLE_CLIENT_ID=image-smoke -e GOOGLE_CLIENT_SECRET=image-smoke \
    "$1" >/dev/null
  address=$(docker port "$container" 3000/tcp | head -1) || true
  answer "$container" /health "$start" "$address"
  answer "$container" /api/auth/ok "$start" "$address"
  docker logs "$container" 2>&1 | grep '"environment":"production"' >/dev/null ||
    fail "$container does not log in production mode. Set ENV NODE_ENV=production before bun build --compile." "$container"
}

[ $# -gt 0 ] || set -- db-push server
for target in "$@"; do
  dockerfile "${target%%=*}" >/dev/null || fail "unknown image ${target%%=*}. Use db-push or server."
done

trap cleanup EXIT
cleanup
docker network create "$network" >/dev/null
docker run -d --name "$postgres" --network "$network" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke postgres:18.6 >/dev/null
docker run -d --name "$redis" --network "$network" redis:8.8.0 >/dev/null

for target in "$@"; do
  name=${target%%=*}
  image=${target#*=}
  if [ "$image" = "$target" ]; then
    build "$name"
    image=$prefix-$name
  fi
  wait_until 60 docker exec "$postgres" pg_isready -h 127.0.0.1 -U smoke || fail "Postgres did not start" "$postgres"
  wait_until 60 docker exec "$redis" redis-cli ping || fail "Redis did not start" "$redis"
  "smoke_${name//-/_}" "$image"
done
echo "image smoke ok: $*"
