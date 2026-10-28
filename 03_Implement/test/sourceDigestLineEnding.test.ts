import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #690: sourceDigest is taken over the original bytes. A checkout that rewrites
// line endings (Windows core.autocrlf=true) must therefore not touch the sample
// and kit assets that people and TAI hash. These tests run on the CI Windows
// runner, where autocrlf is on, as well as on Linux.

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CLI = fileURLToPath(new URL('../src/cli/mmi.ts', import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

const HASHED_ROOTS = [
  '04_Documentation/kits',
  '04_Documentation/samples/practical',
  '04_Documentation/samples/sier-design',
];
const TEXT_EXTENSIONS = new Set(['.md', '.csv', '.tsv', '.json', '.html', '.xml']);
const BYTE_EXACT = new Set(['04_Documentation/samples/practical/data/excel-cp932.csv']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out') continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function inspectDigest(file: string): string {
  const stdout = execFileSync(
    process.execPath,
    ['--import', TSX_LOADER, CLI, 'inspect', file, '--root', path.dirname(file), '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const match = /"sourceDigest":\s*"(sha256:[0-9a-f]{64})"/u.exec(stdout);
  assert.ok(match, 'inspect --json must report a sourceDigest');
  return match[1]!;
}

test('sourceDigest is byte-exact: CRLF and LF copies of one CSV have different digests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-eol-'));
  try {
    fs.writeFileSync(path.join(dir, 'lf.csv'), 'ID,名称\n1,a\n');
    fs.writeFileSync(path.join(dir, 'crlf.csv'), 'ID,名称\r\n1,a\r\n');
    assert.notEqual(inspectDigest(path.join(dir, 'lf.csv')), inspectDigest(path.join(dir, 'crlf.csv')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hashed sample and kit text assets contain no CR after checkout', () => {
  const offenders: string[] = [];
  for (const root of HASHED_ROOTS) {
    for (const file of walk(path.join(REPO, root))) {
      const rel = path.relative(REPO, file).split(path.sep).join('/');
      if (BYTE_EXACT.has(rel) || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      if (fs.readFileSync(file).includes(0x0d)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], '.gitattributes must keep LF for these files (eol=lf)');
});

test('the CP932 sample keeps its own bytes (CRLF) on every checkout', () => {
  for (const rel of BYTE_EXACT) {
    const bytes = fs.readFileSync(path.join(REPO, rel));
    assert.equal(bytes.includes(Buffer.from('\r\n')), true, `${rel} must keep CRLF`);
  }
});

test('.gitattributes pins LF for hashed assets and lists the CP932 exception last', () => {
  const lines = fs
    .readFileSync(path.join(REPO, '.gitattributes'), 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  for (const root of HASHED_ROOTS) {
    for (const ext of ['md', 'csv']) {
      assert.ok(lines.includes(`${root}/**/*.${ext} text eol=lf`), `missing eol=lf rule for ${root} *.${ext}`);
    }
  }
  const exception = lines.lastIndexOf('04_Documentation/samples/practical/data/excel-cp932.csv -text -diff');
  const lastLf = lines.map((line, i) => (line.endsWith('text eol=lf') && line.startsWith('04_Documentation/') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  assert.ok(exception > lastLf, 'the -text exception must come after the eol=lf rules so it wins');
});
