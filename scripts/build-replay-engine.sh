#!/usr/bin/env bash
# Rebuild watch/js/replayEngine.js from sibling app packages/replay.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(cd "$ROOT/../parninja" && pwd)"
if [[ ! -f "$APP/packages/replay/scripts/build-watch-iife.mjs" ]]; then
  echo "Expected app package at $APP/packages/replay" >&2
  exit 1
fi
(cd "$APP" && npm run build:watch-replay)
