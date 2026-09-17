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

const STRUCTURE_ONLY_PROFILE: WorksheetFormatSourceProfile = {
  id: 'structure-only-v1',
  evidence: ['structure'],
};

type TableOptions = {
  fill?: FormatFillTone;
  startColumn?: number;
  gapBeforeRelativeColumns?: readonly number[];
  bodyValues?: readonly string[];
  bodyRow?: number;
  partialBody?: boolean;
  omitBody?: boolean;
};

/**
 * Builds a snapshot that resembles a small Excel design table.
 * Values are intentionally simple: these tests evaluate geometry and presence,
 * not semantic value classification.
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
  const headerColumns: number[] = [];
  for (const label of labels) {
    while (gapBefore.has(column - startColumn)) column += 1;
    headerColumns.push(column);
    cells.push({
      row: 1,
      column,
      text: label,
      ...(options.fill ? { fillTone: options.fill } : {}),
    });
    column += 1;
  }

  if (!options.omitBody) {
    const bodyValues = options.bodyValues ?? labels.map((_, index) => `v${index + 1}`);
    bodyValues.forEach((value, index) => {
      if (options.partialBody && index === bodyValues.length - 1) return;
      const bodyColumn = headerColumns[index];
      if (bodyColumn !== undefined) {
        cells.push({ row: options.bodyRow ?? 2, column: bodyColumn, text: value });
      }
    });
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
  settings: table('設定表', ['項目', '値'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
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
    table('設定表', ['項目', '内容'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
    prototypes(SHEETJS_CE_XLSX_0203_SOURCE_PROFILE),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'settings');
  assert.ok((result.match.winner?.confidence ?? 0) >= 0.7);
});

test('structure only: table skeleton and occupancy evidence recover a one-column rename in a two-column table', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'settings');
  assert.ok(result.observation.features.includes('layout:body-majority-occupancy:11'));
  assert.ok((result.match.winner?.confidence ?? 0) >= 0.7);
});

test('structure only: changing both labels still remains novel', () => {
  const result = matchWorksheetFormatSnapshot(
    table('別表', ['コード', '名称'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(result.match.winner, undefined);
});

test('structure only: body row displacement is preserved and fails closed', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], {
      fill: 'dark',
      bodyValues: ['timeout', '30'],
      bodyRow: 4,
    }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
});

test('structure only: partial first body coverage is preserved and fails closed', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], {
      fill: 'dark',
      bodyValues: ['timeout', '30'],
      partialBody: true,
    }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
});

test('structure only: missing body evidence is not invented to force a match', () => {
  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark', omitBody: true }),
    prototypes(STRUCTURE_ONLY_PROFILE),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(result.match.winner, undefined);
});

test('structure + fill: near-tied viable two-column candidates are ambiguous', () => {
  const profile = SHEETJS_CE_XLSX_0203_SOURCE_PROFILE;
  const candidates = [
    createWorksheetFormatPrototype(
      'settings-value',
      table('設定表', ['項目', '値'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
      profile,
    ),
    createWorksheetFormatPrototype(
      'settings-description',
      table('設定表', ['項目', '説明'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
      profile,
    ),
  ];

  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { fill: 'dark', bodyValues: ['timeout', '30'] }),
    candidates,
    profile,
  );

  assert.equal(result.match.status, 'ambiguous');
  assert.equal(result.match.winner, undefined);
  const first = result.match.candidates[0]?.confidence ?? 0;
  const second = result.match.candidates[1]?.confidence ?? 0;
  assert.ok(Math.abs(first - second) < 0.05);
});

test('structure only: near-tied viable two-column candidates remain ambiguous after v5 evidence', () => {
  const profile = STRUCTURE_ONLY_PROFILE;
  const candidates = [
    createWorksheetFormatPrototype(
      'settings-value',
      table('設定表', ['項目', '値'], { bodyValues: ['timeout', '30'] }),
      profile,
    ),
    createWorksheetFormatPrototype(
      'settings-description',
      table('設定表', ['項目', '説明'], { bodyValues: ['timeout', '30'] }),
      profile,
    ),
  ];

  const result = matchWorksheetFormatSnapshot(
    table('設定表', ['項目', '内容'], { bodyValues: ['timeout', '30'] }),
    candidates,
    profile,
  );

  assert.equal(result.match.status, 'ambiguous');
  assert.equal(result.match.winner, undefined);
  assert.ok((result.match.candidates[0]?.confidence ?? 0) >= 0.7);
  const first = result.match.candidates[0]?.confidence ?? 0;
  const second = result.match.candidates[1]?.confidence ?? 0;
  assert.ok(Math.abs(first - second) < 0.05);
});
