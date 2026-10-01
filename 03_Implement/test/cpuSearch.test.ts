import test from 'node:test';
import assert from 'node:assert/strict';

import type { CellRange, SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';
import { tokenize } from '../src/search/nlQuery/lexer.js';
import { parseQuery } from '../src/search/nlQuery/parser.js';
import { compileQuery } from '../src/search/nlQuery/compiler.js';
import { detectRegions } from '../src/search/regionDetector.js';
import { indexWorkbookFiles, RegionCatalog, type BookStat } from '../src/search/regionCatalog.js';
import { FlyHashRetriever } from '../src/search/retrievers.js';
import { RegionSearchIndex, RETRIEVAL_METHODS } from '../src/search/searchIndex.js';
import { addTextFeatures, bigramDice, normalizeText } from '../src/search/textFeatures.js';

/** Sparse sheet at an arbitrary origin; numeric-looking text is typed `n`. */
function sheet(cells: Record<string, string>, merges: CellRange[] = []): SheetSource {
  const map = new Map<string, SourceCell>();
  let used: { startRow: number; startCol: number; endRow: number; endCol: number } | undefined;
  for (const [ref, text] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/u.exec(ref);
    if (!match) throw new Error(ref);
    const col = [...match[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const row = Number(match[2]) - 1;
    const numeric = /^-?\d+(\.\d+)?$/u.test(text);
    map.set(`${row},${col}`, { text, type: numeric ? 'n' : 's', value: numeric ? Number(text) : text });
    used = used
      ? {
          startRow: Math.min(used.startRow, row),
          startCol: Math.min(used.startCol, col),
          endRow: Math.max(used.endRow, row),
          endCol: Math.max(used.endCol, col),
        }
      : { startRow: row, startCol: col, endRow: row, endCol: col };
  }
  return { usedRange: used, merges, cellAt: (row, col) => map.get(`${row},${col}`) };
}

/** Lays a table out from `origin` (e.g. "B3"): rows of cells. */
function table(origin: string, rows: string[][]): Record<string, string> {
  const match = /^([A-Z])(\d+)$/u.exec(origin)!;
  const col0 = match[1].charCodeAt(0) - 65;
  const row0 = Number(match[2]);
  const out: Record<string, string> = {};
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value !== '') out[`${String.fromCharCode(65 + col0 + c)}${row0 + r}`] = value;
    }),
  );
  return out;
}

const DESIGN: WorkbookData = {
  sheets: {
    状態遷移: sheet({
      B1: '状態遷移表',
      ...table('B3', [
        ['ID', '現在状態', '操作', '遷移先'],
        ['1', '未申請', '申請', '申請中'],
        ['2', '申請中', '承認', '承認済'],
        ['3', '申請中', '差戻し', '未申請'],
      ]),
      ...table('B9', [
        ['画面ID', '画面名'],
        ['S01', 'ログイン'],
        ['S02', 'メニュー'],
      ]),
    }),
  },
};

const RELEASE: WorkbookData = {
  sheets: {
    判定: sheet(
      {
        A1: 'リリース判定',
        ...table('A2', [
          ['No', '確認項目', '判定', '担当者'],
          ['1', '性能試験', 'OK', '佐藤'],
          ['2', '脆弱性診断', '要確認', '鈴木'],
          ['3', '移行リハーサル', '要確認', '佐藤'],
        ]),
      },
      [{ startRow: 0, startCol: 0, endRow: 0, endCol: 3 }],
    ),
  },
};

const DUPLICATE: WorkbookData = {
  sheets: {
    権限: sheet({
      A1: '権限マトリクス',
      ...table('A2', [
        ['機能', '参照', '参照', '更新'],
        ['受注', '1', '1', '0'],
        ['請求', '1', '0', '0'],
      ]),
    }),
  },
};

