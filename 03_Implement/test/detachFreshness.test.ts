import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { extractImages } from '../src/cli/extract.js';
import { main } from '../src/cli/mmi.js';
import { pngOf, screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function adoptedImageWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-fresh-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'design.xlsx');
  const doc = path.join(docs, 'spec.md');
  const ledger = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const extracted = extractImages({
    sourcePath: source,
    selection: '1',
    outDir: path.join(docs, 'assets'),
    fromDocument: doc,
    ledgerPath: ledger,
  });
  assert.deepEqual(extracted.problems, []);
  assert.equal(extracted.extracted.length, 1);
  fs.writeFileSync(doc, `# Spec\n\n${extracted.extracted[0].markdown}\n`);
  return { root, source, doc, ledger };
}


async function captureMaterializeMain(
  argv: string[],
): Promise<{ code: number; output: string; errors: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (
    output.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: output.join(''),
      errors: errors.join('\n'),
    };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('detach freshness accepts an adopted extracted Candidate that still matches its review basis', () => {
  const { root, doc, ledger } = adoptedImageWorkspace();
  const result = checkExtractedProvenanceFreshness({
    markdownFilePath: doc,
    workspaceRoot: root,
    ledgerPath: ledger,
  });

  assert.deepEqual(result, { checked: 1, errors: 0, problems: [] });
});

test('detach freshness rejects an adopted image after the source occurrence changes', () => {
  const { root, source, doc, ledger } = adoptedImageWorkspace();
  fs.writeFileSync(
    source,
    screenDesignWorkbook({
      login: pngOf(8, 6, [30, 160, 90]),
    }).bytes,
  );

  const result = checkExtractedProvenanceFreshness({
    markdownFilePath: doc,
    workspaceRoot: root,
    ledgerPath: ledger,
  });

  assert.equal(result.errors, 1);
  assert.equal(result.problems[0].code, 'MMI_DETACH_EXTRACTED_STALE');
  assert.equal(result.problems[0].ledgerState, 'changed');
});

test('detach freshness fails closed when adopted provenance exists without its ledger', () => {
  const { root, doc, ledger } = adoptedImageWorkspace();
  fs.rmSync(ledger);

  const result = checkExtractedProvenanceFreshness({
    markdownFilePath: doc,
    workspaceRoot: root,
    ledgerPath: ledger,
  });

  assert.equal(result.checked, 0);
  assert.equal(result.errors, 1);
  assert.equal(result.problems[0].code, 'MMI_DETACH_LEDGER_MISSING');
});


test('materialize rejects a stale adopted Candidate without writing the detached package', async () => {
  const { root, source, doc, ledger } = adoptedImageWorkspace();
  fs.writeFileSync(
    source,
    screenDesignWorkbook({
      login: pngOf(8, 6, [30, 160, 90]),
    }).bytes,
  );
  const out = path.join(root, 'detached', 'spec.md');

  const run = await captureMaterializeMain([
    'materialize',
    doc,
    '--root',
    root,
    '--ledger',
    ledger,
    '-o',
    out,
    '--json',
  ]);

  assert.equal(run.code, 1);
  assert.equal(fs.existsSync(out), false);
  assert.equal(
    fs.existsSync(path.join(root, 'detached', 'mmi-assets')),
    false,
  );

  const summary = JSON.parse(run.output);
  assert.equal(summary.freshness.errors, 1);
  assert.equal(
    summary.freshness.problems[0].code,
    'MMI_DETACH_EXTRACTED_STALE',
  );
  assert.equal(summary.written, false);
  assert.deepEqual(summary.collisions, []);
  assert.match(run.errors, /MMI_DETACH_EXTRACTED_STALE/u);
});
