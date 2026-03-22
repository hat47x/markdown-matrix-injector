#!/usr/bin/env bash
set -euo pipefail

LOG_PREFIX='[mmi:e2e:shell]'
EXIT_ENV_PREREQUISITE=20
EXIT_BOOTSTRAP=21
EXIT_SPEC_FAILURE=22
EXIT_UNKNOWN=23

log() {
  printf '%s %s\n' "$LOG_PREFIX" "$*"
}

fail() {
  local code="$1"
  shift
  printf '%s %s\n' "$LOG_PREFIX" "$*" >&2
  exit "$code"
}

log "starting VSCode Extension Host E2E harness"
log "platform=$(uname -s 2>/dev/null || echo unknown) arch=$(uname -m 2>/dev/null || echo unknown) node=$(node -v 2>/dev/null || echo unavailable)"

if ! command -v xvfb-run >/dev/null 2>&1; then
  fail "$EXIT_ENV_PREREQUISITE" \
    "result=environment-prerequisite category=headless-prerequisite exit_code=$EXIT_ENV_PREREQUISITE xvfb-run is required before provider/autocomplete triage can start. Install xvfb (for example: 'sudo apt-get update && sudo apt-get install -y xvfb'), verify with 'xvfb-run --help', then re-run 'cd 03_Implement && npm run test:e2e'. Do not read this as a paste/drop provider specification failure."
fi

log "dependency-check:xvfb-run path=$(command -v xvfb-run)"
log "launch-plan=cd 03_Implement && npm run build && npm run test:e2e"
log "triage-contract=runner classifies environment-prerequisite vs suite failures only; native-vs-fallback product policy is out of scope"

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
    fail "$EXIT_BOOTSTRAP" \
      "result=environment-prerequisite category=extension-host-bootstrap:vscode-download exit_code=$EXIT_BOOTSTRAP Extension Host bootstrap failed before suite assertions. Check network reachability or proxy settings for @vscode/test-electron, then re-run 'cd 03_Implement && npm run test:e2e'."
    ;;
  *"error while loading shared libraries"*|*"libgtk-3"*|*"libnss3"*|*"libxkbcommon"*|*"libasound"*|*"libgbm"*|*"The SUID sandbox helper binary was found"*)
    fail "$EXIT_BOOTSTRAP" \
      "result=environment-prerequisite category=extension-host-bootstrap:electron-runtime exit_code=$EXIT_BOOTSTRAP Missing native Electron dependencies or sandbox prerequisites on this host. Fix the runtime prerequisite, then re-run 'cd 03_Implement && npm run test:e2e'."
    ;;
  *"xvfb-run: error"*|*"Xvfb failed to start"*|*"Cannot open display"*|*"no display name and no $DISPLAY environment variable"*)
    fail "$EXIT_ENV_PREREQUISITE" \
      "result=environment-prerequisite category=headless-prerequisite:display-bootstrap exit_code=$EXIT_ENV_PREREQUISITE xvfb-run/Xvfb could not provide a virtual display. Re-check 'xvfb-run --help' and host display libraries before re-running 'cd 03_Implement && npm run test:e2e'."
    ;;
  *"AssertionError"*|*"Expected "*|*"should "*|*"test failed"*|*"ERR_ASSERTION"*)
    fail "$EXIT_SPEC_FAILURE" \
      "result=suite-failure category=inspect-runner-classification exit_code=$EXIT_SPEC_FAILURE Runner launched successfully; inspect the runner's failureSignature above to distinguish paste-drop-provider-*, autocomplete-known-unstable, environment-prerequisite, or unknown."
    ;;
  *)
    fail "$EXIT_UNKNOWN" \
      "result=unknown-failure category=unclassified exit_code=$EXIT_UNKNOWN See runner logs above for environment snapshot, failureSignature, and stack trace before entering native/fallback discussion."
    ;;
esac