const INTEGRATION_TEST: WorkbookData = {
  sheets: {
    テストケース: sheet({
      A1: '結合テストケース（受注）',
      ...table('A2', [
        ['試験ID', '試験項目', '手順', '期待結果', '結果'],
        ['IT-001', '受注登録から出荷まで', '画面から登録', '出荷済になる', 'OK'],
        ['IT-002', '在庫不足時の保留', 'APIから登録', '保留になる', 'NG'],
      ]),
    }),
  },
};

function buildIndex(): { catalog: RegionCatalog; index: RegionSearchIndex } {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/設計.xlsx', { mtimeMs: 1, size: 1 }, DESIGN);
  catalog.setBook('/ws/リリース判定.xlsx', { mtimeMs: 1, size: 1 }, RELEASE);
  catalog.setBook('/ws/権限.xlsx', { mtimeMs: 1, size: 1 }, DUPLICATE);
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return { catalog, index };
}

const relativePath = (path: string): string => `./${path.split('/').pop()}`;

// --- text features ----------------------------------------------------------

test('normalizeText folds width, case and hiragana onto one form', () => {
  assert.equal(normalizeText('ＩＤ　けんさく'), 'id ケンサク');
  assert.ok(bigramDice('操作', '操作内容') >= 0.5);
  assert.equal(bigramDice('ｽﾃｰﾀｽ', 'ステータス'), 1);
});

test('addTextFeatures counts a repeated feature once per text', () => {
  const bag = new Map<string, number>();
  addTextFeatures(bag, '申請 申請', 2);
  assert.equal(bag.get('w:申請'), 2);
});

// --- lexer / parser ---------------------------------------------------------

test('lexer: maximal munch, particles only after non-hiragana, compounds merged', () => {
  const kinds = (input: string): string[] => tokenize(input).map((t) => `${t.kind}:${t.text}`);
  assert.deepEqual(kinds('状態遷移表のIDと操作を見せて'), [
    'WORD:状態遷移',
    'TABLE:表',
    'PARTICLE:の',
    'WORD:ID',
    'PARTICLE:と',
    'WORD:操作',
    'PARTICLE:を',
    'VERB:見せて',
  ]);
  assert.deepEqual(kinds('代表者とまとめ'), ['WORD:代表者', 'PARTICLE:と', 'WORD:まとめ']);
  // An unsupported marker never merges away; a column with such a name is quoted.
  assert.deepEqual(kinds('合計金額を見せて'), ['UNSUPPORTED:合計', 'WORD:金額', 'PARTICLE:を', 'VERB:見せて']);
  assert.deepEqual(kinds('「合計金額」を見せて'), ['QUOTED:合計金額', 'PARTICLE:を', 'VERB:見せて']);
  assert.deepEqual(kinds('設計書.xlsxのA1:C5'), ['FILENAME:設計書.xlsx', 'PARTICLE:の', 'RANGE:A1:C5']);
});

test('lexer: spans point into the original, un-normalized input', () => {
  const input = '「要確認」を含むＩＤ';
  const tokens = tokenize(input);
  const quoted = tokens.find((t) => t.kind === 'QUOTED')!;
  assert.equal(input.slice(quoted.span.start, quoted.span.end), '「要確認」');
  const word = tokens.find((t) => t.kind === 'WORD')!;
  assert.equal(word.text, 'ID');
  assert.equal(input.slice(word.span.start, word.span.end), 'ＩＤ');
});

test('parser: table, columns and a row-wide contains condition', () => {
  const ir = parseQuery('状態遷移表のIDと操作を見せて');
  assert.equal(ir.table?.text, '状態遷移表');
  assert.deepEqual(ir.columns.map((c) => c.text), ['ID', '操作']);

  const grep = parseQuery('リリース判定の表から要確認を含む行を見せて');
  assert.equal(grep.table?.text, 'リリース判定');
  assert.deepEqual(grep.contains.map((c) => c.term.raw), ['要確認']);
  assert.equal(grep.unsupported.length, 0);
});

