import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, '../../dist/test/e2e/suite/index.js');
    const workspacePath = path.resolve(__dirname, '../fixtures/workspace');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-vscode-user-data-'));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-vscode-extensions-'));
    process.env.MMI_E2E_WORKSPACE = workspacePath;

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        '--disable-workspace-trust',
        '--skip-welcome',
        '--disable-updates',
        '--disable-gpu',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    });
  } catch (error) {
    console.error('Failed to run VSCode E2E tests');
    throw error;
  }
}

void main();
