#!/usr/bin/env node
// Runs every tools/test_*.py that `test:release-gate-tools` does not already run (#757).
// Test files are discovered, not listed, so a newly added tools/test_*.py cannot sit
// unexecuted: it is picked up here automatically.
//   node scripts/run-python-tool-tests.mjs [--list]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'tools');

export function listToolTests(packageJson, files) {
  const gate = String(packageJson.scripts?.['test:release-gate-tools'] ?? '');
  return files
    .filter((name) => /^test_.+\.py$/u.test(name))
    .filter((name) => !gate.includes(`tools/${name}`))
    .sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tests = listToolTests(pkg, fs.readdirSync(toolsDir));
  if (process.argv.includes('--list')) {
    console.log(tests.join('\n'));
    process.exit(0);
  }
  console.error(`python tool tests: ${tests.length} files`);
  let failed = 0;
  for (const name of tests) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'run-python.mjs'), path.join('tools', name)],
      { cwd: root, stdio: 'inherit' },
    );
    if (result.status !== 0) {
      failed += 1;
      console.error(`[python tool tests] FAILED: ${name}`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}