test('parser: design §3.3 unsupported requests are captured, not dropped', () => {
  const kinds = (input: string): string[] => [...new Set(parseQuery(input).unsupported.map((u) => u.kind))];
  assert.deepEqual(kinds('担当者別に集計'), ['aggregation']);
  assert.deepEqual(kinds('判定列が完全に一致する行'), ['columnCondition', 'exactMatch']);
  assert.deepEqual(kinds('最新のものだけ'), ['sort']);
  assert.deepEqual(kinds('要確認以外の行'), ['negation']);
  assert.deepEqual(kinds('金額が1000以上の行'), ['columnCondition', 'comparison']);
  assert.deepEqual(kinds('判定が要確認の行'), ['columnCondition']);
  assert.deepEqual(kinds('判定列に要確認を含む行'), ['columnScopedContains']);
});

// --- region detection ------------------------------------------------------

test('detectRegions splits by blank rows, attaches detached titles, keeps origins', () => {
  const regions = detectRegions('状態遷移', DESIGN.sheets['状態遷移']);
  assert.deepEqual(
    regions.map((r) => [r.a1, r.title, r.headers?.join('|'), r.headerConfidence]),
    [
      ['B3:E6', '状態遷移表', 'ID|現在状態|操作|遷移先', 'likely'],
      ['B9:C11', undefined, '画面ID|画面名', 'likely'],
    ],
  );
});

test('detectRegions peels a merged title glued to the table', () => {
  const [region] = detectRegions('判定', RELEASE.sheets['判定']);
  assert.equal(region.a1, 'A2:D5');
  assert.equal(region.title, 'リリース判定');
  // The merge belongs to the peeled title, so the table region itself has none.
  assert.equal(region.reasons.includes('contains-merged-cells'), false);
});

// --- catalog ------------------------------------------------------------------

test('indexWorkbookFiles re-reads only books whose stat changed and honours cancellation', async () => {
  const catalog = new RegionCatalog();
  const stats: Record<string, BookStat> = { '/a.xlsx': { mtimeMs: 1, size: 10 }, '/b.xlsx': { mtimeMs: 1, size: 10 } };
  let loads = 0;
  const options = {
    statFile: (path: string) => stats[path],
    loadWorkbook: () => {
      loads += 1;
      return DESIGN;
    },
  };
  const first = await indexWorkbookFiles(catalog, ['/a.xlsx', '/b.xlsx'], options);
  assert.deepEqual([first.updated.length, loads], [2, 2]);
  stats['/b.xlsx'] = { mtimeMs: 2, size: 10 };
  const second = await indexWorkbookFiles(catalog, ['/a.xlsx', '/b.xlsx'], options);
  assert.deepEqual([second.updated, second.unchanged, loads], [['/b.xlsx'], ['/a.xlsx'], 3]);

  const removed = await indexWorkbookFiles(catalog, ['/a.xlsx'], options);
  assert.deepEqual(catalog.bookPaths(), ['/a.xlsx']);
  assert.equal(removed.cancelled, false);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await indexWorkbookFiles(new RegionCatalog(), ['/a.xlsx'], { ...options, signal: controller.signal });
  assert.equal(cancelled.cancelled, true);
});

// --- retrievers ---------------------------------------------------------------

test('every retrieval method ranks the named table first on the shared corpus', () => {
  const { index } = buildIndex();
  const bag = new Map<string, number>();
  addTextFeatures(bag, 'リリース判定', 2);
  for (const method of RETRIEVAL_METHODS) {
    const [top] = index.search(method, bag, 5);
    assert.equal(top?.region.a1, 'A2:D5', method);
    assert.equal(top?.region.bookPath, '/ws/リリース判定.xlsx', method);
  }
});

