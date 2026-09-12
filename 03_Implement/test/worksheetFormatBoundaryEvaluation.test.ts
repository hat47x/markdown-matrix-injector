import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  type WorksheetFormatSourceProfile,
} from '../src/experimental/worksheetFormatPrototype.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

/**
 * Simulates environments where style metadata cannot be trusted. The same
 * snapshots are used, but fill/border evidence is deliberately excluded from
 * comparison so the test measures how much identity remains in structure.
 */
const STRUCTURE_ONLY_PROFILE: WorksheetFormatSourceProfile = {
  id: 'structure-only-v1',
  evidence: ['structure'],
};

type TableOptions = {
  fill?: FormatFillTone;
  startColumn?: number;
  gapBeforeRelativeColumns?: readonly number[];
};

/**
 * Builds a small worksheet snapshot in the same shape produced by the read-only
 * worksheet bridge. Keeping fixtures at snapshot level isolates matcher and
 * feature behavior from SheetJS runtime availability.
 */
function table(
  title: string,
  labels: readonly string[],
  options: TableOptions = {},
): WorksheetFormatSnapshot {
  const startColumn = options.startColumn ?? 0;
  const gapBefore = new Set(options.gapBeforeRelativeColumns ?? []);
  const cells: Array<{
    row: number;
    column: number;
    text: string;
    fillTone?: FormatFillTone;
  }> = [{ row: 0, column: startColumn, text: title }];

  let column = startColumn;
  for (const label of labels) {
    while (gapBefore.has(column - startColumn)) column += 1;
    cells.push({
      row: 1,
      column,
      text: label,
      ...(options.fill ? { fillTone: options.fill } : {}),
    });
    column += 1;
  }

  return {
    cells,
    merges: [{ startRow: 0, startColumn, endRow: 0, endColumn: column - 1 }],
  };
}

const baseline = {
  release: table('リリース判定表', ['ID', '項目', '判定', '確認者', '備考', '期限'], { fill: 'dark' }),
  interface: table('インターフェース定義', ['項目名', '型', '必須', '桁数', '説明', '例'], { fill: 'gray' }),
  code: table('コード一覧', ['コード', '名称', '説明'], { fill: 'light' }),
  settings: table('設定表', ['項目', '値'], { fill: 'dark' }),
} as const;

function prototypes(profile: WorksheetFormatSourceProfile) {
  return Object.entries(baseline).map(([id, snapshot]) =>
    createWorksheetFormatPrototype(id, snapshot, profile));
}

for (const profile of [SHEETJS_CE_XLSX_0203_SOURCE_PROFILE, STRUCTURE_ONLY_PROFILE]) {
  test(`${profile.id}: moving a table horizontally does not change its format identity`, () => {
    const result = matchWorksheetFormatSnapshot(
      table('リリース判定表', ['ID', '項目', '判定', '確認者', '備考', '期限'], {
        fill: 'dark',
        startColumn: 4,
      }),
      prototypes(profile),
      profile,
    );

    assert.equal(result.match.status, 'matched');
    assert.equal(result.match.winner?.prototypeId, 'release');
    assert.equal(result.match.winner?.deviationScore, 0);
  });

  test(`${profile.id}: a clearly different dependency table remains novel`, () => {
    const result = matchWorksheetFormatSnapshot(
      table('依存関係', ['サービス', '接続先', '方式', '備考'], { fill: 'dark' }),
      prototypes(profile),
      profile,
    );

    assert.equal(result.match.status, 'novel');
    assert.equal(result.match.winner, undefined);
  });

  test(`${profile.id}: a structural gap is not silently absorbed as the baseline layout`, () => {
    const result = matchWorksheetFormatSnapshot(
      table('リリース判定表', ['ID', '項目', '判定', '確認者', '備考', '期限'], {
        fill: 'dark',
        gapBeforeRelativeColumns: [2],
      }),
      prototypes(profile),
      profile,
    );

    assert.equal(result.match.status, 'novel');
  });

  test(`${profile.id}: one renamed column in a three-column code list stays recoverable`, () => {
    const result = matchWorksheetFormatSnapshot(
      table('コード一覧', ['コード', '表示名', '説明'], { fill: 'light' }),
      prototypes(profile),
      profile,
    );

    assert.equal(result.match.status, 'matched');
    assert.equal(result.match.winner?.prototypeId, 'code');
  });
}

test('structure + fill: one renamed column in a two-column table remains a candidate', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark' }),
    prototypes(SHEETJS_CE_XLSX_0203_SOURCE_PROFILE),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'settings');
  assert.ok((result.match.winner?.confidence ?? 0) >= 0.7);
});

test('structure only: the same two-column rename fails closed because evidence is insufficient', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark' }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(result.match.winner, undefined);
  assert.ok((result.match.candidates[0]?.confidence ?? 1) < 0.7);
});

test('structure + fill: equidistant viable two-column candidates are ambiguous', () => {
  const profile = SHEETJS_CE_XLSX_0203_SOURCE_PROFILE;
  const candidates = [
    createWorksheetFormatPrototype(
      'settings-value',
      table('設定表', ['項目', '値'], { fill: 'dark' }),
      profile,
    ),
    createWorksheetFormatPrototype(
      'settings-description',
      table('設定表', ['項目', '説明'], { fill: 'dark' }),
      profile,
    ),
  ];

  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark' }),
    candidates,
    profile,
  );

  assert.equal(result.match.status, 'ambiguous');
  assert.equal(result.match.winner, undefined);
  assert.equal(result.match.candidates[0]?.confidence, result.match.candidates[1]?.confidence);
});

test('structure only: an equal tie below minimum confidence is novel, not ambiguous', () => {
  const profile = STRUCTURE_ONLY_PROFILE;
  const candidates = [
    createWorksheetFormatPrototype(
      'settings-value',
      table('設定表', ['項目', '値'], { fill: 'dark' }),
      profile,
    ),
    createWorksheetFormatPrototype(
      'settings-description',
      table('設定表', ['項目', '説明'], { fill: 'dark' }),
      profile,
    ),
  ];

  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark' }),
    candidates,
    profile,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(result.match.winner, undefined);
  assert.equal(result.match.candidates[0]?.confidence, result.match.candidates[1]?.confidence);
  assert.ok((result.match.candidates[0]?.confidence ?? 1) < 0.7);
});
