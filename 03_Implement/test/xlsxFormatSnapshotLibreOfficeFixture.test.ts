import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readXlsxFormatSnapshot,
} from '../src/experimental/xlsxFormatSnapshotReader.js';
import {
  extractWorksheetFormatFeatures,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

const FIXTURE_SHA256 =
  'ac561a7f5ca19aeb642fe288a897e036081811274ffd109938215e49e94393e1';

function externalFixtureBytes(): Buffer {
  const fixturePath = fileURLToPath(new URL(
    './fixtures/libreoffice-rgb-format-boundary.xlsx.base64',
    import.meta.url,
  ));
  const encoded = fs.readFileSync(fixturePath, 'utf8').replace(/\s+/gu, '');
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    FIXTURE_SHA256,
  );
  return bytes;
}

function withExternalFixture<T>(run: (absolutePath: string) => T): T {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-external-xlsx-'));
  const absolutePath = path.join(directory, 'libreoffice-rgb-format-boundary.xlsx');
  try {
    fs.writeFileSync(absolutePath, externalFixtureBytes());
    return run(absolutePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('LibreOffice-generated RGB fill is retained as directly classifiable fill evidence', () => {
  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'RGB Fill',
    });

    assert.deepEqual(result.snapshot.merges, [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 3,
    }]);

    for (let column = 0; column < 4; column += 1) {
      assert.equal(
        result.snapshot.cells.find(
          (cell) => cell.row === 1 && cell.column === column,
        )?.fillTone,
        'dark',
      );
    }

    assert.equal(
      result.snapshot.cells.some(
        (cell) => cell.row === 2 && cell.column === 2,
      ),
      false,
    );

    const observation = extractWorksheetFormatFeatures(result.snapshot);
    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:dark-fill'));
    assert.ok(observation.features.includes('layout:first-body-coverage:partial'));
    assert.ok(observation.features.includes('layout:body-majority-occupancy:1101'));

    const prototype = createWorksheetFormatPrototype(
      'libreoffice-rgb',
      result.snapshot,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );
    assert.ok(prototype.features.includes('header:fill-present'));
    assert.ok(prototype.features.includes('header:dark-fill'));
  });
});

test('LibreOffice-generated metadata preamble and gapped header preserve relative structure and RGB fill', () => {
  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'Metadata Gapped',
    });
    const observation = extractWorksheetFormatFeatures(result.snapshot);

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
    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:dark-fill'));
  });
});

test('LibreOffice-generated title-less table does not gain title evidence', () => {
  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'No Title',
    });
    const observation = extractWorksheetFormatFeatures(result.snapshot);

    assert.equal(observation.headerRow, 0);
    assert.equal(observation.features.includes('region:title-row'), false);
    assert.equal(
      observation.features.some((feature) => feature.startsWith('layout:title-')),
      false,
    );
    assert.ok(observation.features.includes('layout:4-columns'));
    assert.ok(observation.features.includes('layout:body-majority-occupancy:1111'));
    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:dark-fill'));
  });
});