test('incremental sync matches a fresh build for every method', () => {
  const { catalog, index } = buildIndex();
  catalog.setBook('/ws/設計.xlsx', { mtimeMs: 2, size: 2 }, DESIGN);
  catalog.removeBook('/ws/権限.xlsx');
  const sync = index.sync();
  assert.deepEqual([sync.fullBuild, sync.removed, sync.added], [false, 3, 2]);

  const fresh = new RegionSearchIndex(catalog);
  fresh.sync();
  const bag = new Map<string, number>();
  addTextFeatures(bag, '画面ID 画面名', 1);
  for (const method of ['exact', 'bm25', 'cosine'] as const) {
    const ids = (i: RegionSearchIndex) => i.search(method, bag, 5).map((hit) => hit.region.id);
    assert.deepEqual(ids(index), ids(fresh), method);
  }

  // A rebuild must not double-count postings.
  const before = RETRIEVAL_METHODS.map((method) => index.search(method, bag, 5).map((hit) => [hit.region.id, hit.score]));
  index.rebuild();
  const after = RETRIEVAL_METHODS.map((method) => index.search(method, bag, 5).map((hit) => [hit.region.id, hit.score]));
  assert.deepEqual(after, before);
});

test('single-method production indexes do not build hidden cosine postings', () => {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/設計.xlsx', { mtimeMs: 1, size: 1 }, DESIGN);
  catalog.setBook('/ws/リリース判定.xlsx', { mtimeMs: 1, size: 1 }, RELEASE);

  const bm25Only = new RegionSearchIndex(catalog, { methods: ['bm25'] });
  bm25Only.sync();
  assert.equal(bm25Only.cosine.memoryEstimate(), 0);

  const bag = new Map<string, number>();
  addTextFeatures(bag, '状態遷移', 2);
  assert.equal(bm25Only.search('bm25', bag, 1)[0]?.region.a1, 'B3:E6');

  // Explicit-file scoring still works without a cosine posting index because
  // scoreDocs() computes exact cosine directly from the shared corpus.
  const docs = bm25Only.docsOfBook('/ws/設計.xlsx');
  assert.equal(bm25Only.scoreDocs(bag, docs)[0]?.region.a1, 'B3:E6');

  const withCosine = new RegionSearchIndex(catalog, { methods: ['bm25', 'cosine'] });
  withCosine.sync();
  withCosine.scoreDocs(bag, withCosine.docsOfBook('/ws/設計.xlsx'));
  assert.ok(bm25Only.cosine.memoryEstimate() < withCosine.cosine.memoryEstimate());
});

test('full feature bags are reconstructed on demand instead of retained per region', () => {
  const { index } = buildIndex();
  const doc = index.docsOfBook('/ws/設計.xlsx')[0];
  const first = index.bagOf(doc);
  const second = index.bagOf(doc);
  assert.ok(first);
  assert.ok(second);
  assert.notStrictEqual(first, second);
  assert.deepEqual([...first!.entries()], [...second!.entries()]);

  // Value-derived coverage still exists when a request has no structural name.
  assert.ok([...first!.keys()].some((feature) => feature.includes('申請')));
});

test('FlyHash tags are a pure function of seed and feature strings', () => {
  const { index } = buildIndex();
  const bag = new Map<string, number>();
  addTextFeatures(bag, '状態遷移 操作', 1);
  const query = index.corpus.encodeQuery(bag);
  const a = new FlyHashRetriever(index.corpus, index.cosine, { seed: 7 });
  const b = new FlyHashRetriever(index.corpus, index.cosine, { seed: 7 });
  const c = new FlyHashRetriever(index.corpus, index.cosine, { seed: 8 });
  a.build();
  b.build();
  c.build();
  assert.deepEqual([...a.tagOf(query)], [...b.tagOf(query)]);
  assert.notDeepEqual([...a.tagOf(query)], [...c.tagOf(query)]);
  assert.ok(a.tagOf(query).length <= a.settings.winners);
});

// --- compiler -----------------------------------------------------------------

test('compile: columns resolve to letters relative to the region, header=first', () => {
  const { index } = buildIndex();
  for (const method of RETRIEVAL_METHODS) {
    const result = compileQuery('状態遷移表のIDと操作を見せて', { index, method, relativePath });
    assert.equal(result.status, 'candidates', method);
    assert.equal(result.requiresSelection, true);
    assert.equal(result.candidates[0].markdown, '![[./設計.xlsx#状態遷移|B3:E6?columns=A,C&header=first]]', method);
    assert.match(result.candidates[0].explanation, /列: ID、操作/u);
  }
});

