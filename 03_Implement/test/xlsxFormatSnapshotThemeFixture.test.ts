import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX, { version as xlsxVersion } from 'xlsx';
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
  '525adf8be480e1db1a3ddfbe81465c176d8ba12553efdfa74a8c6ba2dcff4819';

type ThemeColorLike = {
  theme?: number;
  tint?: number;
  rgb?: string;
};

type ThemeStyleLike = {
  patternType?: string;
  fgColor?: ThemeColorLike;
};

type ThemeCellLike = {
  s?: ThemeStyleLike;
};

function externalFixtureBytes(): Buffer {
  const fixturePath = fileURLToPath(new URL(
    './fixtures/libreoffice-theme-fill-boundary.xlsx.base64',
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-theme-xlsx-'));
  const absolutePath = path.join(directory, 'libreoffice-theme-fill-boundary.xlsx');
  try {
    fs.writeFileSync(absolutePath, externalFixtureBytes());
    return run(absolutePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function rawSheetJsStyle(sheetName: string): ThemeStyleLike {
  const workbook = XLSX.read(externalFixtureBytes(), {
    type: 'buffer',
    dense: false,
    cellStyles: true,
    cellText: true,
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  });

  const worksheet = workbook.Sheets[sheetName];
  assert.ok(worksheet, `missing worksheet: ${sheetName}`);
  const cell = worksheet.A2 as ThemeCellLike | undefined;
  assert.ok(cell?.s, `missing style on ${sheetName}!A2`);
  return cell.s;
}

test('SheetJS 0.20.3 resolves external theme index to RGB before the bridge classifies fill tone', () => {
  assert.equal(xlsxVersion, '0.20.3');

  const style = rawSheetJsStyle('Theme Dark');
  assert.equal(style.patternType, 'solid');
  assert.equal(style.fgColor?.theme, 3);
  assert.equal(style.fgColor?.tint ?? 0, 0);
  assert.equal(style.fgColor?.rgb?.toUpperCase(), '1F497D');

  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'Theme Dark',
    });

    for (let column = 0; column < 4; column += 1) {
      assert.equal(
        result.snapshot.cells.find(
          (cell) => cell.row === 1 && cell.column === column,
        )?.fillTone,
        'dark',
      );
    }

    const observation = extractWorksheetFormatFeatures(result.snapshot);
    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:dark-fill'));

    const prototype = createWorksheetFormatPrototype(
      'theme-dark',
      result.snapshot,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );
    assert.ok(prototype.features.includes('header:fill-present'));
    assert.ok(prototype.features.includes('header:dark-fill'));
  });
});

test('SheetJS 0.20.3 applies theme tint before fill-tone classification', () => {
  const style = rawSheetJsStyle('Theme Light Tint');
  assert.equal(style.patternType, 'solid');
  assert.equal(style.fgColor?.theme, 3);
  assert.equal(style.fgColor?.tint, 0.8);
  assert.equal(style.fgColor?.rgb?.toUpperCase(), 'C6D9F1');

  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'Theme Light Tint',
    });

    for (let column = 0; column < 4; column += 1) {
      assert.equal(
        result.snapshot.cells.find(
          (cell) => cell.row === 1 && cell.column === column,
        )?.fillTone,
        'light',
      );
    }

    const observation = extractWorksheetFormatFeatures(result.snapshot);
    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:light-fill'));

    const prototype = createWorksheetFormatPrototype(
      'theme-light-tint',
      result.snapshot,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );
    assert.ok(prototype.features.includes('header:fill-present'));
    assert.ok(prototype.features.includes('header:light-fill'));
  });
});

test('theme fixture carries a direct-RGB control through the same external workbook', () => {
  const style = rawSheetJsStyle('RGB Control');
  assert.equal(style.patternType, 'solid');
  // The OOXML value is FF202020; SheetJS 0.20.3 drops the alpha channel.
  assert.equal(style.fgColor?.rgb?.toUpperCase(), '202020');

  withExternalFixture((absolutePath) => {
    const result = readXlsxFormatSnapshot({
      absolutePath,
      sheetName: 'RGB Control',
    });
    const observation = extractWorksheetFormatFeatures(result.snapshot);

    assert.ok(observation.features.includes('header:fill-present'));
    assert.ok(observation.features.includes('header:dark-fill'));
  });
});
