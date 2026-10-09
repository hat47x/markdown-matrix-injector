/**
 * Excel (COM) + Markdown coauthoring in real VS Code (issue-0211). Needs
 * Windows with Microsoft Excel installed.
 *
 *   npm run build && node --import tsx ./test/e2e/runCoauthoring.ts
 *
 * VSCODE_EXECUTABLE_PATH=<Code.exe> uses an installed VS Code.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '../..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-coauthoring-'));

process.env.MMI_COAUTHORING_WORKSPACE = workspace;
process.env.MMI_COAUTHORING_SCRIPTS = path.join(extensionDevelopmentPath, 'test/e2e/coauthoring');
process.env.MMI_ENABLE_TEST_COMMANDS = '1';

await runTests({
  version: process.env.VSCODE_VERSION,
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
  timeout: 600_000,
  extensionDevelopmentPath,
  extensionTestsPath: path.resolve(extensionDevelopmentPath, 'dist/test/e2e/coauthoring/index.js'),
  launchArgs: [
    workspace,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--disable-updates',
    '--disable-gpu',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-coauthoring-user-'))}`,
    `--extensions-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-coauthoring-ext-'))}`,
  ],
});
