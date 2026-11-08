#!/usr/bin/env bash
# Rebuilds the extension from its sources zip in a clean directory, as AMO's reviewers do, and checks every zip matches.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(bun -e 'console.log((await Bun.file("package.json").json()).version)')
sources=".output/myakiba-$version-sources.zip"
[ -f "$sources" ] || { echo "$sources is missing, so run bun run zip first" >&2; exit 1; }
untracked=$(comm -23 <(unzip -Z1 "$sources" | sort) <(git ls-files --full-name -- ../.. | sort))
[ -z "$untracked" ] || { echo "the sources zip holds files git does not track, so commit or exclude them:" >&2; echo "$untracked" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
unzip -q "$sources" -d "$work/src"
if ! (cd "$work/src" && bun install --frozen-lockfile && cd apps/extension && bun run zip) > "$work/rebuild.log" 2>&1; then
  echo "the rebuild from the sources zip failed:" >&2
  cat "$work/rebuild.log" >&2
  exit 1
fi
for kind in chrome firefox sources; do
  zip="myakiba-$version-$kind.zip"
  cmp ".output/$zip" "$work/src/apps/extension/.output/$zip"
  echo "$zip matches the build from the sources zip"
done
