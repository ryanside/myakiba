#!/usr/bin/env bash
# Usage: bash scripts/replay-ci.sh
# Copies this checkout's deploy-config checker and image smoke into past trees and runs them.
set -uo pipefail

root=$(git rev-parse --show-toplevel)
trees=$(mktemp -d)
logs=${TMPDIR:-/tmp}/replay-ci
failures=0
rm -rf "$logs"
mkdir -p "$logs"
trap 'rm -rf "$trees"' EXIT

check() { bun scripts/check-deploy-config.ts; }
smoke() { bash scripts/image-smoke.sh "$@"; }

replay() {
  local expect=$1 rev=$2 pattern=$3 tree log code ok
  shift 3
  tree=$trees/$(git -C "$root" rev-parse --short "$rev")
  log=$logs/$(tr '^' P <<<"$rev")-$(tr ' ' - <<<"$*").log
  if [ ! -d "$tree" ]; then
    mkdir -p "$tree"
    git -C "$root" archive "$rev" | tar -x -C "$tree"
  fi
  mkdir -p "$tree/scripts"
  cp "$root/scripts/check-deploy-config.ts" "$root/scripts/image-smoke.sh" "$tree/scripts/"
  (cd "$tree" && "$@") >"$log" 2>&1
  code=$?
  case $expect in
    caught) [ "$code" != 0 ] && grep -qF "$pattern" "$log" ;;
    cleared) ! grep -qF "$pattern" "$log" ;;
    passes) [ "$code" = 0 ] ;;
  esac
  ok=$?
  [ "$ok" = 0 ] || failures=$((failures + 1))
  printf '%s %-7s %-10s %-14s exit %s  %s\n' "$([ "$ok" = 0 ] && echo PASS || echo FAIL)" "$expect" "$rev" "$*" "$code" "$log"
  if [ "$expect" = caught ]; then grep -m1 -F "$pattern" "$log"; else grep -m1 -E '^(deploy config|image smoke)' "$log"; fi | cut -c1-240 | sed 's/^/    /'
}

replay caught 2f7942f9^ 'apps/server/Dockerfile: VITE_SERVER_URL is required' check
replay caught e9f7709c^ 'docker-compose.yml services.server.build.args: missing VITE_TURNSTILE_SITE_KEY' check
replay passes 2f7942f9 '' check
replay caught 25a194bc^ 'docker-compose.yml services.server.build.args: missing SOURCE_COMMIT' check
replay cleared 25a194bc 'SOURCE_COMMIT' check
replay passes HEAD '' check

replay caught a64882e8^ 'lockfile had changes, but lockfile is frozen' smoke db-push
replay cleared a64882e8 'lockfile had changes, but lockfile is frozen' smoke db-push
replay caught f94b1727^ 'drizzle-kit: command not found' smoke db-push
replay passes f94b1727 '' smoke db-push
replay caught 5fb21638^ "Cannot find package 'dotenv'" smoke db-push
replay passes 5fb21638 '' smoke db-push
replay caught 0413ac06^ 'EVLOG_AXIOM_TOKEN' smoke server
replay cleared 0413ac06 'EVLOG_AXIOM_TOKEN' smoke server
replay caught aa694df2^ 'does not log in production mode' smoke server
replay passes aa694df2 '' smoke server
replay passes HEAD '' smoke

echo "replay ci: $failures failed"
[ "$failures" = 0 ]
