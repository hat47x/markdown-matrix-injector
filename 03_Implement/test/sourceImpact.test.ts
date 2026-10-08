import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import {
  SOURCE_IMPACT_SCHEMA,
  analyzeSourceImpact,
} from '../src/application/sourceImpact.js';

function fixture(): {
  root: string;
  source: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-impact-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);

  const source = path.join(data, 'design.xlsx');
  fs.writeFileSync(source, Buffer.from('fictional-source-v1'));

  fs.writeFileSync(
    path.join(docs, 'linked.md'),
    [
      '# Linked',
      '',
      '![[../data/design.xlsx#画面一覧|A1:B3?header=first]]',
      '',
      '[open source](../data/design.xlsx)',
      '',
      '~~~text',
      '![[../data/design.xlsx#ignored|Z1:Z9]]',
      '[ignored](../data/design.xlsx)',
      '~~~',
      '',
      '[external](https://example.invalid/design.xlsx)',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(docs, 'extracted.md'),
    [
      '# Extracted',
      '',
      '![login](./assets/login.png)',
      '<!-- mmi:extracted source="../data/design.xlsx" sheet="画面一覧" anchor="D1:F4" sha256="' + 'a'.repeat(64) + '" -->',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(docs, 'unrelated.md'),
    '# Other\n\n![[../data/other.xlsx#Sheet1|A1:B2]]\n',
  );

  return { root, source };
}

test('impact joins Linked, Extracted and ordinary local-link dependencies', () => {
  const f = fixture();
  const result = analyzeSourceImpact({
    sourcePath: f.source,
    workspaceRoot: f.root,
  });

  assert.equal(result.schema, SOURCE_IMPACT_SCHEMA);
  assert.equal(result.source.path, 'data/design.xlsx');
  assert.equal(result.source.exists, true);
  assert.match(result.source.digest ?? '', /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.documentsScanned, 3);
  assert.deepEqual(result.counts, {
    linked: 1,
    extracted: 1,
    localLink: 1,
    total: 3,
  });
  assert.deepEqual(
    result.impacts.map((item) => ({
      document: item.document,
      line: item.line,
      relation: item.relation,
      resolution: item.resolution,
      kind: item.kind,
      sheet: item.sheet,
      place: item.place,
    })),
    [
      {
        document: 'docs/extracted.md',
        line: 4,
        relation: 'extracted',
        resolution: 'resolved',
        kind: 'image',
        sheet: '画面一覧',
        place: 'D1:F4',
      },
      {
        document: 'docs/linked.md',
        line: 3,
        relation: 'linked',
        resolution: 'resolved',
        kind: 'mmi-embed',
        sheet: '画面一覧',
        place: 'A1:B3',
      },
      {
        document: 'docs/linked.md',
        line: 5,
        relation: 'local-link',
        resolution: 'resolved',
        kind: undefined,
        sheet: undefined,
        place: undefined,
      },
    ],
  );
});

test('impact keeps conservative path evidence after the source was deleted', () => {
  const f = fixture();
  fs.rmSync(f.source);

  const result = analyzeSourceImpact({
    sourcePath: f.source,
    workspaceRoot: f.root,
  });

  assert.equal(result.source.exists, false);
  assert.equal(result.source.digest, undefined);
  assert.equal(result.counts.total, 3);
  assert.deepEqual(
    [...new Set(result.impacts.map((item) => item.resolution))],
    ['path-only'],
  );
});

test('impact rejects a source path outside the workspace even when it is missing', () => {
  const f = fixture();
  const outside = path.resolve(f.root, '..', 'outside-design.xlsx');

  assert.throws(
    () => analyzeSourceImpact({
      sourcePath: outside,
      workspaceRoot: f.root,
    }),
    /outside workspace boundary/u,
  );
});

test('CLI impact is read-only and supports a deleted source path', async () => {
  const f = fixture();
  const before = listFiles(f.root);

  const present = await captureMain([
    'impact',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(present.code, 0);
  const presentReport = JSON.parse(present.output);
  assert.equal(presentReport.counts.total, 3);
  assert.equal(presentReport.source.exists, true);
  assert.deepEqual(listFiles(f.root), before);

  fs.rmSync(f.source);
  const afterRemoval = listFiles(f.root);
  const missing = await captureMain([
    'impact',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(missing.code, 0);
  const missingReport = JSON.parse(missing.output);
  assert.equal(missingReport.source.exists, false);
  assert.equal(missingReport.counts.total, 3);
  assert.equal(
    missingReport.impacts.every((item: { resolution: string }) =>
      item.resolution === 'path-only'),
    true,
  );
  assert.deepEqual(listFiles(f.root), afterRemoval);
});

test('CLI impact rejects a source outside root', async () => {
  const f = fixture();
  const outside = path.resolve(f.root, '..', 'outside.xlsx');
  const result = await captureMain([
    'impact',
    outside,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(result.code, 2);
});

async function captureMain(
  argv: string[],
): Promise<{ code: number; output: string; errors: string }> {
  const written: string[] = [];
  const errors: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (
    written.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: written.join(''),
      errors: errors.join('\n'),
    };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  };
  visit(root);
  return files.sort();
}
