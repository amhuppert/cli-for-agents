#!/usr/bin/env bash
set -euo pipefail
# Standalone CI has no CC server. Reuse the canonical exact-file validation wrapper.
# Inside Command Center invoke: cctl validate run test -- tests/distribution.test.mjs
exec scripts/validate/test.sh tests/distribution.test.mjs
