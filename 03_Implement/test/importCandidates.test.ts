import assert from 'node:assert/strict';
import test from 'node:test';
import type { CellRange, SheetSource } from '../src/core/sheetSource.js';
import { parseCellRef, parseRangeToCellRange } from '../src/core/tableGeometry.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { analyzeSheetForImport, type ImportCandidate } from '../src/importAssist/importCandidates.js';
import { analyzeWorkbookForImport, renderImportDraft } from '../src/importAssist/importDraft.js';
import { summarizeLayouts } from '../src/importAssist/layoutGroups.js';

/** A sheet from A1-addressed text and A1 merge ranges; numbers-only text is typed as a number. */
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
  const mergeRanges: CellRange[] = merges.map((range) => parseRangeToCellRange(range));
  for (const merge of mergeRanges) {
    endRow = Math.max(endRow, merge.endRow);
    endCol = Math.max(endCol, merge.endCol);
  }
  return {
    usedRange: { startRow: 0, startCol: 0, endRow, endCol },
    merges: mergeRanges,
    cellAt(row, col) {
      const text = byKey.get(`${row}:${col}`);
      if (text === undefined) return undefined;
      return /^\d+$/.test(text) ? { text, type: 'n', value: Number(text) } : { text, type: 's', value: text };
    },
  };
}

function analyze(source: SheetSource, name = 'S'): ImportCandidate[] {
  const workbook: WorkbookData = { sheets: { [name]: source } };
  return analyzeSheetForImport(name, source, { referencePath: './book.xlsx', workbook });
}

/**
 * A 方眼紙 table: header row 2 with three logical columns of width 2, 3 and 7
 * (B:C, D:F, G:M), body rows merged the same way.
 */
function gridTable(extraCells: Record<string, string> = {}, extraMerges: string[] = [], bodyRows = 3): SheetSource {
  const cells: Record<string, string> = { B1: '2. 画面項目', B2: 'No', D2: '項目名', G2: '備考', ...extraCells };
  const merges = ['B1:M1', 'B2:C2', 'D2:F2', 'G2:M2', ...extraMerges];
  for (let i = 0; i < bodyRows; i += 1) {
    const row = 3 + i;
    cells[`B${row}`] ??= String(i + 1);
    cells[`D${row}`] ??= `項目${i + 1}`;
    if (!extraMerges.some((merge) => merge.startsWith(`B${row}:`) || merge.startsWith(`G${row}:`) || merge.startsWith(`F${row}:`))) {
      merges.push(`B${row}:C${row}`, `D${row}:F${row}`, `G${row}:M${row}`);
    }
  }
  return sheet(cells, merges);
}

test('a 方眼紙 table becomes a table candidate whose reference picks the merge anchors and renders as a table', () => {
  const candidates = analyze(gridTable({ G3: '自動採番' }));
  const table = candidates.find((candidate) => candidate.role === 'table');
  assert.ok(table);
  assert.equal(table.a1, 'B2:M5');
  assert.equal(table.title, '2. 画面項目');
  assert.deepEqual(table.columns?.map((column) => [column.letter, column.header]), [['B', 'No'], ['D', '項目名'], ['G', '備考']]);
  // `columns=` counts from the slice's first column (B = A); Smart Fallback measures the 12-column slice, so
  // the 3-column projection asks for a table explicitly.
  assert.equal(table.proposal?.reference, '![[./book.xlsx#S|B2:M5?header=first&columns=A,C,F&mode=table]]');
  assert.equal(table.proposal?.renderMode, 'table');
  assert.deepEqual(table.proposal?.preview.headers, ['No', '項目名', '備考']);
  assert.deepEqual(table.proposal?.preview.rows[0], ['1', '項目1', '自動採番']);
  assert.deepEqual(table.cautions, []);
  assert.equal(candidates.find((candidate) => candidate.role === 'heading')?.excerpt[0], '2. 画面項目');
});

