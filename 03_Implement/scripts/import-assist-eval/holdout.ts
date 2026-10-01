/**
 * Held-out stress cases for the import-assistance prototype
 * (02_Architecture/import-assistance.md §6.3).
 *
 * Written after the prototype, by the same developer, to attack the rules it
 * is known to rely on: blank-row segmentation, the "four rows or fewer" and
 * label-suffix rules for key/value frames, the single-row header, and the
 * body-alignment test. It is not blind. Its first run is recorded as-is,
 * before any fix; numbers after a fix are reported separately.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { a1, rangeA1, SheetBuilder, type ExpectedBlock, type ExpectedTable, type ImportCorpus } from './corpus.js';

export const DEFAULT_HOLDOUT_DIR = path.join(os.tmpdir(), 'mmi-import-assist-eval', 'holdout');
const BOOK = '取り込み_追加ケース.xlsx';

interface Case {
  sheet: string;
  build: (b: SheetBuilder, expect: Expect) => void;
}

interface Expect {
  table: (range: string, headers: string[], body: string[][], options?: { cautions?: ExpectedTable['cautions']; expressible?: boolean }) => void;
  block: (anchor: string, role: ExpectedBlock['role']) => void;
}

const L = 1;
const W = 29;

/** Writes a grid table from `row`; body rows share the header widths. Returns the next free row. */
function grid(b: SheetBuilder, row: number, widths: number[], header: string[], body: string[][], col = L): number {
  b.row(row, col, header.map((text, i) => ({ text, width: widths[i] })));
  body.forEach((values, i) => b.row(row + 1 + i, col, values.map((text, j) => ({ text, width: widths[j] }))));
  return row + 1 + body.length;
}

function lastCol(widths: number[], col = L): number {
  return col + widths.reduce((sum, width) => sum + width, 0) - 1;
}

