#!/usr/bin/env bash
set -euo pipefail

LOG_PREFIX='[mmi:e2e:shell]'

log() {
  printf '%s %s\n' "$LOG_PREFIX" "$*"
}

fail() {
  printf '%s %s\n' "$LOG_PREFIX" "$*" >&2
  exit 1
}

log "starting VSCode Extension Host E2E harness"
log "platform=$(uname -s 2>/dev/null || echo unknown) arch=$(uname -m 2>/dev/null || echo unknown) node=$(node -v 2>/dev/null || echo unavailable)"

if ! command -v xvfb-run >/dev/null 2>&1; then
  fail "environment-missing:xvfb-run Extension Host E2E requires a virtual display in headless Linux. Install xvfb (for example: 'sudo apt-get update && sudo apt-get install -y xvfb'), verify with 'xvfb-run --help', then re-run 'cd 03_Implement && npm run test:e2e'."
fi

log "dependency-check:xvfb-run path=$(command -v xvfb-run)"
log "launch-plan=cd 03_Implement && npm run build && npm run test:e2e"

set +e
output=$(MMI_E2E_UNDER_XVFB=1 xvfb-run -a node --import tsx ./test/e2e/runTest.ts 2>&1)
status=$?
set -e

printf '%s\n' "$output"

if [ "$status" -eq 0 ]; then
  log "result=pass VSCode Extension Host E2E runner completed"
  exit 0
fi

case "$output" in
  *"Failed to download VS Code"*|*"Failed to download and unzip VS Code"*|*"getaddrinfo"*|*"ECONNREFUSED"*|*"ETIMEDOUT"*)
    fail "result=infra-failure category=vscode-download Check network reachability or proxy settings for @vscode/test-electron."
    ;;
  *"error while loading shared libraries"*|*"libgtk-3"*|*"libnss3"*|*"libxkbcommon"*|*"libasound"*|*"libgbm"*|*"The SUID sandbox helper binary was found"*)
    fail "result=infra-failure category=electron-runtime Missing native Electron dependencies or sandbox prerequisites on this host."
    ;;
  *"xvfb-run: error"*|*"Xvfb failed to start"*|*"Cannot open display"*|*"no display name and no $DISPLAY environment variable"*)
    fail "result=infra-failure category=display-bootstrap xvfb-run/Xvfb could not provide a virtual display."
    ;;
  *"AssertionError"*|*"Expected "*|*"should "*|*"test failed"*|*"ERR_ASSERTION"*)
    fail "result=test-failure category=specification Runner launched successfully; inspect suite assertion output above."
    ;;
  *)
    fail "result=unknown-failure category=unclassified See runner logs above for environment snapshot and stack trace."
    ;;
esac
