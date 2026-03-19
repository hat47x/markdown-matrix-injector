#!/usr/bin/env bash
set -euo pipefail

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "xvfb-run is required for VSCode Extension Host E2E tests. Install xvfb first (for example: sudo apt-get install -y xvfb)." >&2
  exit 1
fi

echo "[mmi:e2e] launching VSCode Extension Host tests via xvfb-run"
xvfb-run -a node --import tsx ./test/e2e/runTest.ts
