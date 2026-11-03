#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v skill-sync >/dev/null 2>&1; then
  echo 'plugin sync: install skill-sync and ensure it is on PATH.' >&2
  exit 127
fi

# Convert skills while retaining the native .codex-plugin manifest layout.
exec skill-sync skills \
  --from "$repo_root/plugins/claude/agentic-engineering-principles-plugin/skills" \
  --to "$repo_root/plugins/codex/agentic-engineering-principles/skills" \
  --override
