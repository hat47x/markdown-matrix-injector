#!/usr/bin/env bash
set -euo pipefail

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "xvfb-run is required for VSCode Extension Host E2E tests. Install xvfb first." >&2
  exit 1
fi

xvfb-run -a node --import tsx ./test/e2e/runTest.ts
