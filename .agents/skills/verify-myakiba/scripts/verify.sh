#!/usr/bin/env bash
# Usage: verify.sh up | doctor RUN | seed-user RUN [EMAIL] [PASSWORD] [--generated-username] | seed-items RUN | psql RUN SQL | logs RUN | down RUN | list
# Run from a myakiba checkout. up builds that checkout's db-push and server images and runs them against throwaway Postgres, Redis and S3
# on one free 127.0.0.1 port. Every Docker resource carries the label verify-myakiba.run=RUN.
# State and evidence live in ${VERIFY_HOME:-~/.cache/verify-myakiba}/RUN. down keeps evidence/.
set -euo pipefail

repo=$(git rev-parse --show-toplevel 2>/dev/null || true)
home=${VERIFY_HOME:-$HOME/.cache/verify-myakiba}
turnstile_site_key=1x00000000000000000000AA
turnstile_secret_key=1x0000000000000000000000000000000AA

die() {
  echo "verify-myakiba: $*" >&2
  exit 1
}

load() {
  [ -n "${1:-}" ] || die "name a run. verify.sh list shows the live ones."
  run=$1
  dir=$home/$run
  [ -f "$dir/state.env" ] || die "run $run has no state at $dir/state.env. It was never started here or is already down."
  # shellcheck disable=SC1091
  . "$dir/state.env"
}

wait_for() {
  local limit=$1 start=$SECONDS
  shift
  until "$@" >/dev/null 2>&1; do
    [ $((SECONDS - start)) -lt "$limit" ] || return 1
    sleep 0.5
  done
}

build_id() {
  local sha
  sha=$(git -C "$repo" rev-parse --short HEAD)
  if [ -z "$(git -C "$repo" status --porcelain)" ]; then
    echo "$sha"
    return
  fi
  # The hash covers every uncommitted change, so doctor sees an edit made after a build from a dirty checkout.
  echo "$sha-dirty-$({
    cd "$repo"
    git status --porcelain
    git diff --binary HEAD
    git ls-files -z --others --exclude-standard | xargs -0 cat
  } 2>/dev/null | git hash-object --stdin | cut -c1-8)"
}

free_port() {
  bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true)'
}

