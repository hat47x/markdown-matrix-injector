import assert from 'node:assert/strict';
import test from 'node:test';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { pairsInText } from '../src/search/lexicon/documentGlossary.js';
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

const GLOSSARY = book('略語一覧', [
  ['略称', '正式名称', '備考'],
  ['DSP', '配車計画', '社内用語'],
  ['TPL', '外部委託倉庫', ''],
]);
const DISPATCH = book('配車計画', [['便ID', '行先', '出発'], ['T01', '東京', '08:00'], ['T02', '大阪', '09:30']]);
const CONTRACT = book('外部委託倉庫契約', [['委託先', '契約期間', '単価'], ['甲社', '2026', '100'], ['乙社', '2027', '120']]);
const OVERVIEW = book('システム構成', [
  ['コンポーネント', '概要'],
  ['ネットワーク（N/W）機器', '拠点間接続'],
  ['システムのキャパシティ計画（CAP）', '年次'],
]);
const NETWORK = book('ネットワーク構成', [['機器', '設置場所', '台数'], ['ルータ', '本社', '2'], ['スイッチ', '本社', '8']]);
const CAPACITY = book('キャパシティ計画表', [['年度', '想定量', '備考'], ['2026', '100', ''], ['2027', '120', '']]);

function build(withGlossary = true): RegionSearchIndex {
  const catalog = new RegionCatalog();
  if (withGlossary) {
    catalog.setBook('/ws/用語集.xlsx', { mtimeMs: 1, size: 1 }, GLOSSARY);
    catalog.setBook('/ws/システム概要.xlsx', { mtimeMs: 1, size: 1 }, OVERVIEW);
  }
  catalog.setBook('/ws/配送設計書.xlsx', { mtimeMs: 1, size: 1 }, DISPATCH);
  catalog.setBook('/ws/委託契約.xlsx', { mtimeMs: 1, size: 1 }, CONTRACT);
  catalog.setBook('/ws/基盤設計.xlsx', { mtimeMs: 1, size: 1 }, NETWORK);
  catalog.setBook('/ws/計画書.xlsx', { mtimeMs: 1, size: 1 }, CAPACITY);
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return index;
}

const relativePath = (path: string): string => `./${path.split('/').pop()}`;
const compile = (text: string, index: RegionSearchIndex, derivedGlossary?: boolean) =>
  compileQuery(text, { index, method: 'bm25', relativePath, paraphrase: false, ...(derivedGlossary === undefined ? {} : { derivedGlossary }) });

test('both written forms of a pair are read, and a particle ends the formal name', () => {
  assert.deepEqual(pairsInText('ネットワーク（N/W）機器', 'x').map((p) => [p.short, p.long]), [['N/W', 'ネットワーク']]);
  assert.deepEqual(pairsInText('WBS（作業分解構造）', 'x').map((p) => [p.short, p.long]), [['WBS', '作業分解構造']]);
  assert.deepEqual(pairsInText('システムのキャパシティ計画（CAP）', 'x').map((p) => [p.short, p.long]), [['CAP', 'キャパシティ計画']]);
  // Full-width brackets are read like half-width ones; a bracket that is not an abbreviation yields nothing.
  assert.deepEqual(pairsInText('受注（ORD）', 'x').map((p) => [p.short, p.long]), [['ORD', '受注']]);
  assert.deepEqual(pairsInText('受注（月次）', 'x'), []);
});

test('the catalog collects pairs from a glossary table and from other tables, with where they were found', () => {
  const pairs = build().glossaryPairs();
  const byShort = new Map(pairs.map((pair) => [pair.short, pair]));
  assert.equal(byShort.get('DSP')?.long, '配車計画');
  assert.equal(byShort.get('DSP')?.kind, 'glossary-table');
  assert.match(byShort.get('DSP')?.origin ?? '', /用語集/u);
  assert.equal(byShort.get('N/W')?.kind, 'parenthetical');
  assert.equal(byShort.get('CAP')?.long, 'キャパシティ計画');
});