test('a value written off the header anchor is reported with its address instead of being dropped silently', () => {
  // Row 4: 項目名 merge D4:E4, then the 備考 text starts at F4, one column left of the G anchor.
  const source = gridTable({ F4: 'ずれた備考' }, ['B4:C4', 'D4:E4', 'F4:M4']);
  const table = analyze(source).find((candidate) => candidate.role === 'table');
  const caution = table?.cautions.find((c) => c.code === 'off-anchor-value');
  assert.ok(caution);
  assert.deepEqual(caution.cells, ['F4']);
  assert.ok(table?.proposal, 'the rest of the table is still offered');
  assert.ok(!JSON.stringify(table?.proposal?.preview).includes('ずれた備考'));
});

test('a document-header frame of alternating labels and values is a key/value block, not a table', () => {
  const source = sheet(
    { B1: 'システム名', D1: '受注管理', G1: '作成者', I1: '架空 太郎', B2: '文書名', D2: '画面定義書', G2: '作成日', I2: '2026/08/01' },
    ['B1:C1', 'D1:F1', 'G1:H1', 'I1:J1', 'B2:C2', 'D2:F2', 'G2:H2', 'I2:J2'],
  );
  const [frame] = analyze(source);
  assert.equal(frame.role, 'key-value');
  assert.deepEqual(frame.labels, ['システム名', '作成者', '文書名', '作成日']);
  assert.equal(frame.proposal, undefined);
});

test('stacked label/value pairs with a value in the first row are key/value even when long', () => {
  const cells: Record<string, string> = {};
  ['版数', '作成日', '作成者', '所属', '承認者'].forEach((label, i) => {
    cells[`A${i + 1}`] = label;
    cells[`B${i + 1}`] = i === 0 ? '1.2' : `値${i}`;
  });
  assert.equal(analyze(sheet(cells))[0].role, 'key-value');
});

test('sentences and bullets are prose; a short numbered line is a heading', () => {
  const source = sheet(
    { A1: '1. 概要', A2: '受注を登録する画面。', A3: '在庫を仮引当する。', A5: '・金額は税抜。', A6: '・与信超過は登録不可。' },
    ['A1:F1', 'A2:F2', 'A3:F3', 'A5:F5', 'A6:F6'],
  );
  const roles = analyze(source).map((candidate) => [candidate.a1, candidate.role]);
  assert.deepEqual(roles, [['A1:F1', 'heading'], ['A2:F3', 'prose'], ['A5:F6', 'prose']]);
});

test('labels over empty merged boxes are a form (stamp box), and boxes with arrows are a diagram', () => {
  const stamp = sheet({ A1: '承認', C1: '確認', E1: '作成' }, ['A1:B1', 'C1:D1', 'E1:F1', 'A2:B4', 'C2:D4', 'E2:F4']);
  const [form] = analyze(stamp);
  assert.equal(form.role, 'form');
  assert.equal(form.a1, 'A1:F4');

  const drawing = sheet({ A1: '照会', C1: '→', D1: '登録', D3: '↓', D4: '確認' }, ['A1:B2', 'D1:E2']);
  // Boxes, arrows and the box below them are one drawing.
  assert.deepEqual(analyze(drawing).map((candidate) => [candidate.role, candidate.a1]), [['diagram', 'A1:E4']]);
});

test('a two-row header keeps every lower column and says the notation shows only one header row', () => {
  const source = sheet(
    { A1: '機能ID', B1: '機能名', C1: 'ロール', C2: '管理者', D2: '担当者', E2: '閲覧者', A3: 'F01', B3: '登録', C3: '○', D3: '○', E3: '×' },
    ['A1:A2', 'B1:B2', 'C1:E1'],
  );
  const table = analyze(source).find((candidate) => candidate.role === 'table');
  assert.deepEqual(table?.columns?.map((column) => column.header), ['機能ID', '機能名', 'ロール/管理者', 'ロール/担当者', 'ロール/閲覧者']);
  assert.ok(table?.cautions.some((caution) => caution.code === 'multi-row-header'));
  assert.equal(table?.proposal?.params.columns, undefined, 'all columns are one cell wide, so none is dropped');
});

