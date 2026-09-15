#!/usr/bin/env bash
set -euo pipefail

# Full-project checking catches breaks in unchanged callers of edited contracts.
readonly TYPECHECK_HEAP_MB=1024
export NODE_OPTIONS="--max-old-space-size=${TYPECHECK_HEAP_MB}"
export NO_COLOR=1
export FORCE_COLOR=0

if [ "$#" -ne 0 ]; then
  echo "typecheck takes no arguments; it always checks the full project." >&2
  exit 2
fi

# A fresh positive-only Program prevents an expected error from hiding TS2589.
node ./scripts/validate/result-defaults.mjs
exec node ./node_modules/typescript/bin/tsc --project tsconfig.json --noEmit --pretty false
