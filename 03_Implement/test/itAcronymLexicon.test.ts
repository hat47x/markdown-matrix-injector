import assert from 'node:assert/strict';
import test from 'node:test';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { DEFAULT_SYNONYMS } from '../src/search/workspaceRegionIndex.js';
import { IT_ACRONYM_GROUPS, IT_ACRONYM_LEXICON } from '../src/search/lexicon/itAcronyms.js';
import { compileQuery, variantsOf } from '../src/search/nlQuery/compiler.js';
import { RegionCatalog } from '../src/search/regionCatalog.js';
import { RegionSearchIndex } from '../src/search/searchIndex.js';

function sheet(rows: string[][]): SheetSource {
  const map = new Map<string, SourceCell>();
  rows.forEach((cells, r) => cells.forEach((text, c) => map.set(`${r},${c}`, { text, type: 's', value: text })));
  const width = Math.max(...rows.map((cells) => cells.length));
  return {
    usedRange: { startRow: 0, startCol: 0, endRow: rows.length - 1, endCol: width - 1 },
    merges: [],
    cellAt: (row, col) => map.get(`${row},${col}`),
  };
}

const book = (name: string, rows: string[][]): WorkbookData => ({ sheets: { [name]: sheet(rows) } });

function build(): RegionSearchIndex {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/要件定義書.xlsx', { mtimeMs: 1, size: 1 }, book('非機能要件', [['分類', '要件', '測定方法'], ['性能', '応答3秒', '負荷試験'], ['可用性', '99.9%', '稼働率']]));
  catalog.setBook('/ws/変更管理台帳.xlsx', { mtimeMs: 1, size: 1 }, book('変更要求', [['件名', '起票者', '影響度'], ['項目追加', '佐藤', '中'], ['帳票変更', '鈴木', '小']]));
  catalog.setBook('/ws/基盤設計書.xlsx', { mtimeMs: 1, size: 1 }, book('ネットワーク', [['セグメント', 'アドレス', '用途'], ['DMZ', '10.0.1.0/24', '公開'], ['内部', '10.0.2.0/24', '業務']]));
  catalog.setBook('/ws/運用設計書.xlsx', { mtimeMs: 1, size: 1 }, book('バックアップ', [['対象', '世代数', '保管場所'], ['DB', '7', '別拠点'], ['設定', '3', '別拠点']]));
  catalog.setBook('/ws/画面設計書.xlsx', { mtimeMs: 1, size: 1 }, book('画面一覧', [['画面ID', '画面名', '備考'], ['S001', '受注登録', ''], ['S002', '受注照会', '']]));
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return index;
}

const relativePath = (path: string): string => `./${path.split('/').pop()}`;
const compile = (text: string, synonyms: readonly (readonly string[])[]) =>
  compileQuery(text, { index: build(), method: 'bm25', relativePath, synonyms, paraphrase: false });
const topSheet = (text: string, synonyms: readonly (readonly string[])[]): string | undefined => {
  const top = compile(text, synonyms).candidates[0];
  return top ? top.region.sheet : undefined;
};

test('an acronym reaches a table named by its formal name, and only through the lexicon', () => {
  const cases: [string, string][] = [
    ['NFRの分類と測定方法を貼りたい', '非機能要件'],
    ['CRの件名と影響度を見せて', '変更要求'],
    ['N/Wのアドレスを見せて', 'ネットワーク'],
    ['BKUPの世代数と保管場所の表', 'バックアップ'],
  ];
  for (const [text, expected] of cases) {
    assert.equal(topSheet(text, []), undefined, `without the lexicon: ${text}`);
    assert.equal(topSheet(text, IT_ACRONYM_GROUPS), expected, `with the lexicon: ${text}`);
  }
});

test('the lexicon only widens retrieval: candidates stay inferred-by-name and nothing is confirmed', () => {
  const result = compile('CRの件名と影響度を見せて', IT_ACRONYM_GROUPS);
  assert.equal(result.status, 'candidates');
  assert.ok(result.candidates.length >= 1);
  // A request that names no table still finds nothing, with or without the lexicon.
  assert.equal(compile('FWの許可ルールを貼りたい', IT_ACRONYM_GROUPS).candidates.length, 0);
});

test('a Latin-letter term matches only as a whole word', () => {
  const groups = [['OS', 'オペレーティングシステム'], ['N/W', 'ネットワーク']];
  assert.equal(variantsOf('POST一覧', groups).length, 1, '"OS" inside "POST"');
  assert.equal(variantsOf('OS一覧', groups).length, 2);
  assert.equal(variantsOf('os一覧', groups).length, 2, 'case-insensitive');
  assert.equal(variantsOf('N/Wの表', groups).length, 2, 'a symbol inside the term');
  assert.equal(variantsOf('ネットワークOS', groups).length, 3, 'a Japanese term matches next to Latin letters');
});

test('the lexicon is built from two-member groups without ambiguous short forms or duplicates', () => {
  assert.ok(IT_ACRONYM_GROUPS.length >= 100);
  assert.ok(IT_ACRONYM_GROUPS.every((group) => group.length === 2));
  const left = new Set<string>();
  for (const entry of IT_ACRONYM_LEXICON) {
    for (const short of entry.short) {
      const key = short.normalize('NFKC').toLowerCase();
      assert.ok(!left.has(key), `short form listed twice: ${short}`);
      left.add(key);
    }
  }
  // Forms that mean something else in everyday business use stay out (ADR-0023).
  for (const banned of ['id', 'it', 'ap', 'pl']) assert.ok(!left.has(banned), banned);
  assert.ok(DEFAULT_SYNONYMS.length > IT_ACRONYM_GROUPS.length);
});
