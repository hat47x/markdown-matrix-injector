import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmbedDiagnostics } from '../src/dx/diagnostics.js';

const baseQuery = {
  raw: '![[fixtures/sample.xml#Sheet1|A1:B2]]',
  filepath: 'fixtures/sample.xml',
  target: 'Sheet1',
};

test('validateEmbedDiagnostics returns an empty array when no problems are detected', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: baseQuery,
      fileExists: true,
      sheetExists: true,
      xmlMode: 'spreadsheet2003',
    }),
    [],
  );
});

test('validateEmbedDiagnostics reports a missing file error', () => {
  assert.deepEqual(validateEmbedDiagnostics({ query: baseQuery, fileExists: false }), [
    {
      severity: 'error',
      code: 'MMI_FILE_NOT_FOUND',
      message: 'Embedded file not found: fixtures/sample.xml',
      range: { start: 0, end: baseQuery.raw.length - 1 },
    },
  ]);
});

test('validateEmbedDiagnostics reports a missing sheet error when the target is unresolved', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: baseQuery,
      fileExists: true,
      sheetExists: false,
      xmlMode: 'spreadsheet2003',
    }),
    [
      {
        severity: 'error',
        code: 'MMI_SHEET_NOT_FOUND',
        message: 'Sheet not found: Sheet1',
        range: { start: 0, end: baseQuery.raw.length - 1 },
      },
    ],
  );
});

test('validateEmbedDiagnostics reports invalid xml when the signature is not Spreadsheet 2003', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: baseQuery,
      fileExists: true,
      sheetExists: true,
      xmlMode: 'invalid',
    }),
    [
      {
        severity: 'error',
        code: 'MMI_INVALID_XML',
        message: 'Invalid XML Spreadsheet: only Spreadsheet 2003 XML is supported.',
        range: { start: 0, end: baseQuery.raw.length - 1 },
      },
    ],
  );
});

test('validateEmbedDiagnostics keeps root-cause priority stable when multiple errors are supplied', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: baseQuery,
      fileExists: false,
      sheetExists: false,
      xmlMode: 'invalid',
    }).map((diagnostic) => diagnostic.code),
    ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND'],
  );
});
