import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmbedDiagnostics } from '../src/dx/diagnostics.js';

const baseQuery = {
  raw: '![[fixtures/sample.xml#Sheet1|A1:B2]]',
  filepath: 'fixtures/sample.xml',
  target: 'Sheet1',
};

const fileRange = {
  start: baseQuery.raw.indexOf(baseQuery.filepath),
  end: baseQuery.raw.indexOf(baseQuery.filepath) + baseQuery.filepath.length - 1,
};

const targetRange = {
  start: baseQuery.raw.indexOf(baseQuery.target),
  end: baseQuery.raw.indexOf(baseQuery.target) + baseQuery.target.length - 1,
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

test('validateEmbedDiagnostics reports a missing file error on the filepath span', () => {
  assert.deepEqual(validateEmbedDiagnostics({ query: baseQuery, fileExists: false }), [
    {
      severity: 'error',
      code: 'MMI_FILE_NOT_FOUND',
      message: 'Embedded file not found: fixtures/sample.xml',
      range: fileRange,
      source: 'markdown-matrix-injector',
      priority: 0,
    },
  ]);
});

test('validateEmbedDiagnostics reports a missing sheet error on the target span', () => {
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
        range: targetRange,
        source: 'markdown-matrix-injector',
        priority: 2,
      },
    ],
  );
});

test('validateEmbedDiagnostics reports invalid xml on the filepath span', () => {
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
        range: fileRange,
        source: 'markdown-matrix-injector',
        priority: 1,
      },
    ],
  );
});

test('validateEmbedDiagnostics falls back to the caller-supplied range when it cannot isolate a subject span', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: {
        raw: '![[display-name]]',
        filepath: 'fixtures/missing.xml',
        target: 'SheetX',
      },
      fileExists: false,
      sheetExists: false,
      range: { start: 10, end: 24 },
    }),
    [
      {
        severity: 'error',
        code: 'MMI_FILE_NOT_FOUND',
        message: 'Embedded file not found: fixtures/missing.xml',
        range: { start: 10, end: 24 },
        source: 'markdown-matrix-injector',
        priority: 0,
      },
      {
        severity: 'error',
        code: 'MMI_SHEET_NOT_FOUND',
        message: 'Sheet not found: SheetX',
        range: { start: 10, end: 24 },
        source: 'markdown-matrix-injector',
        priority: 2,
      },
    ],
  );
});

test('validateEmbedDiagnostics keeps root-cause priority stable when multiple errors are supplied', () => {
  const diagnostics = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: false,
    sheetExists: false,
    xmlMode: 'invalid',
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND'],
  );
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.priority),
    [0, 1, 2],
  );
});
