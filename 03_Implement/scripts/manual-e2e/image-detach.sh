#!/bin/bash
# Manual E2E for issue-0196 (pictures): extract -> materialize -> remove the sources -> detach-check,
# plus the fail-closed case where a reviewed picture changed.
#
#   npm run build:product            # compiled CLI in dist/ (tsx is too slow for this on /mnt/c)
#   bash scripts/manual-e2e/image-detach.sh [workdir]
#
# Needs Node.js 20 or newer on PATH. A non-login shell may pick an older node (issue-0197):
# set NODE_BIN to the directory of a Node 20 binary to override.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
impl="$(cd "$here/../.." && pwd)"
[ -n "${NODE_BIN:-}" ] && export PATH="$NODE_BIN:$PATH"
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then echo "node $node_major is too old; set NODE_BIN to a Node 20 bin directory"; exit 2; fi
[ -f "$impl/dist/src/cli/mmi.js" ] || { echo "build first: npm run build:product"; exit 2; }
MMI="node $impl/dist/src/cli/mmi.js"
W="${1:-$(mktemp -d)}"
rm -rf "$W" && mkdir -p "$W/src" && cd "$W/src" || exit 1
ok=0; ng=0
check() { # label, expected exit, actual exit, detail
  if [ "$2" = "$3" ]; then echo "PASS  $1 (exit $3)"; ok=$((ok+1)); else echo "FAIL  $1 (expected $2, got $3) $4"; ng=$((ng+1)); fi
}
# The generator is TypeScript; load tsx from this checkout (the working directory is a temp project).
gen() { node --import "$impl/node_modules/tsx/dist/loader.mjs" "$impl/scripts/manual-e2e/gen-image-design.ts" "$@"; }

gen "$W/src/design.xlsx" > "$W/gen.log" 2>&1
check "generate workbook" 0 $? "$(tail -2 "$W/gen.log")"
$MMI extract design.xlsx --image all --root "$W/src" --out-dir assets > "$W/extract.out" 2> "$W/extract.err" < /dev/null
check "extract --image all" 0 $? "$(head -c 300 "$W/extract.err")"
[ -f "$W/src/mmi-ledger.json" ]; check "ledger written" 0 $? ""

cat > "$W/src/spec.md" <<EOF
# 画面設計

![[./design.xlsx#画面一覧|A1:B3?header=first&caption=画面一覧]]

$(cat "$W/extract.out")
EOF
$MMI materialize spec.md -o "$W/src/out/spec.md" --root "$W/src" > "$W/materialize.out" 2> "$W/materialize.err" < /dev/null
check "materialize (fresh provenance)" 0 $? "$(head -c 400 "$W/materialize.err")"

# Hand over only the output folder; remove the source workbook, extraction assets and ledger.
rm -rf "$W/handoff" && mkdir -p "$W/handoff" && cp -r "$W/src/out/." "$W/handoff/"
rm -rf "$W/src/design.xlsx" "$W/src/assets" "$W/src/mmi-ledger.json" "$W/src/out"
$MMI detach-check "$W/handoff/spec.md" --root "$W/handoff" > "$W/detach.out" 2>&1 < /dev/null
check "detach-check on the handed-over folder" 0 $? "$(head -c 400 "$W/detach.out")"
echo "--- handoff contents:"; (cd "$W/handoff" && find . -type f | sort)

# Fail-closed: the reviewed picture was edited in Excel. Re-review the original, then edit.
gen "$W/src/design.xlsx" > /dev/null 2>&1
$MMI extract design.xlsx --image all --root "$W/src" --out-dir assets > /dev/null 2>&1 < /dev/null
gen "$W/src/design.xlsx" changed > "$W/mutate.log" 2>&1
check "workbook edited after review" 0 $? "$(tail -2 "$W/mutate.log")"
rm -rf "$W/src/out"
$MMI materialize spec.md -o "$W/src/out/spec.md" --root "$W/src" > /dev/null 2> "$W/refused.err" < /dev/null
refused=$?
check "materialize refuses a changed picture" 1 $refused "$(head -c 300 "$W/refused.err")"
echo "reason: $(head -c 300 "$W/refused.err" | tr '\n' ' ')"
if grep -q 'MMI_DETACH_EXTRACTED_STALE' "$W/refused.err"; then echo "PASS  refusal names the stale adopted Candidate"; ok=$((ok+1)); else echo "FAIL  refusal does not name the stale Candidate"; ng=$((ng+1)); fi
[ ! -e "$W/src/out/spec.md" ]; check "no output written after refusal" 0 $? ""

echo "== image detach E2E in $W: $ok passed, $ng failed"
[ $ng -eq 0 ]
