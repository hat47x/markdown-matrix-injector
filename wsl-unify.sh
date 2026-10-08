#!/bin/bash
# WSL2 npm (Node v20, npm 10): fresh npm ci, build, unit tests for two refs, then compare failing sets.
export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH
REPO=/mnt/c/GIT/hat47x/markdown-matrix-injector
run_ref() { # ref, name
  local dir=~/unify-$2
  rm -rf "$dir" && mkdir -p "$dir"
  (cd "$REPO" && git archive "$1") | tar -x -C "$dir"
  cd "$dir/03_Implement" || return 1
  npm ci --no-audit --no-fund > /tmp/unify-$2-ci.log 2>&1; echo "[$2] npm ci exit=$?"
  npm run build > /tmp/unify-$2-build.log 2>&1; echo "[$2] build exit=$? tsc errors=$(grep -c 'error TS' /tmp/unify-$2-build.log)"
  npm run test:unit > /tmp/unify-$2-unit.log 2>&1; echo "[$2] test:unit exit=$?"
  grep -E "^# (tests|pass|fail)" /tmp/unify-$2-unit.log
  grep "^not ok" /tmp/unify-$2-unit.log | sed "s/^not ok [0-9]* - //" | sort > /tmp/unify-$2.fail
}
run_ref 06ab712 base
run_ref feature/search-observation-unify unify
echo "--- failing only in base (origin/main):"; comm -23 /tmp/unify-base.fail /tmp/unify-unify.fail
echo "--- failing only in unify:"; comm -13 /tmp/unify-base.fail /tmp/unify-unify.fail
echo "--- unify observation/search tests:"; grep -E "^ok|^not ok" /tmp/unify-unify-unit.log | grep -i "observ" | head -40
echo done
