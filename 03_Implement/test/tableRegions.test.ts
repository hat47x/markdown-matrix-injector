import assert from 'node:assert/strict';
import test from 'node:test';
import type { CellRange, SheetSource } from '../src/core/sheetSource.js';
import { parseCellRef, parseRangeToCellRange } from '../src/core/tableGeometry.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { paramValueCandidates, rangeCandidates } from '../src/dx/completionCandidates.js';
import type { CompletionContext } from '../src/dx/completionContext.js';
import { detectTableRegions, gridProjection } from '../src/importAssist/tableRegions.js';
import { detectRegions } from '../src/search/regionDetector.js';
import { verifyRegion } from '../src/search/verify.js';
import { WorkspaceRegionIndex } from '../src/search/workspaceRegionIndex.js';

function sheet(cells: Record<string, string>, merges: string[] = []): SheetSource {
  const byKey = new Map<string, string>();
  let endRow = 0;
  let endCol = 0;
  for (const [address, text] of Object.entries(cells)) {
    const { row, col } = parseCellRef(address);
    byKey.set(`${row}:${col}`, text);
    endRow = Math.max(endRow, row);
    endCol = Math.max(endCol, col);
  }
  const ranges: CellRange[] = merges.map((range) => parseRangeToCellRange(range));
  for (const merge of ranges) {
    endRow = Math.max(endRow, merge.endRow);
    endCol = Math.max(endCol, merge.endCol);
  }
  return {
    usedRange: { startRow: 0, startCol: 0, endRow, endCol },
    merges: ranges,
    cellAt(row, col) {
      const text = byKey.get(`${row}:${col}`);
      if (text === undefined) return undefined;
      return /^\d+$/.test(text) ? { text, type: 'n', value: Number(text) } : { text, type: 's', value: text };
    },
  };
}

/** 画面項目 on a 方眼紙 grid: No (B:C), 項目名 (D:H), 型 (I:L), 備考 (M:T); title in row 1. */
function screenItems(): SheetSource {
  const cells: Record<string, string> = { B1: '2. 画面項目', B2: 'No', D2: '項目名', I2: '型', M2: '備考' };
  const merges = ['B1:T1', 'B2:C2', 'D2:H2', 'I2:L2', 'M2:T2'];
  [['1', '受注番号', '文字', '自動採番'], ['2', '顧客コード', '文字', ''], ['3', '受注日', '日付', '当日']].forEach((values, i) => {
    const row = 3 + i;
    ['B', 'D', 'I', 'M'].forEach((col, j) => {
      if (values[j]) cells[`${col}${row}`] = values[j];
    });
    merges.push(`B${row}:C${row}`, `D${row}:H${row}`, `I${row}:L${row}`, `M${row}:T${row}`);
  });
  return sheet(cells, merges);
}

test('on a merged grid, table regions carry their anchor columns and the headers the renderer shows', () => {
  const [region] = detectTableRegions('受注登録', screenItems());
  assert.equal(region.a1, 'B2:T5');
  assert.equal(region.title, '2. 画面項目');
  assert.deepEqual(region.columnAnchors, [1, 3, 8, 12]);
  assert.deepEqual(region.headers, ['No', '項目名', '型', '備考']);
  assert.equal(region.headerConfidence, 'likely');
  assert.ok(region.valueSample.includes('受注番号'));
  assert.deepEqual(gridProjection(region), { columns: 'A,C,H,L', mode: 'table' });
  assert.deepEqual(gridProjection(region, [1, 2]), { columns: 'C,H', mode: 'table' });
  assert.equal(verifyRegion(region, screenItems()).ok, true);
});

test('a sheet without merged table columns keeps the physical region detector unchanged', () => {
  const plain = sheet({ A1: 'コード', B1: '名称', A2: '01', B2: '受付' }, ['D1:E1']);
  assert.deepEqual(detectTableRegions('S', plain), detectRegions('S', plain));
});

test('search on a merged grid emits the anchor columns, and a column request picks only its anchors', async () => {
  const workbook: WorkbookData = { sheets: { 受注登録: screenItems() } };
  const index = new WorkspaceRegionIndex({ statFile: () => ({ mtimeMs: 1, size: 1 }), loadWorkbook: () => workbook });
  await index.refresh(['/ws/画面定義書.xlsx']);
  const whole = index.query('受注登録の画面項目の表', (bookPath) => `./${bookPath.split('/').pop()}`);
  assert.equal(whole.candidates[0]?.markdown, '![[./画面定義書.xlsx#受注登録|B2:T5?columns=A,C,H,L&header=first&mode=table]]');
  const some = index.query('受注登録の画面項目の項目名と型', (bookPath) => `./${bookPath.split('/').pop()}`);
  assert.equal(some.candidates[0]?.markdown, '![[./画面定義書.xlsx#受注登録|B2:T5?columns=C,H&header=first&mode=table]]');
});

test('completion explains what a merged table needs and offers its anchor columns', () => {
  const context: CompletionContext = { stage: 'range', replaceStart: 0, replaceEnd: 0, typed: '', filepath: './画面定義書.xlsx', usedParams: [] } as CompletionContext;
  const [range] = rangeCandidates(context, '受注登録', screenItems());
  assert.equal(range.label, 'B2:T5');
  assert.match(range.detail ?? '', /columns=A,C,H,L&mode=table/);

  const [region] = detectTableRegions('受注登録', screenItems());
  const values = paramValueCandidates({ ...context, stage: 'param-value', paramKey: 'columns', typed: '' } as CompletionContext, region);
  assert.deepEqual(values.map((candidate) => candidate.label), ['A,C,H,L', 'A', 'C', 'H', 'L']);
  assert.deepEqual(values.slice(1).map((candidate) => candidate.detail), ['No', '項目名', '型', '備考']);
});
