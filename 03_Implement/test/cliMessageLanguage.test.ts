import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { checkPaths } from '../src/cli/mmi.js';
import { cliErrorText, cliMessageLanguage } from '../src/cli/messageLanguage.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';

function withEnv(language: string | undefined, run: () => void | Promise<void>): Promise<void> | void {
  const previous = process.env.MMI_LANGUAGE;
  if (language === undefined) delete process.env.MMI_LANGUAGE;
  else process.env.MMI_LANGUAGE = language;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.MMI_LANGUAGE;
    else process.env.MMI_LANGUAGE = previous;
  }
}

test('MMI_LANGUAGE chooses the CLI message language; unset, empty or auto stays English', () => {
  withEnv(undefined, () => assert.equal(cliMessageLanguage(), undefined));
  withEnv('auto', () => assert.equal(cliMessageLanguage(), undefined));
  withEnv('', () => assert.equal(cliMessageLanguage(), undefined));
  withEnv('  ', () => assert.equal(cliMessageLanguage(), undefined));
  withEnv('en', () => assert.equal(cliMessageLanguage(), 'en'));
  withEnv('ja', () => assert.equal(cliMessageLanguage(), 'ja'));
  withEnv('ja-JP', () => assert.equal(cliMessageLanguage(), 'ja'));
  // An unregistered locale falls back to English.
  withEnv('de', () => assert.equal(cliMessageLanguage(), 'en'));});

test('command-line errors carry their own wording unless MMI_LANGUAGE asks for a written language', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-language-'));
  const bookPath = path.join(root, 'book.xlsx');
  fs.writeFileSync(bookPath, Buffer.alloc(0));
  let error: unknown;
  try {
    loadWorkbook({ absolutePath: bookPath });
  } catch (e) {
    error = e;
  }

  withEnv(undefined, () => {
    assert.match(cliErrorText(error), /the file is empty/);
  });
  withEnv('ja', () => {
    assert.match(cliErrorText(error), /ファイルが空/);
  });
});

test('mmi check reports missing sheets in the MMI_LANGUAGE language', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-check-language-'));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ID'], ['1']]), 'Items');
  fs.writeFileSync(path.join(root, 'book.xlsx'), Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })));
  const docPath = path.join(root, 'doc.md');
  fs.writeFileSync(docPath, '![[./book.xlsx#Nothing|A1:B2?header=first]]\n');

  await withEnv(undefined, async () => {
    const problems = await checkPaths([docPath], root);
    const sheetProblem = problems.find((problem) => problem.code === 'MMI_SHEET_NOT_FOUND');
    assert.ok(sheetProblem, 'the missing sheet is the gate error');
    assert.match(sheetProblem.message, /^Sheet not found: Nothing/);
  });

  await withEnv('ja', async () => {
    const problems = await checkPaths([docPath], root);
    const sheetProblem = problems.find((problem) => problem.code === 'MMI_SHEET_NOT_FOUND');
    assert.ok(sheetProblem);
    assert.match(sheetProblem.message, /シート「Nothing」が見つかりません/);
  });
});
