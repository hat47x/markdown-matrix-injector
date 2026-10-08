import assert from 'node:assert/strict';
import test from 'node:test';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { compileQuery } from '../src/search/nlQuery/compiler.js';
import { RegionCatalog } from '../src/search/regionCatalog.js';
import { RegionSearchIndex } from '../src/search/searchIndex.js';
import { formatAlias, parseAliasSetting, suggestAlias } from '../src/search/userAliases.js';

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

function build(): { catalog: RegionCatalog; index: RegionSearchIndex } {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/在庫方針.xlsx', { mtimeMs: 1, size: 1 }, book('容積重量換算表', [['サイズ区分', '係数'], ['60', '5000'], ['80', '6000']]));
  catalog.setBook('/ws/会議体.xlsx', { mtimeMs: 1, size: 1 }, book('会議一覧', [['会議名', '頻度'], ['定例会', '毎週'], ['運用会議', '月次']]));
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return { catalog, index };
}
const relativePath = (path: string): string => `./${path.split('/').pop()}`;
const compile = (text: string, index: RegionSearchIndex) => compileQuery(text, { index, method: 'bm25', relativePath, paraphrase: false });

test('settings entries are parsed leniently and written back in the same form', () => {
  assert.deepEqual(parseAliasSetting(['CBM=容積重量', 'DSP＝配車計画', 'bad', '=x', 'A=b', 'CBM=容積重量', 42, 'X='.padEnd(60, 'あ')]), [
    { short: 'CBM', long: '容積重量' },
    { short: 'DSP', long: '配車計画' },
  ]);
  assert.deepEqual(parseAliasSetting(undefined), []);
  assert.equal(formatAlias({ short: 'CBM', long: '容積重量' }), 'CBM=容積重量');
});

test('a registered pair makes the abbreviation find the table, and clearing it removes that', () => {
  const { catalog, index } = build();
  assert.equal(compile('CBMの係数を貼りたい', index).candidates.length, 0);
  catalog.setUserPairs([{ short: 'CBM', long: '容積重量' }]);
  index.sync();
  const found = compile('CBMの係数を貼りたい', index).candidates[0];
  assert.equal(found?.region.sheet, '容積重量換算表');
  assert.equal(found?.basis, 'glossary');
  assert.match(found?.notes.join(' ') ?? '', /利用者が登録した別名/u);
  assert.ok((found?.fit ?? 1) <= 0.8);
  catalog.setUserPairs([]);
  index.sync();
  assert.equal(compile('CBMの係数を貼りたい', index).candidates.length, 0);
});

test('an alias is offered only for the one abbreviation-like word the table does not contain', () => {
  const { catalog } = build();
  const region = catalog.regions().find((candidate) => candidate.sheet === '容積重量換算表')!;
  assert.deepEqual(suggestAlias('CBMの係数を貼りたい', region), { short: 'CBM', long: '容積重量換算表' });
  // Two unknown words, or none, or a word the table already contains: nothing is guessed.
  assert.equal(suggestAlias('CBMとDSPの表', region), undefined);
  assert.equal(suggestAlias('容積重量の表', region), undefined);
  assert.equal(suggestAlias('サイズ区分のSizeの表', { ...region, headers: ['Size', '係数'] }), undefined);
});