up() {
  [ -f "$repo/apps/server/Dockerfile" ] || die "run up from inside a myakiba checkout."
  cd "$repo"
  command -v docker >/dev/null || die "docker is not on PATH."
  docker info >/dev/null 2>&1 || die "the Docker daemon is not running."
  run=vm-$(date +%Y%m%d-%H%M%S)-$RANDOM
  dir=$home/$run
  mkdir -p "$dir/evidence"
  port=${VERIFY_PORT:-$(free_port)}
  s3_port=$(free_port)
  build=$(build_id)
  prefix=verify-$run
  url=http://localhost:$port
  [ "$port" = 80 ] && url=http://localhost
  printf '%s=%q\n' run "$run" prefix "$prefix" label "verify-myakiba.run=$run" port "$port" url "$url" \
    s3_url "http://localhost:$s3_port" build "$build" repo "$repo" >"$dir/state.env"
  # shellcheck disable=SC1091
  . "$dir/state.env"
  echo "run $run: building images for build $build (logs in $dir/build-*.log)"
  docker build --load --label "$label" -f packages/db/Dockerfile -t "$prefix-db-push" "$repo" \
    >"$dir/build-db-push.log" 2>&1 || {
    tail -n 30 "$dir/build-db-push.log"
    die "db-push image did not build. Run: verify.sh down $run"
  }
  docker build --load --label "$label" -f apps/server/Dockerfile -t "$prefix-server" \
    --build-arg SOURCE_COMMIT="$build" --build-arg VITE_SERVER_URL="$url" \
    --build-arg VITE_TURNSTILE_SITE_KEY="$turnstile_site_key" "$repo" >"$dir/build-server.log" 2>&1 || {
    tail -n 30 "$dir/build-server.log"
    die "server image did not build. Run: verify.sh down $run"
  }
  docker network create --label "$label" "$prefix-net" >/dev/null
  docker run -d --label "$label" --name "$prefix-postgres" --network "$prefix-net" \
    -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify postgres:18.6 >/dev/null
  docker run -d --label "$label" --name "$prefix-redis" --network "$prefix-net" redis:8.8.0 >/dev/null
  wait_for 60 docker exec "$prefix-postgres" pg_isready -h 127.0.0.1 -U verify || die "Postgres did not start. Run: verify.sh down $run"
  wait_for 60 docker exec "$prefix-redis" redis-cli ping || die "Redis did not start. Run: verify.sh down $run"
  # A local S3 store, so imports can store item pictures. The browser reads them from s3_url.
  docker run -d --label "$label" --name "$prefix-s3" --network "$prefix-net" -p "127.0.0.1:$s3_port:9000" \
    -e MINIO_ROOT_USER=verify -e MINIO_ROOT_PASSWORD=verify-password cgr.dev/chainguard/minio:latest server /data >/dev/null
  wait_for 60 curl -sf "$s3_url/minio/health/live" || die "the S3 store did not start. Run: verify.sh down $run"
  for args in "mb s3/verify-myakiba" "anonymous set download s3/verify-myakiba"; do
    # shellcheck disable=SC2086
    docker run --rm --label "$label" --network "$prefix-net" -e MC_HOST_s3="http://verify:verify-password@$prefix-s3:9000" \
      cgr.dev/chainguard/minio-client:latest $args >/dev/null || die "the S3 bucket was not set up. Run: verify.sh down $run"
  done
  docker run --label "$label" --name "$prefix-db-push" --network "$prefix-net" \
    -e DATABASE_URL="postgres://verify:verify@$prefix-postgres:5432/verify" "$prefix-db-push" >"$dir/db-push.log" 2>&1 || {
    tail -n 30 "$dir/db-push.log"
    die "db-push failed. Run: verify.sh down $run"
  }
  docker run -d --label "$label" --name "$prefix-server" --network "$prefix-net" -p "127.0.0.1:$port:3000" \
    -e DATABASE_URL="postgres://verify:verify@$prefix-postgres:5432/verify" \
    -e REDIS_HOST="$prefix-redis" -e REDIS_PORT=6379 \
    -e CORS_ORIGIN="$url" -e BETTER_AUTH_URL="$url" \
    -e BETTER_AUTH_SECRET="verify-myakiba-$run-0123456789abcdef" \
    -e TURNSTILE_SECRET_KEY="$turnstile_secret_key" \
    -e RESEND_API_KEY=re_verify_myakiba -e RESEND_FROM_EMAIL=verify@example.invalid \
    -e GOOGLE_CLIENT_ID=verify-myakiba -e GOOGLE_CLIENT_SECRET=verify-myakiba \
    -e AWS_BUCKET_REGION=us-east-1 -e AWS_BUCKET_NAME=verify-myakiba \
    -e S3_ENDPOINT_URL="http://$prefix-s3:9000" -e AWS_BUCKET_URL="$s3_url/verify-myakiba" \
    -e AWS_ACCESS_KEY_ID=verify -e AWS_SECRET_ACCESS_KEY=verify-password \
    "$prefix-server" >/dev/null
  wait_for 30 ready || {
    docker logs --tail 40 "$prefix-server" 2>&1 | cut -c1-400
    die "server did not become ready at $url within 30s. Run: verify.sh down $run"
  }
  echo "ready: run=$run url=$url build=$build evidence=$dir/evidence"
}

ready() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/health")" = 200 ] &&
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/auth/ok")" = 200 ] &&
    curl -s -H 'accept: text/html' "$url/login" | grep -q '<div id="app"'
}

doctor() {
  load "$1"
  local bad=0 container state health version owner
  for container in postgres redis server; do
    state=$(docker inspect -f '{{.State.Status}}' "$prefix-$container" 2>/dev/null || echo missing)
    echo "$container: $state"
    [ "$state" = running ] || bad=1
  done
  owner=$(docker port "$prefix-server" 3000/tcp 2>/dev/null | head -1 || true)
  echo "port: $owner (want 127.0.0.1:$port)"
  [ "$owner" = "127.0.0.1:$port" ] || bad=1
  health=$(curl -s -m 3 "$url/health" || echo unreachable)
  echo "health: $health"
  [ "$health" = '{"status":"ok"}' ] || bad=1
  version=$(curl -s -m 3 "$url/api/version" || echo unreachable)
  echo "version: $version (built $build, checkout now $(build_id))"
  [ "$version" = "{\"buildId\":\"$build\"}" ] || bad=1
  [ "$build" = "$(build_id)" ] || echo "warning: the checkout changed since this run was built. Run verify.sh up again to test the change."
  echo "url: $url"
  echo "evidence: $dir/evidence"
  [ "$bad" = 0 ] || die "run $run is not fit to drive."
  echo "doctor ok"
}

