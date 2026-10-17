#!/usr/bin/env bash
# Usage: bash scripts/replay-ci.sh [--self-test]
# Copies this checkout's deploy-config checker and image smoke into past trees and runs them.
# A cleared row passes only when the fixed tree exits 0. A row that names a later bug (an ERE) reports
# STILL when every failure in the fixed tree is that bug. --self-test checks that classification only.
set -uo pipefail

only_later() {
  if grep -q '^ERROR ' "$2"; then
    LATER=$1 awk '/^ERROR / && $0 !~ ENVIRON["LATER"] { other = 1 } END { exit other }' "$2"
  else
    grep -qE "$1" "$2"
  fi
}

classify() {
  local expect=$1 code=$2 pattern=$3 later=$4 log=$5
  case $expect in
    caught) if [ "$code" != 0 ] && grep -qF "$pattern" "$log"; then echo PASS; else echo FAIL; fi ;;
    passes) if [ "$code" = 0 ]; then echo PASS; else echo FAIL; fi ;;
    cleared)
      if grep -qF "$pattern" "$log"; then
        echo FAIL
      elif [ "$code" = 0 ]; then
        echo PASS
      elif [ -n "$later" ] && only_later "$later" "$log"; then
        echo STILL
      else
        echo FAIL
      fi
      ;;
  esac
}

if [ "${1:-}" = --self-test ]; then
  sample=$(mktemp)
  bad=0
  expect_status() {
    local want=$1 name=$2 got
    shift 2
    printf '%b' "$1" >"$sample"
    got=$(classify "$2" "$3" "$4" "$5" "$sample")
    [ "$got" = "$want" ] || bad=$((bad + 1))
    printf '%s %-24s %s (want %s)\n' "$([ "$got" = "$want" ] && echo ok || echo BAD)" "$name" "$got" "$want"
  }
  later='VITE_(SERVER_URL|TURNSTILE_SITE_KEY)'
  expect_status PASS caught 'ERROR a: missing SOURCE_COMMIT\n' caught 1 'missing SOURCE_COMMIT' ''
  expect_status FAIL caught-exit-0 'ERROR a: missing SOURCE_COMMIT\n' caught 0 'missing SOURCE_COMMIT' ''
  expect_status PASS cleared-clean 'deploy config ok\n' cleared 0 'missing SOURCE_COMMIT' "$later"
  expect_status STILL still-only-later 'ERROR a: VITE_SERVER_URL is required\nERROR b: missing VITE_TURNSTILE_SITE_KEY\n' cleared 1 'missing SOURCE_COMMIT' "$later"
  expect_status FAIL still-mixed 'ERROR a: VITE_SERVER_URL is required\nERROR b: missing AUDIT_UNRELATED_MISSING\n' cleared 1 'missing SOURCE_COMMIT' "$later"
  large="ERROR a: missing AUDIT_UNRELATED_MISSING\\n$(printf 'ERROR b: VITE_SERVER_URL is required in packages/env/src/web.ts %s\\n' $(seq 3000))"
  expect_status FAIL still-mixed-large "$large" cleared 1 'missing SOURCE_COMMIT' "$later"
  expect_status FAIL cleared-unrelated 'ERROR a: missing AUDIT_UNRELATED_MISSING\n' cleared 1 'missing SOURCE_COMMIT' "$later"
  expect_status FAIL cleared-old-bug 'ERROR a: missing SOURCE_COMMIT\n' cleared 1 'missing SOURCE_COMMIT' "$later"
  expect_status STILL smoke-still "image smoke: FAIL db-push exited with code 1\nCannot find package 'dotenv'\n" cleared 1 'lockfile is frozen' "Cannot find package 'dotenv'"
  expect_status FAIL smoke-unrelated 'image smoke: FAIL db-push exited with code 1\nsomething else\n' cleared 1 'lockfile is frozen' "Cannot find package 'dotenv'"
  rm -f "$sample"
  echo "replay self-test: $bad bad"
  [ "$bad" = 0 ]
  exit
fi

