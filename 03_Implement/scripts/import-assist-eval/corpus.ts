/**
 * Fictional "existing design document" corpus for the import-assistance
 * evaluation (02_Architecture/import-assistance.md §6, ADR-0019 D7 優先度2).
 *
 * The books imitate the Excel 方眼紙 design documents SIer projects carry
 * over: a narrow uniform grid where every logical cell is a horizontal merge,
 * a document-header key/value frame repeated on every sheet, numbered section
 * headings glued to their tables, prose in wide merged cells, a cover sheet
 * with a stamp box, a transition diagram drawn with merged boxes, plus plain
 * (non-方眼紙) sheets as controls. Every name and value is invented.
 *
 * The expected answer for every block is written down here, next to the
 * layout that produces it, and was fixed before the candidate engine existed.
 * It is developer-made, not blind: the numbers it produces are a prototype
 * check, not a user-value confirmation (ADR-0019 D9).
 *
 * Deterministic: no randomness, so the same code writes the same cells.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

export const DEFAULT_IMPORT_CORPUS_DIR = path.join(os.tmpdir(), 'mmi-import-assist-eval', 'corpus');

/** Roles a human would give a block when deciding what to import. */
export type ExpectedRole = 'table' | 'key-value' | 'prose' | 'heading' | 'diagram' | 'form';

/** Caution codes the engine is expected to raise for a table. */
export type ExpectedCaution =
  | 'vertical-merge'
  | 'off-anchor-value'
  | 'full-width-row'
  | 'multi-row-header'
  | 'wide-table';

export interface ExpectedTable {
  id: string;
  book: string;
  sheet: string;
  /** A1 of the header row through the last body row (heading excluded). */
  range: string;
  headers: string[];
  /** Logical body rows exactly as a reader should see them. */
  body: string[][];
  cautions: ExpectedCaution[];
  /** False when MMI Notation v1 cannot express the table exactly (e.g. a two-row header). */
  expressible: boolean;
}

export interface ExpectedBlock {
  id: string;
  book: string;
  sheet: string;
  /** Any cell inside the block, used to match it with a candidate. */
  anchor: string;
  role: Exclude<ExpectedRole, 'table'>;
}

export interface ImportCorpus {
  dir: string;
  books: string[];
  tables: ExpectedTable[];
  blocks: ExpectedBlock[];
}

// ---------------------------------------------------------------------------
// Sheet builder: physical cells + merges, 0-based internally.
// ---------------------------------------------------------------------------

export interface Span {
  text: string;
  width: number;
  /** Vertical extent of the merge (default 1). */
  height?: number;
}

export class SheetBuilder {
  readonly cells = new Map<string, { row: number; col: number; text: string }>();
  readonly merges: XLSX.Range[] = [];

  put(row: number, col: number, text: string): void {
    if (text === '') return;
    this.cells.set(`${row}:${col}`, { row, col, text });
  }

  /** Lays spans left to right from `col`; returns the anchor column of each span. */
  row(row: number, col: number, spans: readonly Span[]): number[] {
    const anchors: number[] = [];
    let at = col;
    for (const span of spans) {
      this.put(row, at, span.text);
      const height = span.height ?? 1;
      if (span.width > 1 || height > 1) {
        this.merges.push({ s: { r: row, c: at }, e: { r: row + height - 1, c: at + span.width - 1 } });
      }
      anchors.push(at);
      at += span.width;
    }
    return anchors;
  }