test('compile: 「…を含む行」 becomes grep with an explanation of its real meaning', () => {
  const { index } = buildIndex();
  const result = compileQuery('リリース判定の表から要確認を含む行を見せて', { index, method: 'bm25', relativePath });
  assert.equal(result.candidates[0].markdown, '![[./リリース判定.xlsx#判定|A2:D5?header=first&grep=要確認]]');
  assert.match(result.candidates[0].explanation, /行のどこかに「要確認」を含む（部分一致/u);
});

test('compile: unsupported requests are rejected with reasons and never become grep', () => {
  const { index } = buildIndex();
  for (const input of [
    'リリース判定の担当者別に集計',
    'リリース判定の判定列が完全に一致する行',
    'リリース判定の最新のものだけ',
    'リリース判定の判定が要確認の行',
    'リリース判定の判定列に要確認を含む行',
    'リリース判定の要確認以外の行',
    'リリース判定から「OK」を含む「要確認」を含む行',
  ]) {
    const result = compileQuery(input, { index, method: 'cosine', relativePath });
    assert.equal(result.status, 'unsupported', input);
    assert.equal(result.candidates.length, 0, input);
    assert.ok(result.reasons.length > 0, input);
  }
});

test('compile: a request with no matching table is rejected, not guessed', () => {
  const { index } = buildIndex();
  for (const method of RETRIEVAL_METHODS) {
    const result = compileQuery('給与明細の支給額を見せて', { index, method, relativePath });
    assert.equal(result.status, 'no-match', method);
  }
});

test('compile: duplicate headers make a column ambiguous instead of picking one', () => {
  const { index } = buildIndex();
  const result = compileQuery('権限マトリクスの参照を見せて', { index, method: 'bm25', relativePath });
  assert.equal(result.status, 'no-match');
  assert.match(result.reasons.join(), /複数/u);
});

test('compile: fuzzy column names resolve, grep values are escaped and round-trip', () => {
  const { index } = buildIndex();
  const fuzzy = compileQuery('状態遷移表の遷移を見せて', { index, method: 'cosine', relativePath });
  assert.equal(fuzzy.candidates[0].columns[0].header, '遷移先');

  const escaped = compileQuery('リリース判定から「A&B #1」を含む行', { index, method: 'cosine', relativePath });
  const markdown = escaped.candidates[0].markdown;
  assert.equal(parseEmbedSyntax(markdown)?.params.get('grep'), 'A&B #1');
});

test('compile: an explicit file name is a hard filter', () => {
  const { index } = buildIndex();
  const hit = compileQuery('設計.xlsxの画面IDと画面名', { index, method: 'exact', relativePath });
  assert.equal(hit.candidates[0].markdown, '![[./設計.xlsx#状態遷移|B9:C11?columns=A,B&header=first]]');
  const miss = compileQuery('存在しない.xlsxの表', { index, method: 'exact', relativePath });
  assert.equal(miss.status, 'no-match');
});

// --- lexicon robustness (added after held-out v1 analysis; v1 is no longer used for scoring) ---

test('lexer: particles after okurigana and honorifics, but not inside kana words', () => {
  const kinds = (input: string): string[] => tokenize(input).map((t) => `${t.kind}:${t.text}`);
  assert.deepEqual(kinds('見積りを見せて'), ['WORD:見積り', 'PARTICLE:を', 'VERB:見せて']);
  assert.deepEqual(kinds('佐藤さんを含む'), ['WORD:佐藤', 'HONORIFIC:さん', 'PARTICLE:を', 'CONTAINS:含む']);
  assert.deepEqual(kinds('仕様書の氏名'), ['WORD:仕様書', 'PARTICLE:の', 'WORD:氏名']);
  assert.deepEqual(kinds('まとめ'), ['WORD:まとめ']);
});

