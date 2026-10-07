import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildCandidateReviewInventory } from '../src/application/candidateReviewInventory.js';
import {
  discardUnrecordedTableExtraction,
  extractTable,
  finalizeReviewedTableExtraction,
  reviewTextAdjustment,
} from '../src/cli/extract.js';
import { main } from '../src/cli/mmi.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-table-extract-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'roles.csv');
  const doc = path.join(docs, 'spec.md');
  fs.writeFileSync(source, 'ID,操作,備考\nOP-01,申請,a|b\nOP-02,承認,\n');
  fs.writeFileSync(doc, '# Spec\n');
  return {
    root,
    source,
    doc,
    outDir: path.join(docs, 'assets'),
    ledgerPath: path.join(root, 'mmi-ledger.json'),
  };
}

const digest = (file: string) =>
  `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('reviewTextAdjustment counts Unicode code points and only the changed span', () => {
  assert.deepEqual(reviewTextAdjustment('A😀B', 'A猫B'), {
    originalCharacters: 3,
    reviewedCharacters: 3,
    changedSpanCharacters: 2,
  });
  assert.deepEqual(reviewTextAdjustment('同じ', '同じ'), {
    originalCharacters: 2,
    reviewedCharacters: 2,
    changedSpanCharacters: 0,
  });
});

test('extractTable writes a standard GFM asset, records provenance, and never changes the source', () => {
  const f = workspace();
  const sourceBefore = digest(f.source);

  const result = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.equal(result.extracted.status, 'written');
  assert.match(path.basename(result.extracted.file), /^table-[0-9a-f]{12}\.md$/u);
  assert.equal(digest(result.extracted.file), result.extracted.digest);
  assert.match(
    result.extracted.markdown,
    /^\| ID \| 操作 \| 備考 \|\n\| --- \| --- \| --- \|\n\| OP-01 \| 申請 \| a\\\|b \|\n\| OP-02 \| 承認 \|  \|/u,
  );
  assert.match(
    result.extracted.markdown,
    /<!-- mmi:extracted-table source="\.\.\/data\/roles\.csv" sheet="Sheet1" range="A1:C3" source-sha256="[0-9a-f]{64}" candidate-sha256="[0-9a-f]{64}" -->$/u,
  );
  assert.equal(digest(f.source), sourceBefore);

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'table-range');
  assert.equal(ledger.entries[0].sheet, 'Sheet1');
  assert.equal(ledger.entries[0].place, 'A1:C3');
  assert.equal(ledger.entries[0].basis, 'mmi extract --table');
  assert.deepEqual(ledger.entries[0].conversion, {
    mode: 'gfm-table-v1',
    header: 'first',
  });

  const again = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });
  assert.deepEqual(again.problems, []);
  assert.equal(again.extracted?.status, 'unchanged');
  assert.equal(again.extracted?.file, result.extracted.file);
});

test('reviewed table output can be modified without changing Candidate origin', () => {
  const f = workspace();
  const draft = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
  });
  assert.deepEqual(draft.problems, []);
  assert.ok(draft.extracted);
  const originalFile = draft.extracted.file;

  const finalized = finalizeReviewedTableExtraction({
    sourcePath: f.source,
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    extracted: draft.extracted,
    editedMarkdown: draft.extracted.markdown.replace(
      '| OP-02 | 承認 |  |',
      '| OP-02 | 承認済み | 人手修正 |',
    ),
    fromDocument: f.doc,
  });

  assert.deepEqual(finalized.problems, []);
  assert.ok(finalized.extracted);
  assert.equal(finalized.extracted.reviewState, 'modified');
  assert.ok(finalized.extracted.reviewAdjustment.originalCharacters > 0);
  assert.ok(
    finalized.extracted.reviewAdjustment.reviewedCharacters
      > finalized.extracted.reviewAdjustment.originalCharacters,
  );
  assert.ok(finalized.extracted.reviewAdjustment.changedSpanCharacters > 0);
  assert.notEqual(finalized.extracted.file, originalFile);
  assert.equal(fs.existsSync(originalFile), false);
  assert.equal(
    digest(finalized.extracted.file),
    finalized.extracted.digest,
  );
  assert.match(
    finalized.extracted.markdown,
    /\| OP-02 \| 承認済み \| 人手修正 \|/u,
  );
  assert.match(
    finalized.extracted.markdown,
    /<!-- mmi:extracted-table .*candidate-sha256="[0-9a-f]{64}" -->$/u,
  );

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries[0].reviewState, 'modified');
  assert.equal(
    ledger.entries[0].outputDigest,
    finalized.extracted.digest,
  );
  assert.equal(
    ledger.entries[0].conversion.reviewMode,
    'modified-output-v1',
  );
});

test('unchanged reviewed table remains accepted and an abandoned draft is removable', () => {
  const f = workspace();
  const draft = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
  });
  assert.ok(draft.extracted);

  // Updating source bytes outside the detected table changes provenance but
  // must not turn an unchanged reviewed table body into a human modification.
  fs.appendFileSync(f.source, '\n');
  const finalized = finalizeReviewedTableExtraction({
    sourcePath: f.source,
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    extracted: draft.extracted,
    editedMarkdown: draft.extracted.markdown,
    fromDocument: f.doc,
  });
  assert.ok(finalized.extracted);
  assert.equal(finalized.extracted.reviewState, 'accepted');
  assert.equal(finalized.extracted.reviewAdjustment.changedSpanCharacters, 0);
  assert.equal(
    finalized.extracted.reviewAdjustment.originalCharacters,
    finalized.extracted.reviewAdjustment.reviewedCharacters,
  );
  assert.equal(
    readLedger(f.ledgerPath).entries[0].reviewState,
    'accepted',
  );

  const another = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: path.join(f.root, 'cancel-assets'),
    fromDocument: f.doc,
  });
  assert.ok(another.extracted);
  assert.equal(discardUnrecordedTableExtraction(another.extracted), true);
  assert.equal(fs.existsSync(another.extracted.file), false);
});

test('review-time table extraction accepts the unchanged displayed Candidate', () => {
  const f = workspace();
  const reviewed = buildCandidateReviewInventory(
    f.source,
    'roles.csv',
  ).items.find(
    (item) =>
      item.kind === 'table'
      && item.sheet === 'Sheet1'
      && item.range === 'A1:C3',
  );
  assert.ok(reviewed);
  assert.equal(reviewed.kind, 'table');
  if (reviewed.kind !== 'table') {
    assert.fail('expected table Candidate');
  }

  const result = extractTable({
    sourcePath: f.source,
    sheet: reviewed.sheet,
    range: reviewed.range,
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
    expectedCandidate: reviewed.candidate,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.equal(readLedger(f.ledgerPath).entries.length, 1);
});

test('review-time table extraction rejects source changes after Candidate display', () => {
  const f = workspace();
  const reviewed = buildCandidateReviewInventory(
    f.source,
    'roles.csv',
  ).items.find(
    (item) =>
      item.kind === 'table'
      && item.sheet === 'Sheet1'
      && item.range === 'A1:C3',
  );
  assert.ok(reviewed);
  assert.equal(reviewed.kind, 'table');
  if (reviewed.kind !== 'table') {
    assert.fail('expected table Candidate');
  }

  fs.writeFileSync(
    f.source,
    'ID,操作,備考\nOP-01,申請,a|b\nOP-02,差戻し,\n',
  );

  const result = extractTable({
    sourcePath: f.source,
    sheet: reviewed.sheet,
    range: reviewed.range,
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
    expectedCandidate: reviewed.candidate,
  });

  assert.equal(result.extracted, undefined);
  assert.equal(result.problems[0]?.code, 'MMI_TABLE_REVIEW_STALE');
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(fs.existsSync(f.ledgerPath), false);
});

test('reviewed table finalization rejects changed Claim basis with the same content fingerprint', () => {
  const f = workspace();
  const reviewed = buildCandidateReviewInventory(
    f.source,
    'roles.csv',
  ).items.find(
    (item) =>
      item.kind === 'table'
      && item.sheet === 'Sheet1'
      && item.range === 'A1:C3',
  );
  assert.ok(reviewed);
  assert.equal(reviewed.kind, 'table');
  if (reviewed.kind !== 'table') {
    assert.fail('expected table Candidate');
  }

  const draft = extractTable({
    sourcePath: f.source,
    sheet: reviewed.sheet,
    range: reviewed.range,
    outDir: f.outDir,
    fromDocument: f.doc,
    expectedCandidate: reviewed.candidate,
  });
  assert.ok(draft.extracted);

  const staleReviewed = {
    ...reviewed.candidate,
    claims: reviewed.candidate.claims.map((claim, index) =>
      index === 0
        ? { ...claim, reasonCode: claim.reasonCode + '-changed' }
        : claim),
  };

  const finalized = finalizeReviewedTableExtraction({
    sourcePath: f.source,
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    extracted: draft.extracted,
    editedMarkdown: draft.extracted.markdown,
    candidate: staleReviewed,
    fromDocument: f.doc,
  });

  assert.equal(finalized.extracted, undefined);
  assert.equal(finalized.problems[0]?.code, 'MMI_TABLE_REVIEW_STALE');
  assert.equal(fs.existsSync(f.ledgerPath), false);
});

test('extractTable rejects arbitrary ranges that are not current table Candidates', () => {
  const f = workspace();
  const result = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:B2',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });

  assert.equal(result.extracted, undefined);
  assert.equal(result.problems[0]?.code, 'MMI_TABLE_CANDIDATE_NOT_FOUND');
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(fs.existsSync(f.ledgerPath), false);
});

async function captureMain(argv: string[]): Promise<{ code: number; output: string }> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return { code: await main(argv), output: written.join('') };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('CLI table extraction joins the existing ledger and unimported Candidate workflow', async () => {
  const f = workspace();

  assert.equal((await captureMain(['extract', f.source, '--root', f.root])).code, 2);
  assert.equal(
    (await captureMain([
      'extract',
      f.source,
      '--image',
      'all',
      '--table',
      'A1:C3',
      '--sheet',
      'Sheet1',
      '--root',
      f.root,
    ])).code,
    2,
  );
  assert.equal(
    (await captureMain([
      'extract',
      f.source,
      '--table',
      'A1:C3',
      '--root',
      f.root,
    ])).code,
    2,
  );

  const extracted = await captureMain([
    'extract',
    f.source,
    '--table',
    'A1:C3',
    '--sheet',
    'Sheet1',
    '--out-dir',
    f.outDir,
    '--from',
    f.doc,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  const payload = JSON.parse(extracted.output);
  assert.equal(payload.extracted.sheet, 'Sheet1');
  assert.equal(payload.extracted.range, 'A1:C3');

  const unimported = await captureMain([
    'inspect',
    f.source,
    '--from',
    f.doc,
    '--root',
    f.root,
    '--unimported',
    '--json',
  ]);
  assert.equal(unimported.code, 0);
  const inspected = JSON.parse(unimported.output);
  assert.equal(
    inspected.candidates.some(
      (candidate: any) =>
        candidate.kind === 'table-range'
        && candidate.locator.sheet === 'Sheet1'
        && candidate.locator.range === 'A1:C3',
    ),
    false,
  );
});
