import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMessage,
  LocalizedError,
  localizeError,
  registerMessages,
  resolveMessageLocale,
  similarNames,
} from '../src/core/messages/index.js';
import { describeBinding } from '../src/core/expectedBinding.js';
import { describeHeaderMismatch } from '../src/core/expectedHeaders.js';
import { validateEmbedDiagnostics } from '../src/dx/diagnostics.js';
import { parameterIssues } from '../src/dx/parameterDiagnostics.js';
import { PathContainmentError, resolveSourcePath } from '../src/core/pathResolver.js';
import { SmartFallbackLimitError } from '../src/core/smartFallback.js';

test('a language is matched exactly, then by its primary language, else English', () => {
  assert.equal(resolveMessageLocale('ja'), 'ja');
  assert.equal(resolveMessageLocale('ja-JP'), 'ja');
  assert.equal(resolveMessageLocale('ja_JP'), 'ja');
  assert.equal(resolveMessageLocale('en-US'), 'en');
  assert.equal(resolveMessageLocale('fr'), 'en');
  assert.equal(resolveMessageLocale(undefined), 'en');
});

test('English stays the default and keeps the sentences the command line and tests have always seen', () => {
  assert.equal(formatMessage('sheetNotFound', { sheet: '画面' }), 'Sheet not found: 画面');
  assert.equal(formatMessage('sourceNotResolved', { path: './a.xlsx' }), 'Unable to resolve source file: ./a.xlsx');
  assert.equal(formatMessage('fileNotFound', { path: './a.xlsx' }), 'Embedded file not found: ./a.xlsx');
  assert.equal(
    formatMessage('outsideBoundary', { path: '../x.xlsx', boundary: '/w' }),
    'Source file is outside workspace boundary: ../x.xlsx (boundary: /w)',
  );
});

test('a missing sheet points at a renamed one, in the reader\'s language', () => {
  const available = ['画面項目', 'メモ'];
  assert.equal(
    formatMessage('sheetNotFound', { sheet: '画面', available }, 'ja'),
    'シート「画面」が見つかりません。シート名が変わった可能性があります。近い名前: 「画面項目」',
  );
  assert.equal(
    formatMessage('sheetNotFound', { sheet: '画面', available }, 'en'),
    'Sheet not found: 画面. The sheet may have been renamed; similar names: "画面項目"',
  );
  // Nothing close: list what the workbook has instead.
  assert.equal(
    formatMessage('sheetNotFound', { sheet: '一覧', available: ['A', 'B'] }, 'ja'),
    'シート「一覧」が見つかりません。このブックのシート: 「A」、「B」',
  );
  // A long list is capped and says how many are left.
  const many = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  assert.match(formatMessage('sheetNotFound', { sheet: 'x', available: many }, 'en'), /"s5" and 2 more$/u);
  assert.match(formatMessage('sheetNotFound', { sheet: 'x', available: many }, 'ja'), /「s5」 ほか2件$/u);
});

test('similarNames matches renames in either direction and ignores width and case', () => {
  assert.deepEqual(similarNames('画面', ['画面項目', '概要']), ['画面項目']);
  assert.deepEqual(similarNames('画面項目', ['画面', '概要']), ['画面']);
  assert.deepEqual(similarNames('Sheet1', ['ｓｈｅｅｔ１ 改']), ['ｓｈｅｅｔ１ 改']);
  assert.deepEqual(similarNames('画面', ['画面']), []);
  assert.deepEqual(similarNames('', ['画面']), []);
});

test('a language nobody has written falls back to English, and a partial language falls back per message', () => {
  assert.equal(formatMessage('fileNotFound', { path: 'p' }, 'de'), 'Embedded file not found: p');
  registerMessages('test-xx', { fileNotFound: ({ path }) => `XX ${path}` });
  assert.equal(formatMessage('fileNotFound', { path: 'p' }, 'test-xx'), 'XX p');
  assert.equal(formatMessage('invalidXml', {}, 'test-xx'), formatMessage('invalidXml', {}, 'en'));
  assert.equal(resolveMessageLocale('test-xx-yy'), 'test-xx');
});

