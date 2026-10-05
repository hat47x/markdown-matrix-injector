import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectSource } from '../src/cli/mmi.js';
import { buildXlsxWithImages } from './helpers/buildXlsxWithImages.js';

test('inspect exposes inline and formula-backed Excel choice-list Candidates', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-choice-inspect-'),
  );
  const source = path.join(root, 'form.xlsx');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{
        name: 'Form',
        cells: [[0, 0, 'Status']],
        extraWorksheetXml: [
          '<dataValidations count="2">',
          '<dataValidation type="list" sqref="A2">',
          '<formula1>&quot;Open,Closed&quot;</formula1>',
          '</dataValidation>',
          '<dataValidation type="list" sqref="B2:B5">',
          '<formula1>Lists!$A$1:$A$3</formula1>',
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      }],
      {},
    ),
  );

  const result = inspectSource(source, 0);
  assert.equal(result.choiceLists.length, 2);
  assert.equal(
    result.candidates.filter(
      (candidate) => candidate.kind === 'choice-list',
    ).length,
    2,
  );
  assert.deepEqual(
    result.choiceLists[0].choices,
    ['Open', 'Closed'],
  );
  assert.equal(result.choiceLists[0].range, 'A2');
  assert.equal(result.choiceLists[1].range, 'B2:B5');
  assert.equal(result.choiceLists[1].sourceKind, 'formula');
  assert.equal(result.choiceLists[1].choices, undefined);
  assert.equal(
    result.choiceLists[1].formula1,
    'Lists!$A$1:$A$3',
  );
});


test('inspect resolves direct range-backed choice lists from the same workbook snapshot', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-choice-range-inspect-'),
  );
  const source = path.join(root, 'form.xlsx');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [
        {
          name: '申請',
          cells: [[0, 0, '担当']],
          extraWorksheetXml: [
            '<dataValidations count="1">',
            '<dataValidation type="list" sqref="A2:A20">',
            '<formula1>&apos;担当者 一覧&apos;!$A$1:$A$3</formula1>',
            '</dataValidation>',
            '</dataValidations>',
          ].join(''),
        },
        {
          name: '担当者 一覧',
          cells: [
            [0, 0, '佐藤'],
            [1, 0, '鈴木'],
            [2, 0, '田中'],
          ],
        },
      ],
      {},
    ),
  );

  const result = inspectSource(source, 0);
  assert.equal(result.choiceLists.length, 1);
  assert.deepEqual(result.choiceLists[0], {
    ordinal: 1,
    sheet: '申請',
    range: 'A2:A20',
    sourceKind: 'range',
    formula1: "'担当者 一覧'!$A$1:$A$3",
    choices: ['佐藤', '鈴木', '田中'],
    resolvedSource: {
      sheet: '担当者 一覧',
      range: 'A1:A3',
    },
    allowBlank: false,
  });
  const candidate = result.candidates.find(
    (item) => item.kind === 'choice-list',
  );
  assert.ok(candidate);
  assert.equal(
    candidate.claims.find(
      (claim) => claim.aspect === 'choices',
    )?.status,
    'observed',
  );
});
