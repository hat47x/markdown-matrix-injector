import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkPaths } from '../src/cli/mmi.js';
import { bindingSeverity, checkExpectedBindings, describeBinding } from '../src/core/expectedBinding.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { readWorkbookStructure, type WorkbookStructure } from '../src/importAssist/workbookStructure.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX_FILE = path.join(here, 'fixtures/excel-authored/features-excel2016.xlsx');
const structure = readWorkbookStructure(XLSX_FILE, loadWorkbook({ absolutePath: XLSX_FILE }));

const check = (reference: string, declared: WorkbookStructure = structure) =>
  checkExpectedBindings(parseEmbedSyntax(reference)!, declared);

test('a reference that still matches its Excel table or defined name is clean', () => {
  assert.deepEqual(check('![[./f.xlsx#テーブル|B4:F9?header=first&x-table=T_受注明細]]').map((r) => r.status), ['ok']);
  assert.deepEqual(check('![[./f.xlsx#名前|A1:D6?x-name=受注一覧]]').map((r) => r.status), ['ok']);
  // Neither key: nothing to check. Names compare without regard to case or width.
  assert.deepEqual(check('![[./f.xlsx#テーブル|B4:F9]]'), []);
  assert.deepEqual(check('![[./f.xlsx#テーブル|B4:F9?x-table=t_受注明細]]').map((r) => r.status), ['ok']);
});

test('a table that grew, moved or vanished is reported with its current range', () => {
  const [grown] = check('![[./f.xlsx#テーブル|B4:F6?x-table=T_受注明細]]');
  assert.equal(grown.status, 'narrower');
  assert.equal(bindingSeverity(grown), 'information');

  const [past] = check('![[./f.xlsx#テーブル|B4:F12?x-table=T_受注明細]]');
  assert.equal(past.status, 'changed');
  assert.equal(past.current, 'B4:F9');
  assert.equal(bindingSeverity(past), 'warning');
  assert.match(describeBinding(past), /B4:F9.*B4:F12/u);

  const [elsewhere] = check('![[./f.xlsx#名前|B4:F9?x-table=T_受注明細]]');
  assert.equal(elsewhere.status, 'moved');

  const [gone] = check('![[./f.xlsx#テーブル|B4:F9?x-table=T_消えた]]');
  assert.equal(gone.status, 'missing');
  assert.equal(bindingSeverity(gone), 'warning');
});

test('a name that no longer points at a range is not silently accepted', () => {
  const [broken] = check('![[./f.xlsx#名前|A1:D6?x-name=壊れた名前]]');
  assert.equal(broken.status, 'missing');
  const [constant] = check('![[./f.xlsx#名前|A1:D6?x-name=上限件数]]');
  assert.equal(constant.status, 'not-a-range');
  assert.equal(bindingSeverity(constant), 'information');
});

test('check reports the stale binding at the key, and x-table never changes what is displayed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xtable-'));
  fs.copyFileSync(XLSX_FILE, path.join(root, 'f.xlsx'));
  const doc = path.join(root, 'doc.md');
  const clean = '![[./f.xlsx#テーブル|B4:F9?header=first&x-table=T_受注明細]]';
  const stale = '![[./f.xlsx#テーブル|B4:F12?header=first&x-table=T_受注明細]]';

  fs.writeFileSync(doc, `# t\n\n${clean}\n`);
  assert.deepEqual(await checkPaths([doc], root), []);

  fs.writeFileSync(doc, `# t\n\n${stale}\n`);
  const problems = await checkPaths([doc], root);
  assert.deepEqual(problems.map((p) => [p.code, p.severity, p.line]), [['MMI_BINDING_MISMATCH', 'warning', 3]]);
  assert.equal(problems[0].column, stale.indexOf('x-table') + 1);

  // P5: with or without the key, the rendered table is identical.
  const { renderEmbedToHtml } = await import('../src/core/renderTable.js').then((m) => ({ renderEmbedToHtml: (ref: string) => JSON.stringify(m.buildLogicalTable(parseEmbedSyntax(ref)!, loadWorkbook({ absolutePath: path.join(root, 'f.xlsx') }))) }));
  assert.equal(renderEmbedToHtml(clean), renderEmbedToHtml(clean.replace('&x-table=T_受注明細', '')));
});

test('select records the Excel table it took the range from, and the reference it writes checks clean', async () => {
  const { analyzeBook } = await import('../src/navigate/catalog.js');
  const { selectFromBook } = await import('../src/navigate/select.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xtable-select-'));
  fs.copyFileSync(XLSX_FILE, path.join(root, 'f.xlsx'));
  const book = analyzeBook(path.join(root, 'f.xlsx'), './f.xlsx');
  const selected = selectFromBook(book, './f.xlsx', { table: 'T_受注明細', columns: ['商品', '数量'] });
  assert.equal(selected.ok, true, JSON.stringify(selected.errors));
  assert.match(selected.reference!, /&x-table=T_(?:%E5%8F%97|受注明細)/u);
  assert.match(selected.reference!, /&x-below=1\]\]$/u);
  const doc = path.join(root, 'doc.md');
  fs.writeFileSync(doc, `${selected.reference}\n`);
  assert.deepEqual(await checkPaths([doc], root), []);
});
