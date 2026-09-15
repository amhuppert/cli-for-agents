#!/usr/bin/env bash
set -euo pipefail

# The draft has only a compiler dependency and requires no lifecycle scripts.
npm ci --ignore-scripts --no-audit --no-fund