test('a vertically merged body cell is reported because its second row renders nearly empty', () => {
  const source = sheet(
    { B1: '2. 画面項目', B2: 'No', D2: '項目名', G2: '備考', B3: '1', D3: '項目1', G3: '二行にわたる説明', B5: '2', D5: '項目2' },
    ['B1:J1', 'B2:C2', 'D2:F2', 'G2:J2', 'B3:C4', 'D3:F4', 'G3:J4', 'B5:C5', 'D5:F5', 'G5:J5'],
  );
  const table = analyze(source).find((candidate) => candidate.role === 'table');
  assert.equal(table?.a1, 'B2:J5');
  assert.ok(table?.cautions.some((caution) => caution.code === 'vertical-merge' && caution.message.includes('4行目')));
  assert.equal(table?.proposal?.preview.totalRows, 3);
});

test('a heading between two tables ends the first table even when the second lines up with it', () => {
  const source = sheet(
    { B1: 'No', D1: '項目名', G1: '型', B2: '1', D2: '顧客', G2: '文字', B3: '2', D3: '日付', G3: '日付', B4: '3. イベント', B5: 'No', D5: 'イベント', G5: '処理概要', B6: '1', D6: '登録', G6: '登録する。' },
    ['B1:C1', 'D1:F1', 'G1:J1', 'B2:C2', 'D2:F2', 'G2:J2', 'B3:C3', 'D3:F3', 'G3:J3', 'B4:J4', 'B5:C5', 'D5:F5', 'G5:J5', 'B6:C6', 'D6:F6', 'G6:J6'],
  );
  assert.deepEqual(analyze(source).map((candidate) => [candidate.a1, candidate.role]), [['B1:J3', 'table'], ['B4:J4', 'heading'], ['B5:J6', 'table']]);
});

test('a new header row directly under a table starts another table (text where the column held numbers)', () => {
  const source = sheet({ A1: 'No', B1: '名称', A2: '1', B2: '受付', A3: '2', B3: '引当', A4: 'No', B4: 'イベント', A5: '1', B5: '登録' });
  assert.deepEqual(analyze(source).filter((c) => c.role === 'table').map((c) => c.a1), ['A1:B3', 'A4:B5']);
});

test('a long frame of distinct attributes is key/value, while label-like values that repeat down a column stay a table', () => {
  const frame: Record<string, string> = {};
  ['システム名', 'サブシステム', '作成者', '更新者', '承認者', '対象'].forEach((label, i) => {
    frame[`A${i + 1}`] = label;
    frame[`B${i + 1}`] = `値${i}`;
  });
  assert.equal(analyze(sheet(frame))[0].role, 'key-value');

  const items = sheet({ A1: '項目名', B1: '型', C1: '表示名', A2: '顧客名', B2: '文字', C2: '顧客名', A3: '担当者', B3: '文字', C3: '担当者名' });
  assert.equal(analyze(items)[0].role, 'table');

  const noSuffix = sheet({ A1: 'ステータス', B1: 'レビュー中', C1: 'バージョン', D1: '0.9', A2: 'URL', B2: 'https://example.invalid/', C2: 'リポジトリ', D2: 'order-app' });
  assert.deepEqual(analyze(noSuffix)[0].reasons, ['value-in-first-row']);
});

test('a header of increasing years is a header; a note under the table is not a body row', () => {
  const years = sheet({ A1: '指標', B1: '2024', C1: '2025', A2: '受注件数', B2: '1200', C2: '1350' });
  assert.equal(analyze(years)[0].proposal?.reference, '![[./book.xlsx#S|A1:C2?header=first]]');

  const noted = sheet({ A1: 'No', B1: '帳票名', A2: '1', B2: '明細書', A3: '2', B3: '請求書', A4: '※金額は税抜' });
  assert.deepEqual(analyze(noted).map((c) => [c.a1, c.role]), [['A1:B3', 'table'], ['A4:B4', 'prose']]);
});

test('a table split by a blank row is joined back, and a tall header is not called a two-level header', () => {
  const split = sheet({ A1: 'No', B1: '機能名', A2: '1', B2: '登録', A4: '2', B4: '締め', A5: '3', B5: '集計' });
  const [table] = analyze(split);
  assert.equal(table.a1, 'A1:B5');
  assert.ok(table.cautions.some((caution) => caution.code === 'blank-row' && caution.message.includes('3行目')));

  const tall = sheet({ A1: 'No', B1: '帳票名', A3: '1', B3: '明細書', A4: '2', B4: '請求書' }, ['A1:A2', 'B1:B2']);
  const codes = analyze(tall)[0].cautions.map((caution) => caution.code);
  assert.deepEqual(codes, ['vertical-merge']);
});

