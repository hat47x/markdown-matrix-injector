import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pngOf } from './helpers/buildXlsxWithImages.js';
import { buildDocx, drawing, relationship, tableWithHeaderRow } from './helpers/buildDocx.js';

const cli = fileURLToPath(new URL('../src/cli/mmi.ts', import.meta.url));
const cwd = path.dirname(path.dirname(cli));

function run(args: readonly string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      status: failure.status ?? 1,
    };
  }
}

test('mmi inspect/extract --docx-* works end to end and keeps the source unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-docx-cli-'));
  try {
    const source = path.join(root, 'design.docx');
    const bytes = buildDocx({
      relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
      media: { 'image1.png': pngOf(2, 2, [1, 2, 3]) },
      body:
        tableWithHeaderRow(['項目', '内容'], [['名前', 'MMI']])
        + drawing({ relationshipId: 'rId1', name: '図' }),
    });
    fs.writeFileSync(source, bytes);
    const before = fs.readFileSync(source);

    const inspected = run(['inspect', source, '--json', '--from', path.join(root, 'doc.md')]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const parsed = JSON.parse(inspected.stdout) as {
      docx: { tables: { fingerprint: string }[]; images: { ordinal: number }[] };
      candidates: unknown[];
    };
    assert.equal(parsed.candidates.length, 2);
    assert.equal(parsed.docx.tables.length, 1);
    assert.equal(parsed.docx.images.length, 1);

    const extracted = run([
      'extract', source,
      '--docx-table', '1',
      '--expected-fingerprint', parsed.docx.tables[0].fingerprint,
      '--root', root,
      '--out-dir', 'assets',
      '--ledger', 'mmi-ledger.json',
      '--from', path.join(root, 'doc.md'),
      '--json',
    ]);
    assert.equal(extracted.status, 0, extracted.stderr);
    const result = JSON.parse(extracted.stdout) as {
      extracted: { file: string; markdown: string };
    };
    assert.match(result.extracted.markdown, /\| 項目 \| 内容 \|/u);
    assert.ok(fs.existsSync(result.extracted.file));
    assert.deepEqual(fs.readFileSync(source), before);
    assert.ok(fs.existsSync(path.join(root, 'mmi-ledger.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