test('an abbreviation written in the user\'s own documents reaches the table named by its formal name', () => {
  const cases: [string, string][] = [
    ['DSPの便IDと行先を見せて', '配車計画'],
    ['TPLの契約期間の表', '外部委託倉庫契約'],
    ['N/Wの設置場所を貼りたい', 'ネットワーク構成'],
    ['CAPの想定量を見せて', 'キャパシティ計画表'],
  ];
  for (const [text, sheetName] of cases) {
    const without = compile(text, build(false));
    assert.equal(without.candidates.length, 0, `no documents, no pair: ${text}`);
    const result = compile(text, build());
    assert.equal(result.candidates[0]?.region.sheet, sheetName, text);
    const top = result.candidates[0];
    assert.equal(top.basis, 'glossary');
    assert.match(top.notes.join(' '), /文書内の記載/u);
    assert.ok(top.fit !== undefined && top.fit <= 0.8, `fit stays modest through a pair: ${top.fit}`);
  }
  // Ablation switch: with the pairs ignored, the same workspace finds nothing.
  assert.equal(compile('DSPの便IDと行先を見せて', build(), false).candidates.length, 0);
});

test('the reverse direction works too, and an unrelated abbreviation still finds nothing', () => {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/用語集.xlsx', { mtimeMs: 1, size: 1 }, GLOSSARY);
  catalog.setBook('/ws/配送設計書.xlsx', { mtimeMs: 1, size: 1 }, book('DSP', [['便ID', '行先'], ['T01', '東京'], ['T02', '大阪']]));
  const index = new RegionSearchIndex(catalog);
  index.sync();
  assert.equal(compile('配車計画の便IDと行先', index).candidates[0]?.region.sheet, 'DSP');
  assert.equal(compile('XYZの便ID', build()).candidates.length, 0);
});

test('fit is a modest 0-1 guide: full for a plain name match, lower with missing columns, capped for weaker evidence', () => {
  const index = build();
  const plain = compile('配車計画の便IDと行先を見せて', index).candidates[0];
  assert.ok(plain && plain.fit !== undefined && plain.fit >= 0.9 && plain.fit <= 1, `plain: ${plain?.fit}`);
  const missing = compile('配車計画の便IDと重量を見せて', index).candidates[0];
  assert.ok(missing && missing.fit !== undefined && missing.fit < plain.fit!, `missing column: ${missing?.fit}`);
  // Every candidate and near miss carries a value in [0, 1].
  for (const text of ['配車計画の表', '契約期間の表', 'DSPの表']) {
    const result = compile(text, index);
    for (const candidate of [...result.candidates, ...(result.nearMisses ?? [])]) {
      assert.ok(candidate.fit !== undefined && candidate.fit >= 0 && candidate.fit <= 1, text);
    }
  }
});

test('the fit label is shown modestly, with two decimals, and only when there is a value', async () => {
  const { fitLabel, withFit } = await import('../src/search/fitLabel.js');
  assert.equal(fitLabel(0.8), '適合度 0.80');
  assert.equal(fitLabel(undefined), '');
  assert.equal(withFit('設計書 / 画面一覧 A1:D5', 0.725), '設計書 / 画面一覧 A1:D5 ・ 適合度 0.72');
  assert.equal(withFit('設計書 / 画面一覧 A1:D5', undefined), '設計書 / 画面一覧 A1:D5');
});

test('a synonym written in Latin letters matches only as a whole word', () => {
  const groups = [['OS', 'オペレーティングシステム'], ['N/W', 'ネットワーク']];
  assert.equal(variantsOf('POST一覧', groups).length, 1, '"OS" inside "POST"');
  assert.equal(variantsOf('OS一覧', groups).length, 2);
  assert.equal(variantsOf('os一覧', groups).length, 2, 'case-insensitive');
  assert.equal(variantsOf('N/Wの表', groups).length, 2, 'a symbol inside the term');
  assert.equal(variantsOf('ネットワークOS', groups).length, 3, 'a Japanese term matches next to Latin letters');
});