test('core errors keep their English message and carry the id a host localizes', () => {
  const error = new LocalizedError('sheetNotFound', { sheet: '画面', available: ['画面項目'] }, { sheet: '画面' });
  assert.equal(error.message, 'Sheet not found: 画面');
  assert.match(localizeError(error, 'ja'), /近い名前: 「画面項目」/u);
  // The displayed English sentence adds the suggestion; `message` stays the plain sentence.
  assert.equal(localizeError(error), 'Sheet not found: 画面. The sheet may have been renamed; similar names: "画面項目"');
  assert.equal(localizeError(new Error('plain'), 'ja'), 'plain');

  const tooLarge = new SmartFallbackLimitError(5000, 4000);
  assert.equal(tooLarge.code, 'MMI_TABLE_TOO_LARGE');
  assert.match(tooLarge.message, /^Reference too large to render as a table \(5000 cells exceeds the 4000-cell limit\)/u);
  assert.match(localizeError(tooLarge, 'ja'), /^表として表示するには大きすぎます（5000セルが上限の4000セルを超えています）/u);

  const contained = new PathContainmentError('../x.xlsx', '/c', '/w');
  assert.equal(contained.message, 'Source file is outside workspace boundary: ../x.xlsx (boundary: /w)');
  assert.match(localizeError(contained, 'ja'), /^参照先のファイルが作業フォルダーの外にあります: \.\.\/x\.xlsx（作業フォルダー: \/w）$/u);

  assert.throws(
    () => resolveSourcePath({ markdownFilePath: '/nowhere/doc.md', sourcePath: './missing.xlsx' }),
    (thrown: unknown) =>
      thrown instanceof LocalizedError &&
      thrown.message === 'Unable to resolve source file: ./missing.xlsx' &&
      localizeError(thrown, 'ja') === '参照先のファイルが見つかりません: ./missing.xlsx',
  );
});

test('Problems-panel diagnostics follow the locale and name the sheets that exist', () => {
  const query = { raw: '![[./a.xlsx#画面|A1:C4]]', filepath: './a.xlsx', target: '画面', range: 'A1:C4' };
  const [english] = validateEmbedDiagnostics({ query, fileExists: true, sheetExists: false });
  assert.equal(english.message, 'Sheet not found: 画面');
  const [japanese] = validateEmbedDiagnostics({
    query,
    fileExists: true,
    sheetExists: false,
    availableSheets: ['画面項目'],
    locale: 'ja-JP',
  });
  assert.equal(japanese.code, 'MMI_SHEET_NOT_FOUND');
  assert.equal(japanese.message, 'シート「画面」が見つかりません。シート名が変わった可能性があります。近い名前: 「画面項目」');

  const [missing] = validateEmbedDiagnostics({ query, fileExists: false, locale: 'ja' });
  assert.equal(missing.message, '参照先のファイルが見つかりません: ./a.xlsx');
});

test('header, binding and parameter messages exist in every registered language', () => {
  const mismatch = {
    status: 'mismatch' as const,
    expected: ['項目名', '型'],
    actual: ['項目名称', '型'],
    mismatches: [{ position: 1, expected: '項目名', actual: '項目名称' }],
  };
  assert.match(describeHeaderMismatch(mismatch, 'ja'), /^見出しが、参照を書いたときと違います（1列目: 期待「項目名」→ 実際「項目名称」）/u);
  assert.match(describeHeaderMismatch(mismatch, 'en'), /^The headers differ from when the reference was written \(column 1: expected "項目名" -> actual "項目名称"\)/u);
  assert.match(describeHeaderMismatch(mismatch), /^The headers differ/u);
  const noHeader = { status: 'not-checkable' as const, expected: ['a'], actual: [], mismatches: [] };
  assert.match(describeHeaderMismatch(noHeader, 'en'), /header=first/u);
  assert.match(describeHeaderMismatch(noHeader, 'ja'), /header=first/u);

  const moved = { kind: 'table' as const, declared: 'T_権限', status: 'moved' as const, current: '権限!A1:F9' };
  assert.equal(describeBinding(moved, 'ja'), 'Excelテーブル「T_権限」は、参照のシートとは別のシートへ移っています（現在 権限!A1:F9）。');
  assert.equal(describeBinding(moved, 'en'), 'Excel table "T_権限" has moved to a different sheet than the reference\'s (now 権限!A1:F9).');

  const raw = '![[./a.xlsx#S|A1:B2?headr=first&mode=tabel]]';
  const ja = parameterIssues(raw, 'ja').map((issue) => issue.message);
  const en = parameterIssues(raw, 'en').map((issue) => issue.message);
  assert.equal(ja.length, en.length);
  assert.ok(ja.length >= 2);
  assert.ok(ja.every((message) => /[ぁ-んァ-ン一-龥]/u.test(message)));
  assert.ok(en.every((message) => !/[ぁ-んァ-ン一-龥]/u.test(message)));
});
