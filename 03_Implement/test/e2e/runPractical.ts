/**
 * Real-VS Code verification over the practical sample documents, opened as a
 * multi-root workspace (samples + the e2e fixtures), so each folder must only
 * see its own workbooks.
 *
 *   npm run build && MMI_ENABLE_TEST_COMMANDS=1 node --import tsx ./test/e2e/runPractical.ts
 *
 * Optional: VSCODE_VERSION=1.96.0 to run against the oldest supported host.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-practical-'));
const samples = path.join(root, 'samples');
const fixtures = path.join(root, 'fixtures');
fs.cpSync(path.resolve(here, '../../../04_Documentation/samples/practical'), samples, { recursive: true });
fs.cpSync(path.resolve(here, '../fixtures/workspace'), fixtures, { recursive: true });
const workspaceFile = path.join(root, 'mmi.code-workspace');
fs.writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: samples }, { path: fixtures }] }, null, 2));

process.env.MMI_PRACTICAL_SAMPLES = samples;
process.env.MMI_PRACTICAL_FIXTURES = fixtures;
process.env.MMI_ENABLE_TEST_COMMANDS = '1';

await runTests({
  version: process.env.VSCODE_VERSION,
  timeout: 180_000,
  extensionDevelopmentPath,
  extensionTestsPath: path.resolve(extensionDevelopmentPath, 'dist/test/e2e/practical/index.js'),
  launchArgs: [
    workspaceFile,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--disable-updates',
    '--disable-gpu',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-practical-user-'))}`,
    `--extensions-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-practical-ext-'))}`,
  ],
});