test('parser: verb stems and inflected verbs are not column names', () => {
  assert.deepEqual(parseQuery('障害一覧を確認したい').columns, []);
  assert.deepEqual(parseQuery('WBSからタスクを抜き出して').columns.map((c) => c.text), ['タスク']);
  assert.deepEqual(parseQuery('WBSのタスクを貼り付けて').columns.map((c) => c.text), ['タスク']);
  assert.deepEqual(parseQuery('リリース判定で佐藤さんを含む行').contains.map((c) => c.term.raw), ['佐藤']);
});

test('compile: 「確認項目」 resolves as one header before falling back to 確認', () => {
  const { index } = buildIndex();
  const result = compileQuery('リリース判定の確認項目と判定', { index, method: 'bm25', relativePath });
  assert.deepEqual(result.candidates[0].columns.map((c) => c.header), ['確認項目', '判定']);
});

test('compile: 「Xのもの」 becomes grep and says it is a row-wide partial match', () => {
  const { index } = buildIndex();
  const result = compileQuery('リリース判定で要確認のもの', { index, method: 'bm25', relativePath });
  assert.equal(result.candidates[0].markdown, '![[./リリース判定.xlsx#判定|A2:D5?header=first&grep=要確認]]');
  assert.match(result.candidates[0].explanation, /行全体の部分一致として解釈/u);
});

test('compile: an unknown column word is reported, not silently dropped, and never stands alone', () => {
  const { index } = buildIndex();
  const partial = compileQuery('状態遷移表のIDとレイアウト', { index, method: 'bm25', relativePath });
  assert.equal(partial.candidates[0].partial, true);
  assert.deepEqual(partial.candidates[0].columns.map((c) => c.header), ['ID']);
  assert.match(partial.candidates[0].explanation, /「レイアウト」は見出しに無い/u);

  const none = compileQuery('状態遷移表のレイアウト', { index, method: 'bm25', relativePath });
  assert.equal(none.status, 'no-match');
});

test('compile: an unknown name fragment blocks normal promotion and stays visible as a near miss', () => {
  const { index } = buildIndex();
  const result = compileQuery('設定の状態遷移表', { index, method: 'bm25', relativePath });
  assert.equal(result.status, 'no-match');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.nearMisses?.[0].region.a1, 'B3:E6');
  assert.match(result.nearMisses?.[0].explanation ?? '', /「設定」は索引上の表名・シート名・見出しに直接一致しません/u);

  const invented = compileQuery('架空の状態遷移表', { index, method: 'bm25', relativePath });
  assert.equal(invented.status, 'no-match');
  assert.equal(invented.candidates.length, 0);
  assert.equal(invented.nearMisses?.[0].region.a1, 'B3:E6');

  // With no independently matching name at all, even a near miss is too weak.
  assert.equal(compileQuery('給与の設定', { index, method: 'bm25', relativePath }).nearMisses, undefined);
});

test('compile: a leading one-character name collision is a near miss, not a presumed typo', () => {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/結合テスト仕様書_受注.xlsx', { mtimeMs: 1, size: 1 }, INTEGRATION_TEST);
  const index = new RegionSearchIndex(catalog);
  index.sync();

  const result = compileQuery('総合テストケースの試験項目と期待結果', {
    index,
    method: 'bm25',
    relativePath,
  });
  assert.equal(result.status, 'no-match');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.nearMisses?.[0].region.a1, 'A2:E4');
  assert.deepEqual(result.nearMisses?.[0].columns.map((column) => column.header), ['試験項目', '期待結果']);
  assert.match(result.nearMisses?.[0].explanation ?? '', /先頭1文字だけが異なります/u);

  // Internal/trailing one-character typos retain the existing fuzzy behaviour.
  const { index: designIndex } = buildIndex();
  const trailingTypo = compileQuery('状態遷移票を見せて', { index: designIndex, method: 'bm25', relativePath });
  assert.equal(trailingTypo.status, 'candidates');
  assert.equal(trailingTypo.candidates[0].region.a1, 'B3:E6');
});

