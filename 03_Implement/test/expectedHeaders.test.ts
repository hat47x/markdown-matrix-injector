import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkPaths } from '../src/cli/mmi.js';
import {
  checkExpectedHeaders,
  describeHeaderMismatch,
  encodeHeaderListForQuery,
  formatHeaderList,
  parseHeaderList,
} from '../src/core/expectedHeaders.js';
import { buildLogicalTable } from '../src/core/renderTable.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { parseEmbedParts, serializeEmbedParts, withCurrentExpectedHeaders } from '../src/dx/embedEditor.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';
import { analyzeBook } from '../src/navigate/catalog.js';
import { selectFromBook } from '../src/navigate/select.js';

function project(csv: string): { root: string; csvPath: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xheaders-'));
  const csvPath = path.join(root, 'spec.csv');
  fs.writeFileSync(csvPath, csv);
  return { root, csvPath, doc: path.join(root, 'doc.md') };
}

const BEFORE = 'ID,名前,必須,備考\nA-1,甲,○,x\nA-2,乙,,y\n';
// A column was inserted in front of 必須 (what Excel users do all the time).
const AFTER = 'ID,名前,区分,必須,備考\nA-1,甲,新,○,x\nA-2,乙,旧,,y\n';
const REF = '![[./spec.csv#Sheet1|A1:D3?header=first&columns=B,C&x-headers=名前,必須]]';

test('header lists survive commas and backslashes', () => {
  const headers = ['名前', 'a,b', 'c\\d', ''];
  assert.deepEqual(parseHeaderList(formatHeaderList(headers)), headers);
  assert.equal(formatHeaderList(['a,b']), 'a\\,b');
  assert.deepEqual(parseHeaderList('a\\,b,c'), ['a,b', 'c']);
  // Only characters that would end or alter a query value are percent-encoded; Japanese and commas stay readable.
  assert.equal(encodeHeaderListForQuery('名前,必須 &=+'), '名前,必須%20%26%3D%2B');
});

test('a matching reference is ok and a column inserted in the source is reported', () => {
  const { root, csvPath } = project(BEFORE);
  const query = parseEmbedSyntax(REF)!;
  assert.equal(checkExpectedHeaders(query, loadWorkbook({ absolutePath: csvPath }))?.status, 'ok');

  fs.writeFileSync(csvPath, AFTER);
  const result = checkExpectedHeaders(query, loadWorkbook({ absolutePath: path.join(root, 'spec.csv') }));
  assert.equal(result?.status, 'mismatch');
  assert.deepEqual(result?.actual, ['名前', '区分']);
  assert.deepEqual(result?.mismatches, [{ position: 2, expected: '必須', actual: '区分' }]);
  assert.match(describeHeaderMismatch(result!, 'ja'), /2列目: 期待「必須」→ 実際「区分」/u);
  assert.match(describeHeaderMismatch(result!, 'en'), /column 2: expected "必須" -> actual "区分"/u);
});

test('a reference without x-headers is not checked, and one without a header row says so', () => {
  const { csvPath } = project(BEFORE);
  const workbook = loadWorkbook({ absolutePath: csvPath });
  assert.equal(checkExpectedHeaders(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:D3?header=first]]')!, workbook), undefined);
  const noHeader = checkExpectedHeaders(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:D3?x-headers=ID]]')!, workbook);
  assert.equal(noHeader?.status, 'not-checkable');
  assert.match(describeHeaderMismatch(noHeader!), /header=first/u);
});

test('x-headers never changes what is displayed (spec P5)', () => {
  const { csvPath } = project(BEFORE);
  const workbook = loadWorkbook({ absolutePath: csvPath });
  const withKey = buildLogicalTable(parseEmbedSyntax(REF)!, workbook);
  const withoutKey = buildLogicalTable(parseEmbedSyntax(REF.replace('&x-headers=名前,必須', ''))!, workbook);
  assert.deepEqual(withKey, withoutKey);
  // Even a wrong expectation leaves the table alone.
  const wrong = buildLogicalTable(parseEmbedSyntax(REF.replace('名前,必須', 'foo,bar'))!, workbook);
  assert.deepEqual(wrong, withoutKey);
});

