/**
 * Real-VS Code check of `MMI: Import Tables from Workbook` on the fictional
 * 方眼紙 corpus (02_Architecture/import-assistance.md §8).
 *
 *   npm run build && node --import tsx ./test/e2e/runImport.ts
 *
 * VSCODE_EXECUTABLE_PATH=<Code.exe> uses an installed VS Code (separate user
 * data and extensions folders) instead of downloading one.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';
import { writeImportCorpus } from '../../scripts/import-assist-eval/corpus.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-e2e-'));
const corpus = writeImportCorpus(path.join(root, 'workspace'));

// Every expressible table renders as a table; the two-row header and the
// off-anchor table are still tables (with cautions). None becomes a card.
const expected = Object.fromEntries(
  corpus.books.map((book) => [book, { tables: corpus.tables.filter((table) => table.book === book).length, cards: 0 }]),
);

process.env.MMI_IMPORT_WORKSPACE = corpus.dir;
process.env.MMI_IMPORT_EXPECTED = JSON.stringify(expected);
process.env.MMI_ENABLE_TEST_COMMANDS = '1';

await runTests({
  version: process.env.VSCODE_VERSION,
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
  timeout: 180_000,
  extensionDevelopmentPath,
  extensionTestsPath: path.resolve(extensionDevelopmentPath, 'dist/test/e2e/import/index.js'),
  launchArgs: [
    corpus.dir,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--disable-updates',
    '--disable-gpu',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-user-'))}`,
    `--extensions-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-ext-'))}`,
  ],
});
