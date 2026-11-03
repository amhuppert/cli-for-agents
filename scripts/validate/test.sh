#!/usr/bin/env bash
set -euo pipefail

# This canonical wrapper owns the profile: one coordinator and one test worker.
readonly TEST_WORKERS=1
readonly TEST_HEAP_MB=1024
export NODE_OPTIONS="--max-old-space-size=${TEST_HEAP_MB}"
export NO_COLOR=1
export FORCE_COLOR=0

# Resolve the launcher next to the canonical wrapper, not from candidate cwd.
TEST_WRAPPER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TEST_CAPTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cli-for-agents-tests.XXXXXXXX")"
trap 'rm -rf -- "$TEST_CAPTURE_DIR"' EXIT

run_captured() {
  local test_status
  if "$@" >"$TEST_CAPTURE_DIR/diagnostics" 2>&1; then
    return 0
  else
    test_status=$?
  fi
  cat -- "$TEST_CAPTURE_DIR/diagnostics" >&2
  return "$test_status"
}

# Validate exact files and compile first. This Node process exits before testing,
# keeping wrapper/runner overhead within the two-process profile.
run_captured node "--max-old-space-size=${TEST_HEAP_MB}" \
  "$TEST_WRAPPER_DIR/test-launcher.mjs" "$TEST_CAPTURE_DIR/paths" "$@"

TEST_ARGS=()
while IFS= read -r -d '' TEST_ARG; do
  TEST_ARGS+=("$TEST_ARG")
done <"$TEST_CAPTURE_DIR/paths"

if [ "${#TEST_ARGS[@]}" -lt 2 ]; then
  echo "test: launcher produced an empty test inventory." >&2
  exit 2
fi

TEST_STATUS=0
node "--max-old-space-size=${TEST_HEAP_MB}" \
  --test --test-reporter=tap "--test-concurrency=${TEST_WORKERS}" "${TEST_ARGS[@]}" \
  >"$TEST_CAPTURE_DIR/diagnostics" 2>&1 || TEST_STATUS=$?
node "$TEST_WRAPPER_DIR/test-summary.mjs" "$TEST_CAPTURE_DIR/diagnostics" "$TEST_STATUS"