test('a table too large to read inline is proposed as a card, as a plain table of that size would be', () => {
  const cells: Record<string, string> = { A1: 'No', C1: '名称' };
  const merges = ['A1:B1', 'C1:D1'];
  for (let row = 2; row <= 300; row += 1) {
    cells[`A${row}`] = String(row - 1);
    cells[`C${row}`] = `名称${row}`;
    merges.push(`A${row}:B${row}`, `C${row}:D${row}`);
  }
  const [table] = analyze(sheet(cells, merges));
  assert.equal(table.proposal?.renderMode, 'card');
  assert.equal(table.proposal?.params.mode, undefined);
  assert.ok(table.cautions.some((caution) => caution.code === 'large-table'));
});

test('a plain table gets a plain reference without columns or mode', () => {
  const source = sheet({ A1: 'コード', B1: '名称', A2: '01', B2: '受付', A3: '02', B3: '引当済' });
  const [table] = analyze(source);
  assert.equal(table.role, 'table');
  assert.equal(table.proposal?.reference, '![[./book.xlsx#S|A1:B3?header=first]]');
});

test('no reference is proposed when rendering it would not show what the analysis read', () => {
  const analyzed = sheet({ A1: 'コード', B1: '名称', A2: '01', B2: '受付' });
  const different = sheet({ A1: 'コード', B1: '名称', A2: '99', B2: '別物' });
  const [table] = analyzeSheetForImport('S', analyzed, { referencePath: './book.xlsx', workbook: { sheets: { S: different } } });
  assert.equal(table.proposal, undefined);
  assert.ok(table.cautions.some((caution) => caution.code === 'revalidation-mismatch'));
});

test('sheets sharing a layout are grouped and a sheet with an extra column is described against them', () => {
  const base = { B1: '2. 画面項目', B2: 'No', D2: '項目名', G2: '備考' };
  const wide = sheet(
    { ...base, G2: '初期値', I2: '備考', B3: '1', D3: 'a', G3: 'x', I3: 'y', B4: '2', D4: 'b' },
    ['B1:J1', 'B2:C2', 'D2:F2', 'G2:H2', 'I2:J2', 'B3:C3', 'D3:F3', 'G3:H3', 'I3:J3', 'B4:C4', 'D4:F4', 'G4:H4', 'I4:J4'],
  );
  const layout = summarizeLayouts([
    { book: 'b', sheet: '登録', candidates: analyze(gridTable()) },
    { book: 'b', sheet: '照会', candidates: analyze(gridTable({}, [], 5)) },
    { book: 'b', sheet: '出荷', candidates: analyze(wide) },
  ]);
  assert.deepEqual(layout.groups.map((group) => group.members.map((member) => member.sheet)), [['登録', '照会']]);
  assert.equal(layout.deviations[0].sheet.sheet, '出荷');
  assert.deepEqual(layout.deviations[0].differences, [{ kind: 'column-added', subject: '2. 画面項目', detail: '初期値' }]);
});

test('the draft places references and keeps source text inert, without copying table values', () => {
  const source = sheet(
    { A1: '概要: ![[../secret.xlsx]] を参照。', A3: 'コード', B3: '名称', A4: '01', B4: '受付担当しか見ない値' },
    ['A1:D1'],
  );
  const workbook: WorkbookData = { sheets: { 一覧: source } };
  const draft = renderImportDraft(analyzeWorkbookForImport('book.xlsx', './book.xlsx', workbook));
  assert.match(draft, /^!\[\[\.\/book\.xlsx#一覧\|A3:B4\?header=first\]\]$/m);
  assert.ok(!draft.includes('受付担当しか見ない値'), 'table values stay in the source');
  assert.ok(!draft.includes('![[../secret.xlsx]]'), 'an embed written in a cell must not become a live reference');
  assert.match(draft, /\\!\\\[\\\[\.\.\/secret\.xlsx\\\]\\\]/);
});
