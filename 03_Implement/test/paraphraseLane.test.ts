import test from 'node:test';
import assert from 'node:assert/strict';

import type { CellRange, SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { compileQuery } from '../src/search/nlQuery/compiler.js';
import { isDescriptionQuestion, paraphraseMatches } from '../src/search/nlQuery/paraphrase.js';
import { RegionCatalog } from '../src/search/regionCatalog.js';
import { RegionSearchIndex } from '../src/search/searchIndex.js';

function sheet(rows: string[][], origin = { row: 0, col: 0 }, title?: string, merges: CellRange[] = []): SheetSource {
  const map = new Map<string, SourceCell>();
  const put = (row: number, col: number, text: string): void => {
    map.set(`${row},${col}`, { text, type: 's', value: text });
  };
  if (title) put(origin.row, origin.col, title);
  const top = origin.row + (title ? 1 : 0);
  rows.forEach((cells, r) => cells.forEach((text, c) => put(top + r, origin.col + c, text)));
  const width = Math.max(...rows.map((cells) => cells.length));
  return {
    usedRange: { startRow: origin.row, startCol: origin.col, endRow: top + rows.length - 1, endCol: origin.col + width - 1 },
    merges,
    cellAt: (row, col) => map.get(`${row},${col}`),
  };
}

const MEETING: WorkbookData = {
  sheets: {
    会議体一覧: sheet([
      ['会議名', '開催頻度', '目的', '主催'],
      ['定例会', '毎週', '進捗共有', '鈴木'],
      ['リリース判定会', '月次', '判定', '佐藤'],
    ]),
  },
};
const TRAINING: WorkbookData = {
  sheets: {
    研修計画: sheet([
      ['研修名', '対象者', '実施日', '講師'],
      ['新人研修', '新入社員', '4/10', '田中'],
      ['運用研修', '運用担当', '5/20', '高橋'],
    ]),
  },
};
const TESTCASE: WorkbookData = {
  sheets: {
    テストケース: sheet(
      [
        ['試験ID', '試験項目', '手順', '期待結果', '結果'],
        ['IT-001', '受注登録から出荷まで', '画面から登録', '出荷済になる', 'OK'],
        ['IT-002', '在庫不足時の保留', 'APIから登録', '保留になる', 'NG'],
      ],
      { row: 0, col: 0 },
      '結合テストケース（受注）',
    ),
  },
};
const SURVEY: WorkbookData = {
  sheets: {
    アンケート: sheet([
      ['設問', '回答数'],
      ['満足度', '12'],
      ['要望', '3'],
    ]),
  },
};

function build(): RegionSearchIndex {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/会議運営.xlsx', { mtimeMs: 1, size: 1 }, MEETING);
  catalog.setBook('/ws/教育計画.xlsx', { mtimeMs: 1, size: 1 }, TRAINING);
  catalog.setBook('/ws/結合試験.xlsx', { mtimeMs: 1, size: 1 }, TESTCASE);
  catalog.setBook('/ws/調査.xlsx', { mtimeMs: 1, size: 1 }, SURVEY);
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return index;
}
const relativePath = (path: string): string => `./${path.split('/').pop()}`;
const compile = (text: string, paraphrase?: boolean) =>
  compileQuery(text, { index: build(), method: 'bm25', relativePath, ...(paraphrase === undefined ? {} : { paraphrase }) });

test('a question that describes a table is recognised; an imperative task is not', () => {
  assert.equal(isDescriptionQuestion('どの会議をどれくらいの頻度で何のために開くか'), true);
  assert.equal(isDescriptionQuestion('研修を誰向けにいつやって誰が教えるか？'), true);
  assert.equal(isDescriptionQuestion('会議の件数を集計して'), false);
  assert.equal(isDescriptionQuestion('会議体一覧を見せて'), false);
});

test('paraphrase: a description with no table word finds the table whose structure fits', () => {
  const result = compile('どの会議をどれくらいの頻度で何のために開くか');
  assert.equal(result.status, 'candidates');
  assert.equal(result.requiresSelection, true);
  assert.equal(result.candidates[0].basis, 'paraphrase');
  assert.match(result.candidates[0].markdown, /会議体一覧\|A1:D3/u);
  assert.match(result.candidates[0].notes.join(''), /推定した候補/u);

  const training = compile('研修を誰向けにいつやって誰が教えるか');
  assert.equal(training.status, 'candidates');
  assert.match(training.candidates[0].markdown, /研修計画/u);
});

test('paraphrase: the lane can be switched off for ablation, restoring the old no-match', () => {
  assert.equal(compile('どの会議をどれくらいの頻度で何のために開くか', false).status, 'no-match');
});

test('paraphrase: a topic needs the structure too, and two katakana letters are not a topic', () => {
  const matches = paraphraseMatches('顧客満足度アンケートの結果はどうなっているか', [
    ...build().bookPaths().flatMap((path) => build().docsOfBook(path).map((doc) => build().region(doc)!)),
  ]);
  // アンケート exists as a sheet name and 結果 as a header -> allowed; テストケース (ケー accident) is not.
  assert.ok(matches.every((match) => !/テストケース/u.test(match.region.sheet)));
});

test('paraphrase: nothing is offered for a table that does not exist', () => {
  const result = compile('社員の入退室はいつどこで記録するか');
  assert.notEqual(result.status, 'candidates');
});

test('paraphrase: a bare noun phrase is only a near miss, never a candidate', () => {
  // 総合 is not 結合: the structure fits the 結合テストケース table, but the name does not.
  const result = compile('総合テストケースの試験項目と期待結果');
  assert.notEqual(result.status, 'candidates');
});

test('paraphrase: an imperative aggregation request stays unsupported', () => {
  const result = compile('会議の開催頻度ごとの件数を集計して');
  assert.equal(result.status, 'unsupported');
});

test('paraphrase: a question that carries an inexpressible condition says it was not applied', () => {
  const result = compile('どの値を超えたら誰に知らせるか、研修の担当は誰か');
  if (result.status === 'candidates') {
    assert.match(result.candidates[0].notes.join(''), /反映していません/u);
  } else {
    assert.ok(['unsupported', 'no-match'].includes(result.status));
  }
});

test('frozen CPU search v5 evidence input keeps its exact Git blob', async () => {
  const { default: fs } = await import('node:fs');
  const { gitBlobSha, TEST5_CATEGORY_COUNTS, TEST5_QUERY_BLOB_SHA, TEST5_QUERY_COUNT } = await import('../scripts/cpu-search-eval/test5-first-run.js');
  const bytes = fs.readFileSync(new URL('../scripts/cpu-search-eval/queries.test5.json', import.meta.url));
  assert.equal(gitBlobSha(bytes), TEST5_QUERY_BLOB_SHA);
  const queries = JSON.parse(bytes.toString('utf8')) as Array<{ category: string }>;
  assert.equal(queries.length, TEST5_QUERY_COUNT);
  const counts: Record<string, number> = {};
  for (const query of queries) counts[query.category] = (counts[query.category] ?? 0) + 1;
  assert.deepEqual(counts, TEST5_CATEGORY_COUNTS);
});
