import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { renderNativeSvgRegionSnapshot } from '../src/snapshot/nativeSvgRegionSnapshot.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function setup(): {
  root: string;
  source: string;
  document: string;
  ledger: string;
  svg: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-region-freshness-'));
  const source = path.join(root, 'design.xlsx');
  const document = path.join(root, 'doc.md');
  const ledger = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  const snapshot = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sourceLabel: './design.xlsx',
    sheet: '画面一覧',
    range: 'A1:G6',
    outDir: path.join(root, 'assets', 'snapshots'),
    ledgerPath: ledger,
    fromDocument: document,
  });
  fs.writeFileSync(document, `${snapshot.markdown}\n`);
  return { root, source, document, ledger, svg: snapshot.svgFile };
}

function freshness(root: string, document: string, ledger: string) {
  return checkExtractedProvenanceFreshness({
    markdownFilePath: document,
    workspaceRoot: root,
    ledgerPath: ledger,
  });
}

test('a region snapshot is fresh while its source and artifact are unchanged', () => {
  const { root, document, ledger } = setup();
  try {
    const result = freshness(root, document, ledger);
    assert.deepEqual([result.checked, result.errors], [1, 0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a changed source marks the region snapshot stale and requires re-review', () => {
  const { root, source, document, ledger } = setup();
  try {
    fs.appendFileSync(source, Buffer.from('changed'));
    const result = freshness(root, document, ledger);
    assert.equal(result.errors, 1);
    assert.equal(result.problems[0].code, 'MMI_DETACH_EXTRACTED_STALE');
    assert.match(result.problems[0].message, /source changed/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an edited rendered artifact is stale even when the source is unchanged', () => {
  const { root, document, ledger, svg } = setup();
  try {
    fs.appendFileSync(svg, '\n<!-- edited -->\n');
    const result = freshness(root, document, ledger);
    assert.equal(result.errors, 1);
    assert.equal(result.problems[0].code, 'MMI_DETACH_EXTRACTED_STALE');
    assert.match(result.problems[0].message, /artifact is missing or changed/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