  toWorksheet(): XLSX.WorkSheet {
    const ws: XLSX.WorkSheet = {};
    let maxRow = 0;
    let maxCol = 0;
    for (const { row, col, text } of this.cells.values()) {
      // Integers only: version strings such as 1.0 and codes such as 01 stay text, as authors type them.
      const numeric = /^(?:0|[1-9]\d*)$/.test(text);
      ws[XLSX.utils.encode_cell({ r: row, c: col })] = numeric ? { t: 'n', v: Number(text), w: text } : { t: 's', v: text };
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
    for (const merge of this.merges) {
      maxRow = Math.max(maxRow, merge.e.r);
      maxCol = Math.max(maxCol, merge.e.c);
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    ws['!merges'] = this.merges;
    return ws;
  }
}

export const a1 = (row: number, col: number): string => XLSX.utils.encode_cell({ r: row, c: col });
export const rangeA1 = (r0: number, c0: number, r1: number, c1: number): string => `${a1(r0, c0)}:${a1(r1, c1)}`;

/** Grid origin for 方眼紙 sheets: column B, 29 grid columns wide (B..AD). */
const GRID_LEFT = 1;
const GRID_WIDTH = 29;

interface BookContext {
  book: string;
  sheet: string;
  tables: ExpectedTable[];
  blocks: ExpectedBlock[];
}

/** Rows 0-1: the document-header frame every content sheet repeats. */
function docHeader(b: SheetBuilder, ctx: BookContext, system: string, docName: string, sheetTitle: string, author: string, date: string): void {
  b.row(0, GRID_LEFT, [
    { text: 'システム名', width: 4 }, { text: system, width: 8 }, { text: '文書名', width: 4 },
    { text: docName, width: 7 }, { text: '作成者', width: 3 }, { text: author, width: 3 },
  ]);
  b.row(1, GRID_LEFT, [
    { text: 'サブシステム', width: 4 }, { text: '受注', width: 8 }, { text: '対象', width: 4 },
    { text: sheetTitle, width: 7 }, { text: '作成日', width: 3 }, { text: date, width: 3 },
  ]);
  ctx.blocks.push({ id: `${ctx.sheet}/doc-header`, book: ctx.book, sheet: ctx.sheet, anchor: a1(0, GRID_LEFT), role: 'key-value' });
}

function heading(b: SheetBuilder, ctx: BookContext, row: number, text: string, id: string): void {
  b.row(row, GRID_LEFT, [{ text, width: GRID_WIDTH }]);
  ctx.blocks.push({ id: `${ctx.sheet}/${id}`, book: ctx.book, sheet: ctx.sheet, anchor: a1(row, GRID_LEFT), role: 'heading' });
}

function prose(b: SheetBuilder, ctx: BookContext, row: number, lines: string[], id: string, height = 1): number {
  let at = row;
  for (const line of lines) {
    b.row(at, GRID_LEFT, [{ text: line, width: GRID_WIDTH, height }]);
    at += height;
  }
  ctx.blocks.push({ id: `${ctx.sheet}/${id}`, book: ctx.book, sheet: ctx.sheet, anchor: a1(row, GRID_LEFT), role: 'prose' });
  return at;
}

interface GridTable {
  id: string;
  row: number;
  columns: { header: string; width: number }[];
  rows: string[][];
  cautions?: ExpectedCaution[];
  /** Per body row index: override spans (used for off-anchor and full-width rows). */
  overrides?: Record<number, Span[]>;
  /** Per body row index: height of the row's merges (vertical merge). */
  heights?: Record<number, number>;
  /** Expected logical body when overrides/heights change what a reader sees. */
  expectedBody?: string[][];
  /** False when no v1 reference can show the table exactly (see ExpectedTable). */
  expressible?: boolean;
}

/** Writes a 方眼紙 table whose header starts at `row`; returns the next free row. */
function gridTable(b: SheetBuilder, ctx: BookContext, table: GridTable): number {
  const anchors = b.row(table.row, GRID_LEFT, table.columns.map((column) => ({ text: column.header, width: column.width })));
  let at = table.row + 1;
  table.rows.forEach((values, index) => {
    const override = table.overrides?.[index];
    const height = table.heights?.[index] ?? 1;
    const spans = override ?? table.columns.map((column, i) => ({ text: values[i] ?? '', width: column.width, height }));
    b.row(at, GRID_LEFT, spans);
    at += override ? 1 : height;
  });
  const lastCol = anchors[anchors.length - 1] + table.columns[table.columns.length - 1].width - 1;
  ctx.tables.push({
    id: `${ctx.book}/${ctx.sheet}/${table.id}`,
    book: ctx.book,
    sheet: ctx.sheet,
    range: rangeA1(table.row, GRID_LEFT, at - 1, lastCol),
    headers: table.columns.map((column) => column.header),
    body: table.expectedBody ?? table.rows,
    cautions: table.cautions ?? [],
    expressible: table.expressible ?? true,
  });
  return at;
}

// ---------------------------------------------------------------------------
// Book 1: 画面定義書 (方眼紙)
// ---------------------------------------------------------------------------

const SCREEN_ITEM_COLUMNS = [
  { header: 'No', width: 2 }, { header: '項目名', width: 6 }, { header: '項目ID', width: 6 },
  { header: '型', width: 3 }, { header: '桁', width: 2 }, { header: '必須', width: 2 }, { header: '備考', width: 8 },
];
const EVENT_COLUMNS = [{ header: 'No', width: 2 }, { header: 'イベント', width: 6 }, { header: '処理概要', width: 21 }];

function coverSheet(ctx: BookContext, title: string): XLSX.WorkSheet {
  const b = new SheetBuilder();
  b.row(8, GRID_LEFT, [{ text: title, width: GRID_WIDTH, height: 3 }]);
  ctx.blocks.push({ id: `${ctx.sheet}/title`, book: ctx.book, sheet: ctx.sheet, anchor: a1(8, GRID_LEFT), role: 'heading' });
  const pairs: [string, string][] = [['版数', '1.2'], ['作成日', '2026/08/01'], ['作成者', '架空 太郎'], ['所属', '第二開発部']];
  pairs.forEach(([label, value], i) => b.row(16 + i, 17, [{ text: label, width: 4 }, { text: value, width: 8 }]));
  ctx.blocks.push({ id: `${ctx.sheet}/doc-info`, book: ctx.book, sheet: ctx.sheet, anchor: a1(16, 17), role: 'key-value' });
  b.row(22, 17, [{ text: '承認', width: 4 }, { text: '確認', width: 4 }, { text: '作成', width: 4 }]);
  b.row(23, 17, [{ text: '', width: 4, height: 3 }, { text: '', width: 4, height: 3 }, { text: '', width: 4, height: 3 }]);
  ctx.blocks.push({ id: `${ctx.sheet}/stamp`, book: ctx.book, sheet: ctx.sheet, anchor: a1(22, 17), role: 'form' });
  return b.toWorksheet();
}

function revisionSheet(ctx: BookContext, docName: string): XLSX.WorkSheet {
  const b = new SheetBuilder();
  docHeader(b, ctx, '受注管理システム', docName, '改訂履歴', '架空 太郎', '2026/08/01');
  heading(b, ctx, 3, '改訂履歴', 'heading');
  gridTable(b, ctx, {
    id: 'revisions',
    row: 4,
    columns: [{ header: '版数', width: 3 }, { header: '改訂日', width: 4 }, { header: '改訂箇所', width: 6 }, { header: '改訂内容', width: 12 }, { header: '改訂者', width: 4 }],
    rows: [
      ['1.0', '2026/06/10', '全体', '新規作成', '架空 太郎'],
      ['1.1', '2026/07/02', '画面項目', '必須区分を見直し', '架空 花子'],
      ['1.2', '2026/08/01', 'イベント', '取消処理を追加', '架空 太郎'],
    ],
  });
  return b.toWorksheet();
}

interface ScreenSpec {
  sheet: string;
  summary: string[];
  items: string[][];
  itemColumns?: { header: string; width: number }[];
  events: string[][];
  /** Body index of an event row whose 処理概要 spans two physical rows. */
  tallEvent?: number;
  notes: string[];
}

function screenSheet(ctx: BookContext, spec: ScreenSpec): XLSX.WorkSheet {
  const b = new SheetBuilder();
  docHeader(b, ctx, '受注管理システム', '画面定義書', spec.sheet, '架空 太郎', '2026/08/01');
  heading(b, ctx, 3, '1. 画面概要', 'h-summary');
  let at = prose(b, ctx, 4, spec.summary, 'summary', 2);
  at += 1;
  heading(b, ctx, at, '2. 画面項目', 'h-items');
  at = gridTable(b, ctx, {
    id: 'items',
    row: at + 1,
    columns: spec.itemColumns ?? SCREEN_ITEM_COLUMNS,
    rows: spec.items,
    cautions: (spec.itemColumns ?? SCREEN_ITEM_COLUMNS).length > 10 ? ['wide-table'] : [],
  });
  at += 1;
  heading(b, ctx, at, '3. イベント', 'h-events');
  const heights = spec.tallEvent !== undefined ? { [spec.tallEvent]: 2 } : undefined;
  const expectedBody = spec.tallEvent !== undefined
    ? spec.events.flatMap((row, i) => (i === spec.tallEvent ? [row, ['', '', '']] : [row]))
    : undefined;
  at = gridTable(b, ctx, {
    id: 'events',
    row: at + 1,
    columns: EVENT_COLUMNS,
    rows: spec.events,
    heights,
    expectedBody,
    cautions: spec.tallEvent !== undefined ? ['vertical-merge'] : [],
  });
  at += 1;
  heading(b, ctx, at, '4. 備考', 'h-notes');
  prose(b, ctx, at + 1, spec.notes, 'notes');
  return b.toWorksheet();
}

function transitionSheet(ctx: BookContext): XLSX.WorkSheet {
  const b = new SheetBuilder();
  b.row(1, GRID_LEFT, [{ text: '画面遷移図', width: 10 }]);
  ctx.blocks.push({ id: `${ctx.sheet}/title`, book: ctx.book, sheet: ctx.sheet, anchor: a1(1, GRID_LEFT), role: 'heading' });
  b.row(3, GRID_LEFT, [
    { text: 'メニュー', width: 6, height: 2 }, { text: '→', width: 1 }, { text: '受注照会', width: 6, height: 2 },
    { text: '→', width: 1 }, { text: '受注登録', width: 6, height: 2 }, { text: '→', width: 1 }, { text: '登録確認', width: 6, height: 2 },
  ]);
  b.row(6, 15, [{ text: '↓', width: 1 }]);
  b.row(7, 12, [{ text: '出荷指示', width: 6, height: 2 }]);
  ctx.blocks.push({ id: `${ctx.sheet}/diagram`, book: ctx.book, sheet: ctx.sheet, anchor: a1(3, GRID_LEFT), role: 'diagram' });
  return b.toWorksheet();
}

function screenBook(): { name: string; sheets: [string, (ctx: BookContext) => XLSX.WorkSheet][] } {
  const wideItemColumns = [
    { header: 'No', width: 2 }, { header: '項目名', width: 5 }, { header: '項目ID', width: 5 }, { header: '型', width: 2 },
    { header: '桁', width: 2 }, { header: '必須', width: 2 }, { header: '初期値', width: 4 }, { header: '備考', width: 7 },
  ];
  return {
    name: '画面定義書_受注.xlsx',
    sheets: [
      ['表紙', (ctx) => coverSheet(ctx, '受注管理システム 画面定義書')],
      ['改訂履歴', (ctx) => revisionSheet(ctx, '画面定義書')],
      ['受注登録', (ctx) => screenSheet(ctx, {
        sheet: '受注登録',
        summary: ['受注担当者が顧客からの注文を登録する画面。', '登録時に在庫を仮引当し、不足時は警告を表示する。'],
        items: [
          ['1', '受注番号', 'orderNo', '文字', '10', '○', '自動採番'],
          ['2', '顧客コード', 'customerCode', '文字', '8', '○', '顧客検索から選択'],
          ['3', '受注日', 'orderDate', '日付', '10', '○', '初期値は当日'],
          ['4', '納期', 'dueDate', '日付', '10', '', ''],
          ['5', '商品コード', 'itemCode', '文字', '12', '○', ''],
          ['6', '数量', 'quantity', '数値', '5', '○', '1以上'],
          ['7', '単価', 'unitPrice', '数値', '9', '', '商品マスタから表示'],
          ['8', '備考', 'remarks', '文字', '200', '', ''],
        ],
        events: [
          ['1', '初期表示', '受注日に当日を設定する。'],
          ['2', '登録', '入力チェック後に受注を登録し、在庫を仮引当する。在庫不足の商品があれば警告ダイアログを表示し、担当者の確認後に登録する。'],
          ['3', 'クリア', '入力内容を初期状態に戻す。'],
          ['4', '戻る', 'メニューへ戻る。'],
        ],
        tallEvent: 1,
        notes: ['・金額は税抜で表示する。', '・顧客の与信超過時は登録不可とする。'],
      })],
      ['受注照会', (ctx) => screenSheet(ctx, {
        sheet: '受注照会',
        summary: ['登録済みの受注を条件で検索し、明細を確認する画面。', '照会のみで更新は行わない。'],
        items: [
          ['1', '受注番号From', 'orderNoFrom', '文字', '10', '', ''],
          ['2', '受注番号To', 'orderNoTo', '文字', '10', '', ''],
          ['3', '顧客コード', 'customerCode', '文字', '8', '', ''],
          ['4', '受注日From', 'orderDateFrom', '日付', '10', '', ''],
          ['5', '受注日To', 'orderDateTo', '日付', '10', '', ''],
          ['6', '状態', 'status', '選択', '2', '', '全件・受付・引当済・出荷済'],
        ],
        events: [
          ['1', '初期表示', '検索条件を空にする。'],
          ['2', '検索', '条件に一致する受注を最大500件表示する。'],
          ['3', '明細', '選択した受注の明細画面を開く。'],
        ],
        notes: ['・検索結果はCSVで出力できる。'],
      })],
      ['出荷指示', (ctx) => screenSheet(ctx, {
        sheet: '出荷指示',
        summary: ['引当済の受注から出荷指示を作成する画面。', '倉庫システムへ連携する。'],
        itemColumns: wideItemColumns,
        items: [
          ['1', '出荷指示番号', 'shipNo', '文字', '10', '○', '', '自動採番'],
          ['2', '受注番号', 'orderNo', '文字', '10', '○', '', ''],
          ['3', '出荷予定日', 'shipDate', '日付', '10', '○', '翌営業日', ''],
          ['4', '倉庫コード', 'warehouse', '選択', '3', '○', 'W01', ''],
          ['5', '配送区分', 'delivery', '選択', '2', '○', '通常', '通常・速達'],
        ],
        events: [
          ['1', '初期表示', '引当済の受注を一覧表示する。'],
          ['2', '指示作成', '選択した受注の出荷指示を作成し、倉庫システムへ送信する。'],
        ],
        notes: ['・倉庫システムの停止中は指示を保留する。'],
      })],
      ['画面遷移', transitionSheet],
    ],
  };
}

// ---------------------------------------------------------------------------
// Book 2: テーブル定義書 (方眼紙 + one plain sheet)
// ---------------------------------------------------------------------------

const TABLE_COLUMNS = [
  { header: 'No', width: 2 }, { header: '論理名', width: 6 }, { header: '物理名', width: 6 }, { header: 'データ型', width: 4 },
  { header: '桁', width: 2 }, { header: 'PK', width: 2 }, { header: 'NN', width: 2 }, { header: '備考', width: 5 },
];

function tableDefSheet(ctx: BookContext, logical: string, physical: string, rows: string[][], extra?: Partial<GridTable>): XLSX.WorkSheet {
  const b = new SheetBuilder();
  docHeader(b, ctx, '受注管理システム', 'テーブル定義書', physical, '架空 次郎', '2026/08/05');
  heading(b, ctx, 3, 'テーブル情報', 'h-info');
  b.row(4, GRID_LEFT, [{ text: 'テーブル論理名', width: 6 }, { text: logical, width: 8 }, { text: 'テーブル物理名', width: 6 }, { text: physical, width: 9 }]);
  b.row(5, GRID_LEFT, [{ text: '説明', width: 6 }, { text: `${logical}を管理する。`, width: 23 }]);
  ctx.blocks.push({ id: `${ctx.sheet}/table-info`, book: ctx.book, sheet: ctx.sheet, anchor: a1(4, GRID_LEFT), role: 'key-value' });
  heading(b, ctx, 7, 'カラム定義', 'h-columns');
  gridTable(b, ctx, { id: 'columns', row: 8, columns: TABLE_COLUMNS, rows, ...extra });
  return b.toWorksheet();
}

function tableDefBook(): { name: string; sheets: [string, (ctx: BookContext) => XLSX.WorkSheet][] } {
  const orderRows = [
    ['1', '受注番号', 'ORDER_NO', 'VARCHAR', '10', '○', '○', ''],
    ['2', '顧客コード', 'CUSTOMER_CD', 'VARCHAR', '8', '', '○', ''],
    ['3', '受注日', 'ORDER_DATE', 'DATE', '', '', '○', ''],
    ['4', '状態', 'STATUS', 'CHAR', '2', '', '○', 'コード定義参照'],
    ['', '（監査項目）', '', '', '', '', '', ''],
    ['5', '登録日時', 'CREATED_AT', 'TIMESTAMP', '', '', '○', ''],
    ['6', '更新日時', 'UPDATED_AT', 'TIMESTAMP', '', '', '○', '楽観排他に使用'],
  ];
  // Row 4 (0-based) is a full-width section row; row 6 writes 備考 one column
  // left of the header's 備考 anchor (NN narrowed to one cell) -- the
  // off-anchor value a `columns=` projection would silently drop.
  const bodyWidths = TABLE_COLUMNS.map((column) => column.width);
  const offAnchor: Span[] = [
    ...orderRows[6].slice(0, 6).map((text, i) => ({ text, width: bodyWidths[i] })),
    { text: '○', width: 1 },
    { text: '楽観排他に使用', width: 6 },
  ];
  const expectedOrderBody = orderRows.map((row, i) => (i === 4 ? ['', '（監査項目）', '', '', '', '', '', ''] : row));
  return {
    name: 'テーブル定義書_受注.xlsx',
    sheets: [
      ['表紙', (ctx) => coverSheet(ctx, '受注管理システム テーブル定義書')],
      ['改訂履歴', (ctx) => revisionSheet(ctx, 'テーブル定義書')],
      ['T_ORDER', (ctx) => tableDefSheet(ctx, '受注', 'T_ORDER', orderRows, {
        overrides: { 4: [{ text: '（監査項目）', width: GRID_WIDTH }], 6: offAnchor },
        // The full-width row lands in the No column's anchor under columns=.
        expectedBody: expectedOrderBody.map((row, i) => (i === 4 ? ['（監査項目）', '', '', '', '', '', '', ''] : row)),
        cautions: ['full-width-row', 'off-anchor-value'],
        // 備考 of the last row sits off the header anchor: columns= cannot keep it.
        expressible: false,
      })],
      ['T_ORDER_DETAIL', (ctx) => tableDefSheet(ctx, '受注明細', 'T_ORDER_DETAIL', [
        ['1', '受注番号', 'ORDER_NO', 'VARCHAR', '10', '○', '○', ''],
        ['2', '明細番号', 'LINE_NO', 'NUMBER', '3', '○', '○', ''],
        ['3', '商品コード', 'ITEM_CD', 'VARCHAR', '12', '', '○', ''],
        ['4', '数量', 'QUANTITY', 'NUMBER', '5', '', '○', ''],
        ['5', '単価', 'UNIT_PRICE', 'NUMBER', '9', '', '', '税抜'],
      ])],
      ['コード定義', (ctx) => {
        const b = new SheetBuilder();
        b.put(0, 0, '受注状態');
        ctx.blocks.push({ id: `${ctx.sheet}/title-status`, book: ctx.book, sheet: ctx.sheet, anchor: 'A1', role: 'heading' });
        const status = [['コード', '名称', '備考'], ['01', '受付', ''], ['02', '引当済', '在庫引当完了'], ['03', '出荷済', ''], ['09', '取消', '']];
        status.forEach((row, r) => row.forEach((text, c) => b.put(1 + r, c, text)));
        ctx.tables.push({ id: `${ctx.book}/${ctx.sheet}/status`, book: ctx.book, sheet: ctx.sheet, range: 'A2:C6', headers: status[0], body: status.slice(1), cautions: [], expressible: true });
        b.put(0, 4, '配送区分');
        ctx.blocks.push({ id: `${ctx.sheet}/title-delivery`, book: ctx.book, sheet: ctx.sheet, anchor: 'E1', role: 'heading' });
        const delivery = [['コード', '名称'], ['1', '通常'], ['2', '速達'], ['3', '店頭受取']];
        delivery.forEach((row, r) => row.forEach((text, c) => b.put(1 + r, 4 + c, text)));
        ctx.tables.push({ id: `${ctx.book}/${ctx.sheet}/delivery`, book: ctx.book, sheet: ctx.sheet, range: 'E2:F5', headers: delivery[0], body: delivery.slice(1), cautions: [], expressible: true });
        return b.toWorksheet();
      }],
    ],
  };
}

// ---------------------------------------------------------------------------
// Book 3: plain sheets (controls) and a two-row header
// ---------------------------------------------------------------------------

function plainBook(): { name: string; sheets: [string, (ctx: BookContext) => XLSX.WorkSheet][] } {
  return {
    name: '権限・メッセージ定義.xlsx',
    sheets: [
      ['権限マトリクス', (ctx) => {
        const b = new SheetBuilder();
        b.row(0, 0, [{ text: '機能ID', width: 1, height: 2 }, { text: '機能名', width: 1, height: 2 }, { text: 'ロール', width: 3 }]);
        b.row(1, 2, [{ text: '管理者', width: 1 }, { text: '担当者', width: 1 }, { text: '閲覧者', width: 1 }]);
        const body = [
          ['F01', '受注登録', '○', '○', '×'], ['F02', '受注照会', '○', '○', '○'], ['F03', '出荷指示', '○', '○', '×'],
          ['F04', 'マスタ保守', '○', '×', '×'], ['F05', '権限設定', '○', '×', '×'],
        ];
        body.forEach((row, r) => row.forEach((text, c) => b.put(2 + r, c, text)));
        ctx.tables.push({
          id: `${ctx.book}/${ctx.sheet}/matrix`, book: ctx.book, sheet: ctx.sheet, range: 'A1:E7',
          headers: ['機能ID', '機能名', '管理者', '担当者', '閲覧者'], body, cautions: ['multi-row-header'], expressible: false,
        });
        return b.toWorksheet();
      }],
      ['メッセージ一覧', (ctx) => {
        const b = new SheetBuilder();
        const rows = [
          ['メッセージID', '区分', 'メッセージ', '備考'],
          ['MSG-E001', 'エラー', '必須項目が入力されていません。', ''],
          ['MSG-E002', 'エラー', '在庫が不足しています。', '仮引当時'],
          ['MSG-W001', '警告', '与信限度額に近づいています。', ''],
          ['MSG-I001', '情報', '登録しました。', ''],
        ];
        rows.forEach((row, r) => row.forEach((text, c) => b.put(r, c, text)));
        ctx.tables.push({ id: `${ctx.book}/${ctx.sheet}/messages`, book: ctx.book, sheet: ctx.sheet, range: 'A1:D5', headers: rows[0], body: rows.slice(1), cautions: [], expressible: true });
        return b.toWorksheet();
      }],
    ],
  };
}

export function writeImportCorpus(dir = DEFAULT_IMPORT_CORPUS_DIR): ImportCorpus {
  fs.mkdirSync(dir, { recursive: true });
  const tables: ExpectedTable[] = [];
  const blocks: ExpectedBlock[] = [];
  const books: string[] = [];
  for (const spec of [screenBook(), tableDefBook(), plainBook()]) {
    const workbook = XLSX.utils.book_new();
    for (const [sheet, build] of spec.sheets) {
      XLSX.utils.book_append_sheet(workbook, build({ book: spec.name, sheet, tables, blocks }), sheet);
    }
    fs.writeFileSync(path.join(dir, spec.name), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    books.push(spec.name);
  }
  return { dir, books, tables, blocks };
}
