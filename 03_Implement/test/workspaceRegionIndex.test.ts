import test from 'node:test';
import assert from 'node:assert/strict';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { WorkspaceRegionIndex } from '../src/search/workspaceRegionIndex.js';

function sheet(cells: Record<string, string>): SheetSource {
  const map = new Map<string, SourceCell>();
  let used = { startRow: Infinity, startCol: Infinity, endRow: -1, endCol: -1 };
  for (const [ref, text] of Object.entries(cells)) {
    const [, letters, digits] = /^([A-Z]+)(\d+)$/u.exec(ref)!;
    const col = letters.charCodeAt(0) - 65;
    const row = Number(digits) - 1;
    const numeric = /^\d+$/u.test(text);
    map.set(`${row},${col}`, { text, type: numeric ? 'n' : 's', value: numeric ? Number(text) : text });
    used = { startRow: Math.min(used.startRow, row), startCol: Math.min(used.startCol, col), endRow: Math.max(used.endRow, row), endCol: Math.max(used.endCol, col) };
  }
  return { usedRange: used, merges: [], cellAt: (r, c) => map.get(`${r},${c}`) };
}

const STATES: WorkbookData = {
  sheets: {
    状態遷移: sheet({ B1: '状態遷移表', B3: 'ID', C3: '操作', D3: '遷移先', B4: '1', C4: '申請', D4: '申請中', B5: '2', C5: '承認', D5: '承認済' }),
  },
};
const RENAMED: WorkbookData = {
  sheets: {
    状態遷移: sheet({ B1: '状態遷移表', B3: '番号', C3: '操作', D3: '遷移先', B4: '1', C4: '申請', D4: '申請中' }),
  },
};

function fixture() {
  const books: Record<string, { stat: { mtimeMs: number; size: number }; data: WorkbookData }> = {
    '/ws/設計.xlsx': { stat: { mtimeMs: 1, size: 1 }, data: STATES },
  };
  let loads = 0;
  const index = new WorkspaceRegionIndex({
    statFile: (path) => books[path].stat,
    loadWorkbook: (path) => {
      loads += 1;
      return books[path].data;
    },
  });
  return { index, books, loads: () => loads };
}

const relative = (path: string): string => `./${path.split('/').pop()}`;

test('workspace index: describe a table, get existing notation back', async () => {
  const { index } = fixture();
  const refreshed = await index.refresh(['/ws/設計.xlsx']);
  assert.deepEqual([refreshed.regions, refreshed.method], [1, 'bm25']);
  const result = index.query('状態遷移表のIDと操作を見せて', relative);
  assert.equal(result.candidates[0].markdown, '![[./設計.xlsx#状態遷移|B3:D5?columns=A,B&header=first]]');
});

test('workspace index: a changed source is not offered from stale structure', async () => {
  const { index, books, loads } = fixture();
  await index.refresh(['/ws/設計.xlsx']);
  books['/ws/設計.xlsx'] = { stat: { mtimeMs: 2, size: 1 }, data: RENAMED };
  const stale = index.query('状態遷移表のIDと操作を見せて', relative);
  assert.equal(stale.status, 'no-match');
  assert.match(stale.reasons[0], /原本が変更/u);
  const before = loads();
  await index.refresh(['/ws/設計.xlsx']);
  assert.equal(loads(), before + 1); // only the changed book is re-read
  assert.equal(index.query('状態遷移表の番号', relative).candidates[0].columns[0].header, '番号');
});

test('workspace index: switches to FlyHash only above the region threshold', async () => {
  const books: Record<string, WorkbookData> = {};
  for (let i = 0; i < 4; i += 1) books[`/ws/b${i}.xlsx`] = STATES;
  const index = new WorkspaceRegionIndex({ statFile: () => ({ mtimeMs: 1, size: 1 }), loadWorkbook: (path) => books[path], flyhashThreshold: 3 });
  assert.equal((await index.refresh(Object.keys(books).slice(0, 2))).method, 'bm25');
  assert.equal((await index.refresh(Object.keys(books))).method, 'flyhash');
  assert.equal(index.query('状態遷移表', relative).status, 'candidates');
});

test('workspace index: maxRegions is a hard retained-region bound even within one workbook', async () => {
  const multi: WorkbookData = {
    sheets: {
      A: sheet({ A1: '表A', A2: 'ID', B2: '名称', A3: '1', B3: 'a' }),
      B: sheet({ A1: '表B', A2: 'ID', B2: '名称', A3: '2', B3: 'b' }),
    },
  };
  const index = new WorkspaceRegionIndex({
    statFile: () => ({ mtimeMs: 1, size: 1 }),
    loadWorkbook: () => multi,
    maxRegions: 1,
  });

  const refreshed = await index.refresh(['/ws/multi.xlsx']);
  assert.equal(refreshed.capped, true);
  assert.equal(refreshed.regions, 1);
  assert.equal(index.regionCount, 1);
});
