#!/usr/bin/env bash
# Rebuild watch/js/replayEngine.js from the app's @parninja/replay package.
#
# The app repo is READ-ONLY from here: source is exported with `git archive` from a
# committed ref into a temp dir and bundled there. Nothing is written to ../parninja.
#
# Usage: scripts/build-replay-engine.sh [ref]   (default: origin/main)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${PARNINJA_APP:-$ROOT/../parninja}"
REF="${1:-origin/main}"
ESBUILD_VERSION="0.28.2"
OUT="$ROOT/watch/js/replayEngine.js"

if ! git -C "$APP" rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
  echo "Ref '$REF' not found in $APP (run 'git -C $APP fetch' yourself if needed)" >&2
  exit 1
fi
SHA="$(git -C "$APP" rev-parse --short "$REF")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -C "$APP" archive "$REF" packages/replay/src | tar -x -C "$TMP"

BANNER="/**
 * @parninja/replay — GENERATED FILE. Do not edit by hand.
 * Source: packages/replay (app repo @ $SHA). Rebuild: scripts/build-replay-engine.sh
 */"

(cd "$TMP" && npx --yes "esbuild@$ESBUILD_VERSION" packages/replay/src/browser.ts \
  --bundle --format=iife --platform=browser --target=es2018 \
  --banner:js="$BANNER" --outfile="$OUT" --log-level=warning)

echo "Wrote $OUT from $REF ($SHA)"
