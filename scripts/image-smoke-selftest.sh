#!/usr/bin/env bash
# Usage: bash scripts/image-smoke-selftest.sh [CASE...]
# Runs scripts/image-smoke.sh against tiny fixture images and checks that each check fails for its own reason.
set -uo pipefail
cd "$(dirname "$0")/.."

fixtures=scripts/image-smoke-selftest
names="VITE_SERVER_URL VITE_TURNSTILE_SITE_KEY"
eval "$(grep '^vite_args=' scripts/image-smoke.sh)"
run=${SELFTEST_PREFIX:-lane-g6-selftest-$$}
label=image-smoke-selftest.run=$run-$RANDOM
only=" $* "
failures=0
built=no

fail() {
  echo "image smoke self-test: FAIL $1"
  exit 1
}

case $run in
  lane-g6-selftest-*) ;;
  *) fail "SELFTEST_PREFIX=$run must start with lane-g6-selftest-." ;;
esac
[ -z "$(docker images -q --filter "reference=$run-*")" ] ||
  fail "images named $run-* already exist, and this run did not build them. Set SELFTEST_PREFIX to a name no other run uses."
trap 'for id in $(docker images -q --filter "label=$label"); do docker rmi -f "$id" >/dev/null 2>&1; done' EXIT

build_images() {
  [ "$built" = no ] || return 0
  built=yes
  docker build -q --load --label "$label" -t "$run-server" "${vite_args[@]/#/--build-arg=}" \
    -f $fixtures/server.Dockerfile $fixtures >/dev/null || fail "the server fixture did not build"
  for mode in ok no-tables exit-3; do
    docker build -q --load --label "$label" -t "$run-db-push-$mode" --build-arg MODE=$mode \
      -f $fixtures/db-push.Dockerfile $fixtures >/dev/null || fail "the db-push $mode fixture did not build"
  done
}

selected() { [ "$only" = "  " ] || [[ $only == *" $1 "* ]]; }

report() {
  local name=$1 ok=$2 code=$3 out=$4
  [ "$ok" = 0 ] || failures=$((failures + 1))
  printf '%s %-20s exit %s  %s\n' "$([ "$ok" = 0 ] && echo PASS || echo FAIL)" "$name" "$code" \
    "$(grep -m1 'image smoke' <<<"$out" | cut -c1-160)"
}

# expect NAME EXIT PATTERN [VAR=VALUE...] -- SMOKE_ARGS...   (EXIT is 0, nonzero, or a code)
expect() {
  local name=$1 want=$2 pattern=$3 env=() out code ok=1
  shift 3
  selected "$name" || return 0
  build_images
  while [ "$1" != -- ]; do env+=("$1"); shift; done
  shift
  out=$(env SMOKE_REQUIRED_CLIENT_VARS="$names" SMOKE_TIMEOUT=6 ${env[@]+"${env[@]}"} bash scripts/image-smoke.sh "$@" 2>&1)
  code=$?
  case $want in
    0) [ "$code" = 0 ] && ok=0 ;;
    nonzero) [ "$code" != 0 ] && ok=0 ;;
    *) [ "$code" = "$want" ] && ok=0 ;;
  esac
  [ "$ok" = 0 ] && grep -qF "$pattern" <<<"$out" || ok=1
  report "$name" "$ok" "$code" "$out"
}

# expect_answer NAME PATTERN TIMEOUT STARTED_SECONDS_AGO CURL_SECONDS
# Runs the smoke's answer() against a curl that succeeds after CURL_SECONDS, with no Docker.
expect_answer() {
  local name=$1 pattern=$2 fakes out code ok=1
  selected "$name" || return 0
  fakes=$(mktemp -d)
  printf '#!/bin/sh\nsleep %s\necho\necho 200\n' "$5" >"$fakes/curl"
  printf '#!/bin/sh\necho true\n' >"$fakes/docker"
  chmod +x "$fakes/curl" "$fakes/docker"
  out=$(
    PATH=$fakes:$PATH
    source scripts/image-smoke.sh
    timeout=$3
    answer fixture /health "$(perl -MTime::HiRes=time -e 'printf "%.2f", time - $ARGV[0]' "$4")" 127.0.0.1:9 2>&1
  )
  code=$?
  rm -rf "$fakes"
  [ "$code" != 0 ] && grep -qF "$pattern" <<<"$out" && ok=0
  report "$name" "$ok" "$code" "$out"
}

