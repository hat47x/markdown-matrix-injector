import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHOICE_LIST_MAX_REFERENCED_CELLS,
  directChoiceRangeReference,
  inlineChoiceValues,
  readExcelChoiceLists,
} from '../src/adapters/excelChoiceListAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { loadWorkbookFromBytes } from '../src/core/workbookLoader.js';
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


test('direct same-workbook ranges expose saved display values as observed choices', () => {
  const bytes = buildXlsxWithImages(
    [
      {
        name: 'Form',
        cells: [[0, 0, 'Status']],
        extraWorksheetXml: [
          '<dataValidations count="1">',
          '<dataValidation type="list" sqref="A2:A20">',
          '<formula1>Lists!$A$1:$A$3</formula1>',
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      },
      {
        name: 'Lists',
        cells: [
          [0, 0, 'Open'],
          [1, 0, 'Closed'],
          [2, 0, 'Pending'],
        ],
      },
    ],
    {},
  );
  const workbook = loadWorkbookFromBytes('form.xlsx', bytes);
  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
    workbook,
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.lists.length, 1);
  assert.equal(result.lists[0].sourceKind, 'range');
  assert.deepEqual(result.lists[0].choices, [
    'Open',
    'Closed',
    'Pending',
  ]);
  assert.deepEqual(result.lists[0].resolvedSource, {
    sheet: 'Lists',
    range: 'A1:A3',
  });
  assert.equal(
    result.lists[0].candidate.claims.find(
      (claim) => claim.aspect === 'choices',
    )?.reasonCode,
    'data-validation-range-values',
  );
  assert.equal(
    result.lists[0].candidate.claims.find(
      (claim) => claim.aspect === 'choice-source-location',
    )?.value,
    'Lists!A1:A3',
  );
  assert.equal(
    result.lists[0].candidate.provenance.run.execution,
    'deterministic',
  );
  if (result.lists[0].candidate.provenance.run.execution === 'deterministic') {
    assert.equal(
      result.lists[0].candidate.provenance.run.config.rangeResolverVersion,
      '1',
    );
  }
});

test('quoted and same-sheet A1 references are parsed without formula evaluation', () => {
  assert.deepEqual(
    directChoiceRangeReference("'List Data'!$B$2:$B$4", 'Form'),
    { sheet: 'List Data', range: 'B2:B4' },
  );
  assert.deepEqual(
    directChoiceRangeReference("'O''Brien'!$A$1", 'Form'),
    { sheet: "O'Brien", range: 'A1' },
  );
  assert.deepEqual(
    directChoiceRangeReference('=$D$2:$D$5', 'Form'),
    { sheet: 'Form', range: 'D2:D5' },
  );
});

test('unsafe or non-direct formulas stay unresolved instead of being evaluated', () => {
  for (const formula of [
    '[other.xlsx]Lists!$A$1:$A$3',
    'INDIRECT("Lists!A1:A3")',
    'MyNamedRange',
    'Lists!$A:$A',
  ]) {
    assert.equal(
      directChoiceRangeReference(formula, 'Form'),
      undefined,
      formula,
    );
  }

  const tooLarge = 'Lists!$A$1:$A$' +
    String(CHOICE_LIST_MAX_REFERENCED_CELLS + 1);
  const twoDimensional = 'Lists!$A$1:$B$2';
  const bytes = buildXlsxWithImages(
    [
      {
        name: 'Form',
        cells: [[0, 0, 'Status']],
        extraWorksheetXml: [
          '<dataValidations count="2">',
          '<dataValidation type="list" sqref="A2">',
          `<formula1>${tooLarge}</formula1>`,
          '</dataValidation>',
          '<dataValidation type="list" sqref="B2">',
          `<formula1>${twoDimensional}</formula1>`,
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      },
      {
        name: 'Lists',
        cells: [[0, 0, 'Open']],
      },
    ],
    {},
  );
  const workbook = loadWorkbookFromBytes('form.xlsx', bytes);
  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
    workbook,
  );

  assert.deepEqual(
    result.lists.map((item) => [item.sourceKind, item.choices]),
    [
      ['formula', undefined],
      ['formula', undefined],
    ],
  );
  assert.ok(
    result.lists.every((item) =>
      item.candidate.claims.find(
        (claim) => claim.aspect === 'choices',
      )?.status === 'abstained'),
  );
});

test('out-of-worksheet direct ranges remain unresolved instead of inventing blank choices', () => {
  const bytes = buildXlsxWithImages(
    [
      {
        name: 'Form',
        cells: [[0, 0, 'Status']],
        extraWorksheetXml: [
          '<dataValidations count="2">',
          '<dataValidation type="list" sqref="A2">',
          '<formula1>Lists!$XFE$1</formula1>',
          '</dataValidation>',
          '<dataValidation type="list" sqref="B2">',
          '<formula1>Lists!$A$1048577</formula1>',
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      },
      {
        name: 'Lists',
        cells: [[0, 0, 'Open']],
      },
    ],
    {},
  );
  const workbook = loadWorkbookFromBytes('form.xlsx', bytes);
  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
    workbook,
  );

  assert.deepEqual(
    result.lists.map((item) => [item.sourceKind, item.choices]),
    [
      ['formula', undefined],
      ['formula', undefined],
    ],
  );
  assert.ok(
    result.lists.every((item) =>
      item.candidate.claims.find(
        (claim) => claim.aspect === 'choices',
      )?.status === 'abstained'),
  );
});

test('existing inline list provenance stays on adapter v1', () => {
  const bytes = workbook([
    '<dataValidations count="1">',
    '<dataValidation type="list" sqref="A2">',
    '<formula1>&quot;Open,Closed&quot;</formula1>',
    '</dataValidation>',
    '</dataValidations>',
  ].join(''));
  const result = readExcelChoiceLists(
    bytes,
    './form.xlsx',
    digest,
    loadWorkbookFromBytes('form.xlsx', bytes),
  );
  const run = result.lists[0].candidate.provenance.run;
  assert.equal(run.execution, 'deterministic');
  if (run.execution === 'deterministic') {
    assert.equal(run.implementationVersion, '1');
    assert.equal(run.config.sourceKind, 'inline');
    assert.equal('rangeResolverVersion' in run.config, false);
  }
});