// --- safety regressions found by held-out v2 -----------------------------------

test('safety: a value tied to one column never becomes grep', () => {
  const { index } = buildIndex();
  for (const input of ['リリース判定で判定列がOKの行だけ', 'リリース判定の判定列はNGのもの', 'リリース判定の判定がOKの行']) {
    const result = compileQuery(input, { index, method: 'bm25', relativePath });
    assert.equal(result.status, 'unsupported', input);
    assert.equal(result.candidates.length, 0, input);
  }
});

test('safety: sort markers survive next to inflected verbs', () => {
  const { index } = buildIndex();
  for (const input of ['リリース判定を担当者の遅い順に並べて', 'リリース判定を判定順で', '状態遷移表をIDで並べて']) {
    assert.equal(compileQuery(input, { index, method: 'bm25', relativePath }).status, 'unsupported', input);
  }
});

// --- general phrasing rules (from held-out v2 analysis; v2 is no longer blind) ---

const PERF: WorkbookData = {
  sheets: {
    結果: sheet({
      A1: '性能測定結果',
      ...table('A2', [
        ['シナリオ', '件数', '平均応答時間', '判定'],
        ['受注登録', '100', '1.2秒', 'OK'],
        ['受注照会', '300', '0.8秒', 'NG'],
      ]),
    }),
  },
};

function perfIndex(): RegionSearchIndex {
  const catalog = new RegionCatalog();
  catalog.setBook('/ws/性能試験結果.xlsx', { mtimeMs: 1, size: 1 }, PERF);
  catalog.setBook('/ws/リリース判定.xlsx', { mtimeMs: 1, size: 1 }, RELEASE);
  const index = new RegionSearchIndex(catalog);
  index.sync();
  return index;
}

test('rules: an aggregation word inside an existing header name is that header, not an operation', () => {
  const index = perfIndex();
  const result = compileQuery('性能測定結果のシナリオと平均応答時間だけ出して', { index, method: 'bm25', relativePath });
  assert.deepEqual(result.candidates[0].columns.map((c) => c.header), ['シナリオ', '平均応答時間']);
  assert.match(result.candidates[0].explanation, /既存の見出し名として扱いました/u);
  assert.deepEqual(compileQuery('性能測定結果の件数と判定', { index, method: 'bm25', relativePath }).candidates[0].columns.map((c) => c.header), ['件数', '判定']);
  // No such name: still an aggregation request, still rejected.
  assert.equal(compileQuery('性能測定結果の平均を出して', { index, method: 'bm25', relativePath }).status, 'unsupported');
  assert.equal(compileQuery('リリース判定の件数を数えて', { index, method: 'bm25', relativePath }).status, 'unsupported');
});

test('rules: later sentences are context, but their unsupported markers still count', () => {
  const index = perfIndex();
  const result = compileQuery('性能測定結果を載せたい。レビューで使うので', { index, method: 'bm25', relativePath });
  assert.equal(result.status, 'candidates');
  assert.equal(compileQuery('性能測定結果を載せたい。判定がNG以外のもの', { index, method: 'bm25', relativePath }).status, 'unsupported');
});

test('rules: a destination is not a target; a value that appears is a row-wide contains', () => {
  const index = perfIndex();
  assert.equal(compileQuery('性能測定結果、レビュー資料に引用したい', { index, method: 'bm25', relativePath }).status, 'candidates');
  const shown = compileQuery('性能測定結果でNGが出てるもの', { index, method: 'bm25', relativePath });
  assert.match(shown.candidates[0].markdown, /grep=NG/u);
});

test('safety: 「Xが…の表」 without a verb stays a rejected column condition', () => {
  const index = perfIndex();
  assert.equal(compileQuery('判定がNGの表', { index, method: 'bm25', relativePath }).status, 'unsupported');
  assert.equal(compileQuery('性能測定結果で判定がNGのものの一覧', { index, method: 'bm25', relativePath }).status, 'unsupported');
});

