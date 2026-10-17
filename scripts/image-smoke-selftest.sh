#!/usr/bin/env bash
# Usage: bash scripts/image-smoke-selftest.sh [CASE...]
# Runs scripts/image-smoke.sh against tiny fixture images and checks that each check fails for its own reason.
set -uo pipefail
cd "$(dirname "$0")/.."

fixtures=scripts/image-smoke-selftest
names="VITE_SERVER_URL VITE_TURNSTILE_SITE_KEY"
eval "$(grep '^vite_args=' scripts/image-smoke.sh)"
images=(lane-g6-selftest-server lane-g6-selftest-db-push-ok lane-g6-selftest-db-push-no-tables lane-g6-selftest-db-push-exit-3)
only=" $* "
failures=0
trap 'docker rmi -f "${images[@]}" >/dev/null 2>&1' EXIT

docker build -q --load -t lane-g6-selftest-server "${vite_args[@]/#/--build-arg=}" -f $fixtures/server.Dockerfile $fixtures >/dev/null || exit 1
for mode in ok no-tables exit-3; do
  docker build -q --load -t lane-g6-selftest-db-push-$mode --build-arg MODE=$mode -f $fixtures/db-push.Dockerfile $fixtures >/dev/null || exit 1
done

# expect NAME EXIT PATTERN [VAR=VALUE...] -- SMOKE_ARGS...   (EXIT is 0, nonzero, or a code)
expect() {
  local name=$1 want=$2 pattern=$3 env=() out code ok=1
  shift 3
  [ "$only" = "  " ] || [[ $only == *" $name "* ]] || return 0
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
  [ "$ok" = 0 ] || failures=$((failures + 1))
  printf '%s %-20s exit %s  %s\n' "$([ "$ok" = 0 ] && echo PASS || echo FAIL)" "$name" "$code" "$(grep -m1 'image smoke' <<<"$out" | cut -c1-160)"
}

expect passes 0 'image smoke ok' SMOKE_SERVER_ENV=SELFTEST_MODE=ok SMOKE_TIMEOUT=10 -- db-push=lane-g6-selftest-db-push-ok server=lane-g6-selftest-server
expect no-auth-ok nonzero '/api/auth/ok did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=no-auth -- server=lane-g6-selftest-server
expect no-health nonzero '/health did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=no-health -- server=lane-g6-selftest-server
expect late nonzero '/health did not answer within 6s' SMOKE_SERVER_ENV=SELFTEST_MODE=late -- server=lane-g6-selftest-server
expect exits-after nonzero 'exited with code 23' SMOKE_SERVER_ENV=SELFTEST_MODE=exit-after SMOKE_TIMEOUT=10 -- server=lane-g6-selftest-server
expect bad-env nonzero 'rejected its environment' SMOKE_SERVER_ENV=SELFTEST_MODE=bad-env SMOKE_TIMEOUT=10 -- server=lane-g6-selftest-server
expect no-placeholder nonzero 'VITE_SELFTEST_NEW is required in packages/env but has no placeholder' "SMOKE_REQUIRED_CLIENT_VARS=$names VITE_SELFTEST_NEW" SMOKE_SERVER_ENV=SELFTEST_MODE=ok SMOKE_TIMEOUT=10 -- server=lane-g6-selftest-server
expect no-tables nonzero 'db-push exited 0 but created no tables' -- db-push=lane-g6-selftest-db-push-no-tables
expect db-push-exit-3 nonzero 'db-push exited with code 3' -- db-push=lane-g6-selftest-db-push-exit-3
expect missing-image 125 'Unable to find image' -- server=lane-g6-selftest-missing:none

echo "image smoke self-test: $failures failed"
[ "$failures" = 0 ]
