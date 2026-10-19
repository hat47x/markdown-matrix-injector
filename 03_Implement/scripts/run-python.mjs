#!/usr/bin/env node
// Runs a Python 3 script with the first interpreter that actually works.
// On Windows `python3` is often the Microsoft Store stub, which exits with
// an error instead of running anything, so a bare `python3` in package.json
// makes `npm test` fail there for reasons unrelated to the product.
import { spawnSync } from 'node:child_process';

const CANDIDATES = [
  ['python3'],
  ['python'],
  ...(process.platform === 'win32' ? [['py', '-3']] : []),
];

export function findPython(candidates = CANDIDATES) {
  for (const [command, ...prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: false,
    });
    if (probe.status === 0 && probe.stdout.trim() === '3') return [command, ...prefix];
  }
  return undefined;
}

const python = findPython();
if (!python) {
  console.error('[run-python] Python 3 was not found (tried python3, python, py -3). Install Python 3.10 or later.');
  process.exit(127);
}
const [command, ...prefix] = python;
const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
