import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCandidateReviewInventory } from '../src/application/candidateReviewInventory.js';
import { imageCandidates, type ExcelImage } from '../src/adapters/excelImageAdapter.js';
import { candidateLedgerView } from '../src/core/candidateLedgerView.js';
import { emptyLedger, entryFor } from '../src/core/importLedger.js';
import { buildXlsxWithImages, screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

const sourcePath = path.resolve('/workspace/design.xlsx');
const ledgerPath = path.resolve('/workspace/mmi-ledger.json');
const sourceDigest = 'sha256:' + '1'.repeat(64);
function image(ordinal: number, sheet: string, range: string, digestChar: string): ExcelImage {
  return { ordinal, sheet, name: `Picture ${ordinal}`, anchor: { kind: 'twoCellAnchor', from: { row: 0, col: 0 }, to: { row: 1, col: 1 } }, range, mediaPart: `xl/media/image${ordinal}.png`, format: 'png', bytes: 4, digest: 'sha256:' + digestChar.repeat(64), extractable: true };
}
test('candidate review attention view exposes changed and unimported images', () => {
  const first = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(1, 'Sheet1', 'A1:B2', 'a')] })[0];
  const changed = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(1, 'Sheet1', 'A1:B2', 'b')] })[0];
  const fresh = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(2, 'Sheet2', 'C3:D4', 'c')] })[0];
  const ledger = emptyLedger();
  ledger.entries.push(entryFor(ledgerPath, sourcePath, first, '/workspace/assets/first.png', 'mmi extract'));
  const view = candidateLedgerView([changed, fresh], ledger, ledgerPath, sourcePath, 'exclude-imported');
  assert.deepEqual(view.map((item) => item.ledgerState), ['changed', 'unimported']);
  assert.equal(view[0].candidate.status, 'observed');
  assert.equal(view[0].candidate.execution, 'deterministic');
  assert.deepEqual(view[0].researchScores, []);
});


test('review inventory unifies table and image Candidates from one workbook', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-inventory-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const inventory = buildCandidateReviewInventory(source, 'design.xlsx');
  const kinds = inventory.items.map((item) => item.kind);

  assert.ok(kinds.includes('table'));
  assert.ok(kinds.includes('image'));
  assert.ok(
    inventory.items.some(
      (item) =>
        item.kind === 'table'
        && item.sheet === '画面一覧'
        && item.range === 'A1:B3',
    ),
  );
  assert.ok(
    inventory.items.some(
      (item) =>
        item.kind === 'image'
        && item.image.sheet === '画面一覧'
        && item.image.range === 'D1:F4',
    ),
  );
  assert.equal(
    inventory.items.every(
      (item) =>
        item.candidate.locator.source === 'design.xlsx'
        && item.candidate.execution === 'deterministic',
    ),
    true,
  );
});

test('review inventory keeps CSV table Candidates available without an image path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-csv-'));
  const source = path.join(root, 'roles.csv');
  fs.writeFileSync(source, 'ID,Role\n1,Admin\n2,Reviewer\n');

  const inventory = buildCandidateReviewInventory(source, 'roles.csv');

  assert.deepEqual(inventory.imageDiagnostics, []);
  assert.equal(inventory.items.some((item) => item.kind === 'image'), false);
  assert.equal(inventory.items.some((item) => item.kind === 'table'), true);
});


test('review inventory includes explicit Excel choice-list Candidates without inventing formula values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-choice-list-'));
  const source = path.join(root, 'form.xlsx');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{
        name: 'Form',
        cells: [
          [0, 0, '状態'],
          [0, 1, '担当'],
        ],
        extraWorksheetXml: [
          '<dataValidations count="2">',
          '<dataValidation type="list" allowBlank="1" sqref="A2">',
          '<formula1>&quot;未着手,対応中,完了&quot;</formula1>',
          '</dataValidation>',
          '<dataValidation type="list" sqref="B2:B9">',
          '<formula1>Lists!$A$1:$A$3</formula1>',
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      }],
      {},
    ),
  );

  const inventory = buildCandidateReviewInventory(source, 'form.xlsx');
  const choices = inventory.items.filter(
    (item) => item.kind === 'choice-list',
  );

  assert.equal(choices.length, 2);
  assert.deepEqual(inventory.choiceListDiagnostics, []);
  assert.equal(choices[0].kind, 'choice-list');
  if (choices[0].kind !== 'choice-list' || choices[1].kind !== 'choice-list') {
    assert.fail('expected choice-list inventory items');
  }
  assert.equal(choices[0].choiceList.range, 'A2');
  assert.deepEqual(choices[0].choiceList.choices, ['未着手', '対応中', '完了']);
  assert.equal(choices[0].choiceList.allowBlank, true);
  assert.equal(choices[1].choiceList.range, 'B2:B9');
  assert.equal(choices[1].choiceList.sourceKind, 'formula');
  assert.equal(choices[1].choiceList.formula1, 'Lists!$A$1:$A$3');
  assert.equal(choices[1].choiceList.choices, undefined);
  assert.ok(choices.every((item) => item.candidate.kind === 'choice-list'));
  assert.ok(choices.every((item) => item.candidate.status === 'observed'));
});
