#!/usr/bin/env bash
set -euo pipefail

# This profile owns its memory limit even when the caller sets NODE_OPTIONS.
readonly BUILD_HEAP_MB=1024
export NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP_MB}"
export NO_COLOR=1
export FORCE_COLOR=0

if [ "$#" -ne 0 ]; then
  echo "build takes no arguments; it always builds the full library." >&2
  exit 2
fi

exec node ./node_modules/typescript/bin/tsc --project tsconfig.build.json --pretty false
