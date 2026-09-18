import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  parseXlsxFormatSnapshot,
  readXlsxFormatSnapshot,
  type SheetJsWorkbookReader,
} from '../src/experimental/xlsxFormatSnapshotReader.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  type WorksheetFormatSourceProfile,
} from '../src/experimental/worksheetFormatPrototype.js';
import {
  countWorksheetFormatDifferentFamilies,
} from '../src/experimental/worksheetFormatMultiFamilyDriftEvaluation.js';

const REAL_RUNTIME_STRUCTURE_ONLY_PROFILE: WorksheetFormatSourceProfile = {
  id: 'real-xlsx-structure-only-v1',
  evidence: ['structure'],
};

function workbookBytes(
  worksheets: readonly { name: string; worksheet: ReturnType<typeof XLSX.utils.aoa_to_sheet> }[],
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const { name, worksheet } of worksheets) {
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  const output = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
    cellStyles: true,
  });
  return output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);
}

function parseRealWorkbook(
  worksheet: ReturnType<typeof XLSX.utils.aoa_to_sheet>,
  sheetName = 'Sheet1',
): WorksheetFormatSnapshot {
  const bytes = workbookBytes([{ name: sheetName, worksheet }]);
  return parseXlsxFormatSnapshot(
    bytes,
    sheetName,
    XLSX as unknown as SheetJsWorkbookReader,
  ).snapshot;
}

test('real SheetJS 0.20.3 XLSX roundtrip preserves merge ranges while covered and blank cells remain absent', () => {
  assert.equal(XLSX.version, '0.20.3');

  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Release table', undefined, undefined],
    ['ID', 'State', 'Note'],
    ['R-001', undefined, 'memo'],
  ]);
  worksheet['!merges'] = [XLSX.utils.decode_range('A1:C1')];

  const snapshot = parseRealWorkbook(worksheet);

  assert.deepEqual(snapshot.merges, [{
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 2,
  }]);

  assert.deepEqual(
    snapshot.cells
      .filter((cell) => cell.row === 0)
      .map((cell) => [cell.row, cell.column, cell.text]),
    [[0, 0, 'Release table']],
  );
  assert.equal(
    snapshot.cells.some((cell) => cell.row === 2 && cell.column === 1),
    false,
  );

  const observation = extractWorksheetFormatFeatures(snapshot);
  assert.ok(observation.features.includes('layout:first-body-coverage:partial'));
  assert.ok(observation.features.includes('layout:body-majority-occupancy:101'));
});

test('real XLSX metadata preamble does not hide a gapped header or relative title/body structure', () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['document: release-spec'],
    ['owner: platform-team'],
    [undefined, 'Gapped table', undefined, undefined, undefined, undefined],
    [undefined, 'ID', 'Name', undefined, 'State', 'Note'],
    [undefined, '1', 'alpha', undefined, 'open', 'memo'],
  ]);
  worksheet['!merges'] = [XLSX.utils.decode_range('B3:F3')];

  const snapshot = parseRealWorkbook(worksheet);
  const observation = extractWorksheetFormatFeatures(snapshot);

  assert.equal(observation.headerRow, 3);
  assert.deepEqual(observation.headerColumns, [1, 2, 4, 5]);
  assert.ok(observation.features.includes('region:title-row'));
  assert.ok(observation.features.includes('layout:title-span:5'));
  assert.ok(observation.features.includes('layout:title-header-gap:0'));
  assert.ok(observation.features.includes('layout:5-columns'));
  assert.ok(observation.features.includes('layout:header-gapped'));
  assert.ok(observation.features.includes('layout:first-body-gap:0'));
  assert.ok(observation.features.includes('layout:first-body-coverage:full'));
  assert.ok(observation.features.includes('layout:body-majority-occupancy:1111'));
});

test('real XLSX title-less table does not invent title evidence', () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['ID', 'Name', 'State', 'Note'],
    ['1', 'alpha', 'open', 'memo'],
    ['2', 'beta', 'closed', 'memo'],
  ]);

  const snapshot = parseRealWorkbook(worksheet);
  const observation = extractWorksheetFormatFeatures(snapshot);

  assert.equal(observation.headerRow, 0);
  assert.equal(observation.features.includes('region:title-row'), false);
  assert.equal(
    observation.features.some((feature) => feature.startsWith('layout:title-')),
    false,
  );
  assert.ok(observation.features.includes('layout:4-columns'));
  assert.ok(observation.features.includes('layout:body-majority-occupancy:1111'));
});