root=$(git rev-parse --show-toplevel)
trees=$(mktemp -d)
logs=$(mktemp -d "${TMPDIR:-/tmp}/replay-ci.XXXXXX")
failures=0
still=0
trap 'rm -rf "$trees"' EXIT

check() { bun scripts/check-deploy-config.ts; }
smoke() { bash scripts/image-smoke.sh "$@"; }
smoke_with_early_access() { SMOKE_SERVER_ENV=EARLY_ACCESS_PASSWORD=image-smoke smoke "$@"; }

replay() {
  local expect=$1 rev=$2 pattern=$3 later='' tree log code status
  shift 3
  if [ "$expect" = cleared ] && [ "$1" = --still ]; then
    later=$2
    shift 2
  fi
  tree=$trees/$(git -C "$root" rev-parse --short "$rev")
  log=$logs/$(tr '^' P <<<"$rev")-$(tr ' ' - <<<"$*").log
  if [ ! -d "$tree" ]; then
    mkdir -p "$tree"
    git -C "$root" archive "$rev" | tar -x -C "$tree"
    ln -s "$root/node_modules" "$tree/node_modules"
    if [ -d "$tree/packages/env" ]; then ln -s "$root/packages/env/node_modules" "$tree/packages/env/node_modules"; fi
  fi
  mkdir -p "$tree/scripts"
  cp "$root/scripts/check-deploy-config.ts" "$root/scripts/image-smoke.sh" "$tree/scripts/"
  (cd "$tree" && "$@") >"$log" 2>&1
  code=$?
  status=$(classify "$expect" "$code" "$pattern" "$later" "$log")
  case $status in
    FAIL) failures=$((failures + 1)) ;;
    STILL) still=$((still + 1)) ;;
  esac
  printf '%-5s %-7s %-10s %-34s exit %s  %s\n' "$status" "$expect" "$rev" "$*" "$code" "$log"
  case $status in
    PASS) if [ "$expect" = caught ]; then grep -m1 -F "$pattern" "$log"; else grep -m1 -E '^(deploy config|image smoke)' "$log"; fi ;;
    STILL) echo "cleared, but still fails on a later bug: $(grep -m1 -E "$later" "$log")" ;;
    FAIL) grep -m1 -E '^(ERROR|deploy config|image smoke)' "$log" ;;
  esac | cut -c1-240 | sed 's/^/    /'
}

replay caught 2f7942f9^ 'VITE_SERVER_URL is required in packages/env/src/web.ts, but it is not an ARG' check
replay caught e9f7709c^ '(services.server.build.args): missing VITE_TURNSTILE_SITE_KEY' check
replay caught e9f7709c '(services.server.environment): VITE_TURNSTILE_SITE_KEY is set at runtime' check
replay passes 2f7942f9 '' check
replay caught 25a194bc^ '(services.server.build.args): missing SOURCE_COMMIT' check
replay cleared 25a194bc 'missing SOURCE_COMMIT' --still 'VITE_(SERVER_URL|TURNSTILE_SITE_KEY)' check
replay passes HEAD '' check

replay caught a64882e8^ 'lockfile had changes, but lockfile is frozen' smoke db-push
replay cleared a64882e8 'lockfile had changes, but lockfile is frozen' --still "Cannot find package 'dotenv'" smoke db-push
replay caught f94b1727^ 'drizzle-kit: command not found' smoke db-push
replay passes f94b1727 '' smoke db-push
replay caught 5fb21638^ "Cannot find package 'dotenv'" smoke db-push
replay passes 5fb21638 '' smoke db-push
replay caught 0413ac06^ 'EVLOG_AXIOM_TOKEN' smoke_with_early_access server
replay cleared 0413ac06 'EVLOG_AXIOM_TOKEN' --still 'does not log in production mode' smoke_with_early_access server
replay caught aa694df2^ 'does not log in production mode' smoke server
replay caught aa694df2 'web bundle in' smoke server
replay caught 2f7942f9^ 'web bundle in' smoke server
replay passes 2f7942f9 '' smoke server
replay passes HEAD '' smoke

echo "replay ci: $failures failed, $still cleared but still failing on a later bug"
[ "$failures" = 0 ]