seed_user() {
  load "$1"
  local email=${2:-verify@example.com} password=${3:-verify-password-1} generated=${4:-} body code username
  # The sign-up form sends a username. A Google sign-up sends none, and the server generates one.
  username=$(printf %s "${email%%@*}" | tr -cd 'A-Za-z0-9_.')
  [ -n "$generated" ] && username=""
  body=$(curl -s -w '\n%{http_code}' "$url/api/auth/sign-up/email" -H 'content-type: application/json' \
    -H "origin: $url" -H 'x-captcha-response: XXXX.DUMMY.TOKEN.XXXX' \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"name\":\"Verify User\"${username:+,\"username\":\"$username\"}}")
  code=${body##*$'\n'}
  if [ "$code" != 200 ]; then
    # Better Auth checks the username before it hides an existing email, so a repeat seed of
    # the same email answers that the username is taken.
    case $body in
      *USERNAME_IS_ALREADY_TAKEN*) [ -n "$(psql_run "select id from \"user\" where email = '$email'")" ] ||
        die "sign-up for $email answered $code: ${body%$'\n'*}" ;;
      *) die "sign-up for $email answered $code: ${body%$'\n'*}" ;;
    esac
  fi
  username=$(psql_run "update \"user\" set email_verified = true where email = '$email' returning username")
  [ -n "$username" ] || die "no user row for $email after sign-up"
  echo "user: $email / $password, username $username (email verified)"
}

seed_items() {
  load "$1"
  local email=${2:-verify@example.com}
  [ -n "$(psql_run "select id from \"user\" where email = '$email'")" ] || die "no user $email; run seed-user first"
  psql_run "
    insert into item (id, owner_id, external_id, source, title, category, scale)
      select v.id, u.id, v.external_id, 'mfc', v.title, v.category, v.scale
      from (values
        ('verifyitem1', 900001, 'Verify Figure Alpha', 'Prepainted', '1/7'),
        ('verifyitem2', 900002, 'Verify Figure Beta', 'Prepainted', '1/4'),
        ('verifyitem3', 900003, 'Verify Plush Gamma', 'Plushes', 'n/a')
      ) as v(id, external_id, title, category, scale)
      cross join (select id from \"user\" where email = '$email') u
    on conflict do nothing;
    insert into item_release (item_id, date, type, price, price_currency)
      select id, current_date + 20, 'Standard', 2500000, 'JPY' from item
      where id like 'verifyitem_' and not exists (select 1 from item_release r where r.item_id = item.id);"
  [ "$(psql_run "select count(*) from item i join \"user\" u on u.id = i.owner_id where i.id like 'verifyitem_' and u.email = '$email'")" = 3 ] ||
    die "the seeded items belong to another account in this run. seed-items serves one account per run."
  psql_run "select external_id || '  ' || title from item where id like 'verifyitem_' order by external_id"
}

psql_run() { docker exec "$prefix-postgres" psql -U verify -d verify -qtAc "$1"; }

down() {
  load "$1"
  local id
  for id in $(docker ps -aq --filter "label=$label"); do docker rm -fv "$id" >/dev/null; done
  for id in $(docker network ls -q --filter "label=$label"); do docker network rm "$id" >/dev/null; done
  docker rmi "$prefix-server" "$prefix-db-push" >/dev/null 2>&1 || true
  rm -f "$dir/state.env" "$dir"/build-*.log "$dir/db-push.log"
  echo "down: $run. Evidence kept at $dir/evidence"
}

case ${1:-} in
  up) up ;;
  doctor) doctor "${2:-}" ;;
  seed-user)
    generated=""
    args=()
    for arg in "${@:2}"; do
      if [ "$arg" = --generated-username ]; then generated=1; else args+=("$arg"); fi
    done
    seed_user "${args[0]:-}" "${args[1]:-}" "${args[2]:-}" "$generated"
    ;;
  seed-items) seed_items "${2:-}" "${3:-}" ;;
  psql)
    load "${2:-}"
    psql_run "${3:?pass the SQL to run}"
    ;;
  logs)
    load "${2:-}"
    docker logs "$prefix-server" 2>&1
    ;;
  down) down "${2:-}" ;;
  list)
    for state in "$home"/*/state.env; do
      if [ -f "$state" ]; then (. "$state" && echo "$run $url $build"); fi
    done
    ;;
  *) die "usage: verify.sh up | doctor RUN | seed-user RUN [EMAIL] [PASSWORD] [--generated-username] | seed-items RUN | psql RUN SQL | logs RUN | down RUN | list" ;;
esac