test('real file reader selects requested worksheet and leaves valid XLSX bytes unchanged', () => {
  const release = XLSX.utils.aoa_to_sheet([
    ['Release table', undefined],
    ['ID', 'State'],
    ['R-001', 'ready'],
  ]);
  release['!merges'] = [XLSX.utils.decode_range('A1:B1')];
  const other = XLSX.utils.aoa_to_sheet([['other']]);
  const bytes = workbookBytes([
    { name: 'Release', worksheet: release },
    { name: 'Other', worksheet: other },
  ]);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-real-xlsx-'));
  const absolutePath = path.join(directory, 'runtime-fixture.xlsx');

  try {
    fs.writeFileSync(absolutePath, bytes);
    const before = fs.readFileSync(absolutePath);

    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'Release',
    });

    assert.equal(result.sheetName, 'Release');
    assert.deepEqual(result.snapshot.merges, [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }]);
    assert.equal(
      result.snapshot.cells.find((cell) => cell.row === 2 && cell.column === 1)?.text,
      'ready',
    );
    assert.deepEqual(fs.readFileSync(absolutePath), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime-generated XLSX does not strengthen the fill contract beyond what the reader actually returns', () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Table', undefined],
    ['ID', 'State'],
    ['1', 'open'],
  ]);
  worksheet['!merges'] = [XLSX.utils.decode_range('A1:B1')];

  const headerCell = worksheet.A2 as ({ s?: unknown } | undefined);
  if (headerCell) {
    headerCell.s = {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FF202020' },
        bgColor: { rgb: 'FF202020' },
      },
    };
  }

  const snapshot = parseRealWorkbook(worksheet);
  const fillTone = snapshot.cells.find(
    (cell) => cell.row === 1 && cell.column === 0,
  )?.fillTone;

  assert.ok(
    fillTone === undefined || fillTone === 'dark',
    `unexpected runtime fill classification: ${String(fillTone)}`,
  );
});


test('real XLSX snapshots preserve multi-family drift through prototype and matcher boundaries', () => {
  const baselineWorksheet = XLSX.utils.aoa_to_sheet([
    ['Baseline', undefined, undefined, undefined, undefined, undefined, undefined],
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer', 'Note'],
    ['1', 'alpha', 'string', 'yes', 'ready', 'A', 'memo'],
    ['2', 'beta', 'string', 'no', 'ready', 'B', 'memo'],
    ['3', 'gamma', 'number', 'yes', 'ready', 'C', 'memo'],
  ]);
  baselineWorksheet['!merges'] = [XLSX.utils.decode_range('A1:G1')];

  const observationWorksheet = XLSX.utils.aoa_to_sheet([
    ['Baseline', undefined, undefined, undefined, undefined, undefined, undefined],
    ['ID', 'Item', 'Type', 'Required', 'State', 'Reviewer', 'Note'],
    [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    ['1', 'alpha', 'string', 'yes', 'ready', 'A', 'memo'],
    ['2', 'beta', 'string', 'no', 'ready', 'B', 'memo'],
    ['3', 'gamma', 'number', 'yes', 'ready', 'C', 'memo'],
  ]);
  observationWorksheet['!merges'] = [XLSX.utils.decode_range('A1:G1')];

  const baselineSnapshot = parseRealWorkbook(baselineWorksheet);
  const observationSnapshot = parseRealWorkbook(observationWorksheet);
  const prototype = createWorksheetFormatPrototype(
    'baseline',
    baselineSnapshot,
    REAL_RUNTIME_STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    observationSnapshot,
    [prototype],
    REAL_RUNTIME_STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'baseline');
  assert.ok(result.comparedFeatures.includes('layout:first-body-gap:1'));
  assert.equal(
    countWorksheetFormatDifferentFamilies(
      result.comparedFeatures,
      prototype.features,
    ),
    3,
  );
});