test('check warns about a header mismatch with the right position, and warnings do not fail the check', async () => {
  const { root, csvPath, doc } = project(BEFORE);
  fs.writeFileSync(doc, `# t\n\n${REF}\n`);
  assert.deepEqual(await checkPaths([doc], root), []);

  fs.writeFileSync(csvPath, AFTER);
  const problems = await checkPaths([doc], root);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, 'MMI_HEADERS_MISMATCH');
  assert.equal(problems[0].severity, 'warning');
  assert.equal(problems[0].line, 3);
  // The span starts at the x-headers key inside the reference.
  assert.equal(problems[0].column, REF.indexOf('x-headers') + 1);
});

test('a missing file reports only the missing file, not a header mismatch', async () => {
  const { root, doc } = project(BEFORE);
  fs.writeFileSync(doc, '![[./gone.csv#Sheet1|A1:D3?header=first&x-headers=ID]]\n');
  assert.deepEqual((await checkPaths([doc], root)).map((p) => p.code), ['MMI_FILE_NOT_FOUND']);
});

test('select writes x-headers, and a header with a comma, ampersand or space round-trips through check', async () => {
  const { root, csvPath, doc } = project('ID,名前, 備考 & メモ,a,b\nA-1,甲,x,1,2\n');
  const book = analyzeBook(csvPath, './spec.csv');
  const selected = selectFromBook(book, './spec.csv', { table: 'A1:E2', columns: ['名前', '備考 & メモ'] });
  assert.equal(selected.ok, true, JSON.stringify(selected.errors));
  assert.match(selected.reference!, /&x-headers=名前,備考%20%26%20メモ&x-below=0\]\]$/u);
  fs.writeFileSync(doc, `${selected.reference}\n`);
  assert.deepEqual(await checkPaths([doc], root), []);

  // A header that contains a comma (quoted in the CSV) is written `\,` in x-headers.
  const comma = project('ID,"a,b",c\nA-1,x,y\n');
  const commaBook = analyzeBook(comma.csvPath, './spec.csv');
  const commaSelected = selectFromBook(commaBook, './spec.csv', { table: 'A1:C2', columns: ['a,b'] });
  assert.equal(commaSelected.ok, true, JSON.stringify(commaSelected.errors));
  assert.match(commaSelected.reference!, /&x-headers=a\\,b&x-below=0\]\]$/u);
  fs.writeFileSync(comma.doc, `${commaSelected.reference}\n`);
  assert.deepEqual(await checkPaths([comma.doc], comma.root), []);
});

test('guided authoring records the current headers, and re-recording replaces the stale ones (quick fix)', () => {
  const { root, csvPath } = project(BEFORE);
  const plain = parseEmbedParts('![[./spec.csv#Sheet1|A1:D3?header=first&columns=B,C]]')!;
  const recorded = withCurrentExpectedHeaders(plain, loadWorkbook({ absolutePath: csvPath }));
  assert.equal(serializeEmbedParts(recorded), REF);

  // The source gains a column: the recorded reference warns, and re-recording yields the new displayed headers.
  fs.writeFileSync(csvPath, AFTER);
  const after = loadWorkbook({ absolutePath: path.join(root, 'spec.csv') });
  assert.equal(checkExpectedHeaders(parseEmbedSyntax(serializeEmbedParts(recorded))!, after)?.status, 'mismatch');
  const refreshed = withCurrentExpectedHeaders(recorded, after);
  assert.match(serializeEmbedParts(refreshed), /x-headers=名前,区分\]\]$/u);
  assert.equal(checkExpectedHeaders(parseEmbedSyntax(serializeEmbedParts(refreshed))!, after)?.status, 'ok');
  // Everything but x-headers is untouched, and the key is written once.
  assert.equal(serializeEmbedParts(refreshed).match(/x-headers=/gu)?.length, 1);
});

test('without a header row nothing is recorded and a stale x-headers is dropped', () => {
  const { csvPath } = project(BEFORE);
  const data = loadWorkbook({ absolutePath: csvPath });
  const noHeader = parseEmbedParts('![[./spec.csv#Sheet1|A1:D3?x-headers=a,b]]')!;
  assert.equal(serializeEmbedParts(withCurrentExpectedHeaders(noHeader, data)), '![[./spec.csv#Sheet1|A1:D3]]');
});
