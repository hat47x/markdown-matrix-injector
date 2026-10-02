import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { extractImages } from '../src/cli/extract.js';
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