# expect_refusal NAME: a run whose prefix names an existing image refuses and leaves that image alone.
expect_refusal() {
  local name=$1 foreign=$run-foreign out code ok=1
  selected "$name" || return 0
  docker tag busybox:1.36-musl "$foreign-server" || fail "could not tag busybox:1.36-musl as $foreign-server"
  out=$(SELFTEST_PREFIX=$foreign bash scripts/image-smoke-selftest.sh passes 2>&1)
  code=$?
  [ "$code" != 0 ] && grep -qF "images named $foreign-* already exist" <<<"$out" &&
    [ "$(docker image inspect -f '{{.Id}}' "$foreign-server" 2>/dev/null)" = "$(docker image inspect -f '{{.Id}}' busybox:1.36-musl)" ] && ok=0
  docker rmi "$foreign-server" >/dev/null 2>&1
  report "$name" "$ok" "$code" "$out"
}

expect passes 0 'image smoke ok' SMOKE_SERVER_ENV=SELFTEST_MODE=ok SMOKE_TIMEOUT=10 -- db-push="$run-db-push-ok" server="$run-server"
expect no-auth-ok nonzero '/api/auth/ok did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=no-auth -- server="$run-server"
expect no-health nonzero '/health did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=no-health -- server="$run-server"
expect late nonzero '/health did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=late -- server="$run-server"
expect exits-after nonzero 'exited with code 23' SMOKE_SERVER_ENV=SELFTEST_MODE=exit-after SMOKE_TIMEOUT=10 -- server="$run-server"
expect bad-env nonzero 'rejected its environment' SMOKE_SERVER_ENV=SELFTEST_MODE=bad-env SMOKE_TIMEOUT=10 -- server="$run-server"
expect no-placeholder nonzero 'VITE_SELFTEST_NEW is required in packages/env but has no placeholder' "SMOKE_REQUIRED_CLIENT_VARS=$names VITE_SELFTEST_NEW" SMOKE_SERVER_ENV=SELFTEST_MODE=ok SMOKE_TIMEOUT=10 -- server="$run-server"
expect redis-unavailable 0 'image smoke ok' SMOKE_SERVER_ENV=SELFTEST_MODE=redis-unavailable -- --redis unreachable server="$run-server"
expect redis-ignored nonzero 'Expected 503 with body {"status":"redis unavailable"}, last answer: 200 ok' SMOKE_SERVER_ENV=SELFTEST_MODE=ok -- --redis unreachable server="$run-server"
expect redis-200 nonzero 'last answer: 200 {"status":"redis unavailable"}' SMOKE_SERVER_ENV=SELFTEST_MODE=redis-unavailable-200 -- --redis unreachable server="$run-server"
expect nested-redis-text nonzero 'last answer: 503 {"status":"postgres unavailable","debug":{"status":"redis unavailable"}}' SMOKE_SERVER_ENV=SELFTEST_MODE=nested-redis-text -- --redis unreachable server="$run-server"
expect wrong-dependency nonzero 'last answer: 503 {"status":"postgres unavailable"}' SMOKE_SERVER_ENV=SELFTEST_MODE=postgres-unavailable -- --redis unreachable server="$run-server"
expect bad-redis-mode nonzero 'the --redis option takes one value, unreachable.' -- --redis down server="$run-server"
expect no-tables nonzero 'db-push exited 0 but created no tables' -- db-push="$run-db-push-no-tables"
expect db-push-exit-3 nonzero 'db-push exited with code 3' -- db-push="$run-db-push-exit-3"
expect missing-image 125 'Unable to find image' -- server=lane-g6-selftest-missing:none
expect_answer expired-start '/health did not answer within 10s' 10 11 0
expect_answer answer-after-deadline '/health answered after' 0.3 0 0.6
expect_refusal foreign-images

echo "image smoke self-test: $failures failed"
[ "$failures" = 0 ]