const CASES: Case[] = [
  {
    // H1: two tables separated only by a heading row, no blank rows. The
    // second header lines up with the first table's anchors.
    sheet: 'H1_連続する表',
    build: (b, expect) => {
      const w1 = [2, 6, 6, 3, 12];
      b.row(0, L, [{ text: '2. 画面項目', width: W }]);
      const items = [['1', '顧客コード', 'customerCode', '文字', '顧客検索から選択'], ['2', '受注日', 'orderDate', '日付', '初期値は当日']];
      let at = grid(b, 1, w1, ['No', '項目名', '項目ID', '型', '備考'], items);
      expect.table(rangeA1(1, L, at - 1, lastCol(w1)), ['No', '項目名', '項目ID', '型', '備考'], items);
      b.row(at, L, [{ text: '3. イベント', width: W }]);
      expect.block(a1(at, L), 'heading');
      const w2 = [2, 6, 21];
      const events = [['1', '初期表示', '受注日に当日を設定する。'], ['2', '登録', '受注を登録する。']];
      const top = at + 1;
      at = grid(b, top, w2, ['No', 'イベント', '処理概要'], events);
      expect.table(rangeA1(top, L, at - 1, lastCol(w2)), ['No', 'イベント', '処理概要'], events);
    },
  },
  {
    // H2: a six-row key/value frame whose first row has no date or number.
    sheet: 'H2_長い属性枠',
    build: (b, expect) => {
      const pairs = [['システム名', '受注管理', '文書名', '画面定義書'], ['サブシステム', '受注', '画面名', '受注登録'], ['作成者', '架空 太郎', '作成日', '2026/08/01'],
        ['更新者', '架空 花子', '更新日', '2026/08/20'], ['承認者', '架空 次郎', '承認日', '2026/08/25'], ['対象', '本番', '区分', '新規']];
      pairs.forEach((row, i) => b.row(i, L, row.map((text, j) => ({ text, width: j % 2 === 0 ? 5 : 9 }))));
      expect.block(a1(0, L), 'key-value');
    },
  },
  {
    // H3: an item-definition table whose values look like labels (名, 者, 日).
    sheet: 'H3_ラベル風の値',
    build: (b, expect) => {
      const w = [6, 3, 6, 2];
      const body = [['顧客名', '文字', '顧客名', '○'], ['担当者', '文字', '担当者名', '○'], ['受注日', '日付', '受注日', '○']];
      const at = grid(b, 0, w, ['項目名', '型', '表示名', '必須'], body);
      expect.table(rangeA1(0, L, at - 1, lastCol(w)), ['項目名', '型', '表示名', '必須'], body);
    },
  },
  {
    // H4: one table with a blank row between two groups of rows.
    sheet: 'H4_表内の空行',
    build: (b, expect) => {
      const w = [2, 8, 8];
      b.row(0, L, [{ text: '機能一覧', width: 18 }]);
      expect.block(a1(0, L), 'heading');
      grid(b, 1, w, ['No', '機能名', '分類'], [['1', '受注登録', 'オンライン'], ['2', '受注照会', 'オンライン']]);
      grid(b, 5, w, ['3', '日次締め', 'バッチ'], [['4', '月次集計', 'バッチ']]);
      expect.table(rangeA1(1, L, 6, lastCol(w)), ['No', '機能名', '分類'], [['1', '受注登録', 'オンライン'], ['2', '受注照会', 'オンライン'], ['', '', ''], ['3', '日次締め', 'バッチ'], ['4', '月次集計', 'バッチ']]);
    },
  },
  {
    // H5: every header cell is two rows tall; the second physical row renders empty.
    sheet: 'H5_背の高い見出し',
    build: (b, expect) => {
      const widths = [3, 8, 6];
      b.row(0, L, [{ text: 'No', width: 3, height: 2 }, { text: '帳票名', width: 8, height: 2 }, { text: '出力形式', width: 6, height: 2 }]);
      const body = [['1', '受注明細書', 'PDF'], ['2', '出荷案内書', 'PDF']];
      body.forEach((values, i) => b.row(2 + i, L, values.map((text, j) => ({ text, width: widths[j] }))));
      expect.table(rangeA1(0, L, 3, lastCol(widths)), ['No', '帳票名', '出力形式'], body, { cautions: ['vertical-merge'], expressible: false });
    },
  },
  {
    // H6: a header of years (values that look like numbers).
    sheet: 'H6_年度の見出し',
    build: (b, expect) => {
      const rows = [['指標', '2024', '2025', '2026'], ['受注件数', '1200', '1350', '1500'], ['出荷件数', '1180', '1320', '1480']];
      rows.forEach((row, r) => row.forEach((text, c) => b.put(r, c, text)));
      expect.table('A1:D3', rows[0], rows.slice(1));
    },
  },
  {
    // H7: a note right under the table, written in the first column.
    sheet: 'H7_表直下の注記',
    build: (b, expect) => {
      const w = [2, 8, 6];
      const body = [['1', '受注明細書', '日次'], ['2', '請求予定表', '月次']];
      const at = grid(b, 0, w, ['No', '帳票名', '頻度'], body);
      b.row(at, L, [{ text: '※金額は税抜', width: 5 }]);
      expect.table(rangeA1(0, L, at - 1, lastCol(w)), ['No', '帳票名', '頻度'], body);
      expect.block(a1(at, L), 'prose');
    },
  },
  {
    // H8: a key/value frame whose labels have no common suffix.
    sheet: 'H8_接尾辞のない属性',
    build: (b, expect) => {
      const rows = [['ステータス', 'レビュー中', 'バージョン', '0.9'], ['URL', 'https://example.invalid/', 'リポジトリ', 'order-app']];
      rows.forEach((row, i) => b.row(i, L, row.map((text, j) => ({ text, width: j % 2 === 0 ? 5 : 9 }))));
      expect.block(a1(0, L), 'key-value');
    },
  },
  {
    // H9: a 方眼紙 table with a blank header over a check column.
    sheet: 'H9_空の見出し',
    build: (b, expect) => {
      const w = [2, 2, 8, 6];
      const body = [['1', '○', '受注登録', '架空 太郎'], ['2', '', '受注照会', '架空 花子']];
      const at = grid(b, 0, w, ['No', '', '機能名', '担当者'], body);
      expect.table(rangeA1(0, L, at - 1, lastCol(w)), ['No', '', '機能名', '担当者'], body);
    },
  },
  {
    // H10: two 方眼紙 tables side by side, one blank column apart.
    sheet: 'H10_横並びの表',
    build: (b, expect) => {
      const w = [4, 6];
      const left = [['01', '受付'], ['02', '引当済']];
      const right = [['1', '通常'], ['2', '速達']];
      grid(b, 0, w, ['コード', '受注状態'], left);
      grid(b, 0, w, ['コード', '配送区分'], right, 12);
      expect.table(rangeA1(0, L, 2, lastCol(w)), ['コード', '受注状態'], left);
      expect.table(rangeA1(0, 12, 2, lastCol(w, 12)), ['コード', '配送区分'], right);
    },
  },
];

export function writeHoldoutCorpus(dir = DEFAULT_HOLDOUT_DIR): ImportCorpus {
  fs.mkdirSync(dir, { recursive: true });
  const tables: ExpectedTable[] = [];
  const blocks: ExpectedBlock[] = [];
  const workbook = XLSX.utils.book_new();
  for (const testCase of CASES) {
    const b = new SheetBuilder();
    testCase.build(b, {
      table: (range, headers, body, options = {}) => tables.push({
        id: `${BOOK}/${testCase.sheet}/${range}`, book: BOOK, sheet: testCase.sheet, range, headers, body,
        cautions: options.cautions ?? [], expressible: options.expressible ?? true,
      }),
      block: (anchor, role) => blocks.push({ id: `${testCase.sheet}/${anchor}`, book: BOOK, sheet: testCase.sheet, anchor, role }),
    });
    XLSX.utils.book_append_sheet(workbook, b.toWorksheet(), testCase.sheet);
  }
  fs.writeFileSync(path.join(dir, BOOK), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return { dir, books: [BOOK], tables, blocks };
}

