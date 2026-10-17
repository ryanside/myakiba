#!/usr/bin/env bash
# Usage: scripts/image-smoke.sh [db-push[=IMAGE]] [server[=IMAGE]]
# Runs each image in order against throwaway Postgres and Redis. Builds it from this checkout unless IMAGE is given.
# Env: SMOKE_PREFIX, SMOKE_TIMEOUT, SMOKE_REQUIRED_CLIENT_VARS (names, skips the checker), SMOKE_SERVER_ENV (extra K=V for the server).
set -euo pipefail
cd "$(dirname "$0")/.."

prefix=${SMOKE_PREFIX:-image-smoke-$$}
label=image-smoke.run=$prefix-$$-$RANDOM
timeout=${SMOKE_TIMEOUT:-10}
read -ra server_env <<<"${SMOKE_SERVER_ENV:-}"
network=$prefix-net
postgres=$prefix-postgres
redis=$prefix-redis
database_url=postgres://smoke:smoke@$postgres:5432/smoke
vite_args=(VITE_SERVER_URL=http://vite-server-url.image-smoke.invalid VITE_TURNSTILE_SITE_KEY=vite-turnstile-site-key-image-smoke)

now() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }
elapsed() { perl -e 'printf "%.2f", $ARGV[1] - $ARGV[0]' "$1" "$(now)"; }
before() { perl -e 'exit !($ARGV[1] - $ARGV[0] < $ARGV[2])' "$1" "$(now)" "$2"; }

fail() {
  echo "image smoke: FAIL $1"
  if [ -n "${2:-}" ]; then docker logs --tail 40 "$2" 2>&1 | cut -c1-400; fi
  exit 1
}

cleanup() {
  for id in $(docker ps -aq --filter "label=$label"); do docker rm -fv "$id" >/dev/null 2>&1 || true; done
  for id in $(docker images -q --filter "label=$label"); do docker rmi -f "$id" >/dev/null 2>&1 || true; done
  for id in $(docker network ls -q --filter "label=$label"); do docker network rm "$id" >/dev/null 2>&1 || true; done
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

crashed() {
  docker logs "$1" 2>&1 | grep 'Invalid environment variables' >/dev/null &&
    fail "$1 rejected its environment: a variable below is missing or invalid. If it is new, also set it in docker-compose.production.yml and on the production host before you deploy. Then add or fix its placeholder in smoke_server in scripts/image-smoke.sh." "$1"
  fail "$1 exited with code $(docker inspect -f '{{.State.ExitCode}}' "$1")" "$1"
}

answer() {
  local container=$1 path=$2 start=$3 address=$4
  until curl -fsS -m 1 -o /dev/null "http://$address$path" >/dev/null 2>&1; do
    [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || crashed "$container"
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
  docker build --load --label "$label" -f "$(dockerfile "$1")" -t "$prefix-$1" --build-arg SOURCE_COMMIT=image-smoke \
    "${vite_args[@]/#/--build-arg=}" . >"$work/build.log" 2>&1 || {
    tail -n 30 "$work/build.log"
    fail "$1 image did not build from $(dockerfile "$1")"
  }
}

smoke_db_push() {
  local container=$prefix-db-push start code tables
  start=$(now)
  docker run -d --label "$label" --name "$container" --network "$network" -e DATABASE_URL="$database_url" "$1" >/dev/null
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
  docker run -d --label "$label" --name "$container" --network "$network" -p 127.0.0.1::3000 \
    -e DATABASE_URL="$database_url" -e REDIS_HOST="$redis" -e REDIS_PORT=6379 \
    -e CORS_ORIGIN=http://localhost:3000 -e BETTER_AUTH_URL=http://localhost:3000 \
    -e BETTER_AUTH_SECRET=image-smoke-secret-0123456789abcdef \
    -e TURNSTILE_SECRET_KEY=image-smoke -e RESEND_API_KEY=re_image_smoke \
    -e RESEND_FROM_EMAIL=smoke@example.invalid \
    -e GOOGLE_CLIENT_ID=image-smoke -e GOOGLE_CLIENT_SECRET=image-smoke \
    ${server_env[@]+"${server_env[@]/#/--env=}"} "$1" >/dev/null
  echo "server: docker run returned after $(elapsed "$start")s"
  start=$(now)
  address=$(docker port "$container" 3000/tcp | head -1) || true
  answer "$container" /health "$start" "$address"
  answer "$container" /api/auth/ok "$start" "$address"
  docker logs "$container" 2>&1 | grep '"environment":"production"' >/dev/null ||
    fail "$container does not log in production mode. Set ENV NODE_ENV=production before bun build --compile." "$container"
  docker cp "$container:/app/dist" "$work/dist" >/dev/null || fail "$container has no web bundle at /app/dist"
  for name in $required; do
    value=$(printf '%s\n' "${vite_args[@]}" | sed -n "s/^$name=//p")
    [ -n "$value" ] ||
      fail "$name is required in packages/env but has no placeholder. Add $name=<placeholder> to vite_args in scripts/image-smoke.sh and to the server build_args in .github/workflows/ci.yml."
    grep -rqF "$value" "$work/dist" ||
      fail "the web bundle in $1 lacks $name=$value. Vite inlines VITE_* at the web build, so pass it as a build arg to the stage that runs that build. A prebuilt image must use the placeholder from vite_args in scripts/image-smoke.sh, as .github/workflows/ci.yml does."
  done
  [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || crashed "$container"
  echo "server: web bundle has" $required
}

[ $# -gt 0 ] || set -- db-push server
for target in "$@"; do
  dockerfile "${target%%=*}" >/dev/null || fail "unknown image ${target%%=*}. Use db-push or server."
done
case $prefix in
  myakiba*) fail "SMOKE_PREFIX=$prefix would name smoke resources like the operator's myakiba-* containers. Choose another prefix." ;;
esac
[ -z "$(docker ps -aq --filter "name=^$prefix-")$(docker network ls -q --filter "name=^$prefix-")$(docker images -q --filter "reference=$prefix-*")" ] ||
  fail "containers, networks or images named $prefix-* already exist, and this run did not create them. Set SMOKE_PREFIX to a name no other run uses."
required=${SMOKE_REQUIRED_CLIENT_VARS:-}
if [[ " $* " == *" server"* && -z "$required" ]]; then
  command -v bun >/dev/null || fail "the server smoke needs bun on PATH to read the required VITE_* names."
  required=$(bun scripts/check-deploy-config.ts --required-client-vars) ||
    fail "found no required VITE_* variable. Run bun scripts/check-deploy-config.ts for the reason."
fi

work=$(mktemp -d)
trap 'cleanup; rm -rf "$work"' EXIT
docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$postgres" --network "$network" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke postgres:18.6 >/dev/null
docker run -d --label "$label" --name "$redis" --network "$network" redis:8.8.0 >/dev/null

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