test('rules: structural suffixes need not match; parenthesised qualifiers must', () => {
  const index = perfIndex();
  assert.equal(compileQuery('性能測定の一覧', { index, method: 'bm25', relativePath }).status, 'candidates');
  assert.equal(compileQuery('性能測定結果（会計）', { index, method: 'bm25', relativePath }).status, 'no-match');
});

test('near misses: offered separately when nothing matches by name; the status stays no-match', () => {
  const { index } = buildIndex();
  const result = compileQuery('状態管理表', { index, method: 'bm25', relativePath });
  assert.equal(result.status, 'no-match');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.nearMisses?.[0].region.a1, 'B3:E6');
  assert.match(result.nearMisses![0].explanation, /名前が一致しない/u);
  // Nothing near at all: no suggestions either.
  assert.equal(compileQuery('給与明細の支給額を見せて', { index, method: 'bm25', relativePath }).nearMisses, undefined);
  // Unsupported requests never get near misses.
  assert.equal(compileQuery('状態管理表を担当者別に集計', { index, method: 'bm25', relativePath }).nearMisses, undefined);
});

test('near misses: two exact columns can surface a paraphrased table without promoting it to a match', () => {
  const { index } = buildIndex();
  const result = compileQuery('業務フローのIDと操作を見せて', { index, method: 'bm25', relativePath });
  assert.equal(result.status, 'no-match');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.nearMisses?.[0].region.a1, 'B3:E6');
  assert.deepEqual(result.nearMisses?.[0].columns.map((column) => column.header), ['ID', '操作']);
  assert.match(result.nearMisses?.[0].explanation ?? '', /指定された列名がすべて一致/u);

  // A single common column is too weak to rescue an unrelated description.
  const weak = compileQuery('業務フローのIDを見せて', { index, method: 'bm25', relativePath });
  assert.equal(weak.status, 'no-match');
  assert.equal(weak.nearMisses, undefined);
});


test('directional aliases: two cues can retrieve by canonical names without weakening exact-name safety', () => {
  const { index } = buildIndex();
  const queryAliases = [
    { cues: ['業務', 'フロー'], terms: ['状態遷移', '操作'] },
  ] as const;

  const aliased = compileQuery('業務フローの表', {
    index,
    method: 'bm25',
    relativePath,
    queryAliases,
  });
  assert.equal(aliased.status, 'candidates');
  assert.equal(aliased.candidates[0].region.a1, 'B3:E6');
  assert.match(aliased.candidates[0].explanation, /説明句の対応/u);
  assert.equal(aliased.requiresSelection, true);
  // The explicit bounded alias is the only semantic escape hatch for unknown
  // description words; without it the same request is not a normal match.
  const withoutAlias = compileQuery('業務フローの表', { index, method: 'bm25', relativePath });
  assert.equal(withoutAlias.status, 'no-match');

  // Quoting asks for an explicit name, so a semantic alias cannot override it.
  const quoted = compileQuery('「業務フロー」の表', {
    index,
    method: 'bm25',
    relativePath,
    queryAliases,
  });
  assert.equal(quoted.status, 'no-match');

  // Broad/malformed alias rules are ignored: one cue or one canonical term
  // cannot become a semantic wildcard.
  const broad = compileQuery('業務フローの表', {
    index,
    method: 'bm25',
    relativePath,
    queryAliases: [
      { cues: ['業務'], terms: ['状態遷移', '操作'] },
      { cues: ['業務', 'フロー'], terms: ['状態遷移'] },
    ],
  });
  assert.equal(broad.status, 'no-match');

  // Retrieval assistance never bypasses unsupported query semantics.
  const unsupported = compileQuery('業務フローの表を担当者別に集計', {
    index,
    method: 'bm25',
    relativePath,
    queryAliases,
  });
  assert.equal(unsupported.status, 'unsupported');
});
