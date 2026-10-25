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


test('validateEmbedDiagnostics reports an oversized explicit mode=table range with a stable code', () => {
  const raw = '![[fixtures/sample.xml#Sheet1|A1:A100001?mode=table]]';
  const range = 'A1:A100001';
  const diagnostics = validateEmbedDiagnostics({
    query: {
      raw,
      filepath: 'fixtures/sample.xml',
      target: 'Sheet1',
      range,
      mode: 'table',
    },
    fileExists: true,
    sheetExists: true,
    xmlMode: 'spreadsheet2003',
  });

  assert.deepEqual(diagnostics, [
    {
      severity: 'error',
      code: 'MMI_TABLE_TOO_LARGE',
      message:
        'Reference too large to render as a table (100001 cells exceeds the 100000-cell limit). mode=table does not lift this limit -- narrow the range or split the reference.',
      range: {
        start: raw.indexOf(range),
        end: raw.indexOf(range) + range.length - 1,
      },
      source: 'markdown-matrix-injector',
      priority: 3,
    },
  ]);
});

test('validateEmbedDiagnostics accepts the explicit mode=table hard-limit boundary', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: {
        raw: '![[fixtures/sample.xml#Sheet1|A1:A100000?mode=table]]',
        filepath: 'fixtures/sample.xml',
        target: 'Sheet1',
        range: 'A1:A100000',
        mode: 'table',
      },
      fileExists: true,
      sheetExists: true,
      xmlMode: 'spreadsheet2003',
    }),
    [],
  );
});

test('validateEmbedDiagnostics does not apply the forced-table hard limit when mode is not table', () => {
  assert.deepEqual(
    validateEmbedDiagnostics({
      query: {
        raw: '![[fixtures/sample.xml#Sheet1|A1:A100001]]',
        filepath: 'fixtures/sample.xml',
        target: 'Sheet1',
        range: 'A1:A100001',
      },
      fileExists: true,
      sheetExists: true,
      xmlMode: 'spreadsheet2003',
    }),
    [],
  );
});

test('validateEmbedDiagnostics suppresses table-size noise behind earlier root causes', () => {
  const query = {
    raw: '![[fixtures/sample.xml#Sheet1|A1:A100001?mode=table]]',
    filepath: 'fixtures/sample.xml',
    target: 'Sheet1',
    range: 'A1:A100001',
    mode: 'table',
  };

  assert.deepEqual(
    validateEmbedDiagnostics({ query, fileExists: true, sheetExists: true, containmentOk: false }),
    [
      {
        severity: 'error',
        code: 'MMI_PATH_OUTSIDE_BOUNDARY',
        message: 'Source file is outside workspace boundary: fixtures/sample.xml',
        range: {
          start: query.raw.indexOf(query.filepath),
          end: query.raw.indexOf(query.filepath) + query.filepath.length - 1,
        },
        source: 'markdown-matrix-injector',
        priority: 0,
      },
    ],
  );

  assert.deepEqual(
    validateEmbedDiagnostics({ query, fileExists: true, sheetExists: true, xmlMode: 'invalid' }).map((d) => d.code),
    ['MMI_INVALID_XML'],
  );
  assert.deepEqual(
    validateEmbedDiagnostics({ query, fileExists: true, sheetExists: false }).map((d) => d.code),
    ['MMI_SHEET_NOT_FOUND'],
  );
});

// ── Containment diagnostics (spec P4 Containment MUST) ──────────────────

test('validateEmbedDiagnostics reports boundary violation when containmentOk is explicitly false', () => {
  const diags = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: true,
    sheetExists: true,
    xmlMode: 'spreadsheet2003',
    containmentOk: false,
  });

  assert.deepEqual(
    diags.map((d) => d.code),
    ['MMI_PATH_OUTSIDE_BOUNDARY'],
  );
  assert.match(diags[0].message, /outside workspace boundary/);
  assert.equal(diags[0].priority, 0);
});

test('validateEmbedDiagnostics does NOT report boundary violation when containmentOk is true', () => {
  const diags = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: true,
    sheetExists: true,
    xmlMode: 'spreadsheet2003',
    containmentOk: true,
  });

  assert.deepEqual(diags, []);
});

test('validateEmbedDiagnostics reports containment, not missing file, when the reference is outside the boundary', () => {
  const diags = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: false,
    containmentOk: false,
  });

  assert.deepEqual(
    diags.map((d) => d.code),
    ['MMI_PATH_OUTSIDE_BOUNDARY'],
  );
});

test('validateEmbedDiagnostics does NOT report boundary violation when containmentOk is undefined (backward compat)', () => {
  const diags = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: true,
    sheetExists: true,
    xmlMode: 'spreadsheet2003',
    // containmentOk not set
  });

  assert.deepEqual(diags, []);
});
