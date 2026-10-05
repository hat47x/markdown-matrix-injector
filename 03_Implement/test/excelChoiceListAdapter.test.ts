import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inlineChoiceValues,
  readExcelChoiceLists,
} from '../src/adapters/excelChoiceListAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { buildXlsxWithImages } from './helpers/buildXlsxWithImages.js';

const digest = 'sha256:' + 'c'.repeat(64);

function workbook(extraWorksheetXml: string): Buffer {
  return buildXlsxWithImages(
    [{
      name: 'Form',
      cells: [
        [0, 0, 'Status'],
        [1, 0, 'Open'],
      ],
      extraWorksheetXml,
    }],
    {},
  );
}

test('inline Excel data validation lists become observed M0 choice-list Candidates', () => {
  const bytes = workbook([
    '<dataValidations count="1">',
    '<dataValidation type="list" allowBlank="1" sqref="A2 A4:A5">',
    '<formula1>&quot;Open,Closed,Pending&quot;</formula1>',
    '</dataValidation>',
    '</dataValidations>',
  ].join(''));

  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.lists.length, 2);
  assert.deepEqual(
    result.lists.map((item) => ({
      sheet: item.sheet,
      range: item.range,
      sourceKind: item.sourceKind,
      choices: item.choices,
      status: item.candidate.status,
      method: item.candidate.method,
      execution: item.candidate.execution,
    })),
    [
      {
        sheet: 'Form',
        range: 'A2',
        sourceKind: 'inline',
        choices: ['Open', 'Closed', 'Pending'],
        status: 'observed',
        method: 'M0',
        execution: 'deterministic',
      },
      {
        sheet: 'Form',
        range: 'A4:A5',
        sourceKind: 'inline',
        choices: ['Open', 'Closed', 'Pending'],
        status: 'observed',
        method: 'M0',
        execution: 'deterministic',
      },
    ],
  );
  assert.equal(
    result.lists[0].candidate.fingerprint.digest,
    result.lists[1].candidate.fingerprint.digest,
  );
  assert.equal(
    candidateProblem(result.lists[0].candidate),
    undefined,
  );
  assert.equal(
    result.lists[0].candidate.claims.find(
      (claim) => claim.aspect === 'choices',
    )?.status,
    'observed',
  );
});

test('formula-backed validation is observed without pretending referenced values were read', () => {
  const bytes = workbook([
    '<dataValidations count="1">',
    '<dataValidation type="list" sqref="B2:B9">',
    '<formula1>Lists!$A$1:$A$3</formula1>',
    '</dataValidation>',
    '</dataValidations>',
  ].join(''));

  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
  );
  assert.equal(result.lists.length, 1);
  const item = result.lists[0];
  assert.equal(item.sourceKind, 'formula');
  assert.equal(item.choices, undefined);
  assert.equal(item.candidate.status, 'observed');
  assert.equal(
    item.candidate.claims.find(
      (claim) => claim.aspect === 'validation-source',
    )?.value,
    'Lists!$A$1:$A$3',
  );
  const choices = item.candidate.claims.find(
    (claim) => claim.aspect === 'choices',
  );
  assert.equal(choices?.status, 'abstained');
  assert.equal(choices?.value, undefined);
});

test('Office x14 data validation extension is read without evaluating its formula', () => {
  const bytes = workbook([
    '<extLst><ext uri="{CCE6A557-97BC-4B89-ADB6-D9C93CAAB3DF}"',
    ' xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"',
    ' xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">',
    '<x14:dataValidations count="1">',
    '<x14:dataValidation type="list" allowBlank="true">',
    '<x14:formula1><xm:f>Form!$D$2:$D$4</xm:f></x14:formula1>',
    '<xm:sqref>C2:C4</xm:sqref>',
    '</x14:dataValidation>',
    '</x14:dataValidations></ext></extLst>',
  ].join(''));

  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
  );
  assert.equal(result.lists.length, 1);
  assert.equal(result.lists[0].range, 'C2:C4');
  assert.equal(result.lists[0].sourceKind, 'formula');
  assert.equal(result.lists[0].formula1, 'Form!$D$2:$D$4');
});

test('inline list formula parser preserves author text and Excel doubled quotes', () => {
  assert.deepEqual(
    inlineChoiceValues('"Open,Needs review,He said ""yes"""'),
    ['Open', 'Needs review', 'He said "yes"'],
  );
  assert.equal(
    inlineChoiceValues('=$A$1:$A$3'),
    undefined,
  );
});

test('malformed list validation is surfaced rather than silently invented', () => {
  const bytes = workbook(
    '<dataValidations count="1"><dataValidation type="list" sqref="D2"/></dataValidations>',
  );
  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
  );

  assert.equal(result.lists.length, 1);
  assert.equal(result.lists[0].sourceKind, 'missing');
  assert.equal(
    result.diagnostics.some(
      (item) => item.code === 'MMI_CHOICE_LIST_FORMULA_MISSING',
    ),
    true,
  );
  assert.equal(
    result.lists[0].candidate.claims.find(
      (claim) => claim.aspect === 'choices',
    )?.status,
    'abstained',
  );
});
