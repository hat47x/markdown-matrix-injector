import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_PREFIX = '[mmi:e2e:runner]';

type E2ERuntimeContext = {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  workspacePath: string;
  userDataDir: string;
  extensionsDir: string;
  launchArgs: string[];
  startedAtMs: number;
};

async function main(): Promise<void> {
  const runtime = createRuntimeContext();

  try {
    process.env.MMI_E2E_WORKSPACE = runtime.workspacePath;

    logSection('runtime-context', {
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      extensionDevelopmentPath: runtime.extensionDevelopmentPath,
      extensionTestsPath: runtime.extensionTestsPath,
      workspacePath: runtime.workspacePath,
      userDataDir: runtime.userDataDir,
      extensionsDir: runtime.extensionsDir,
    });

    logSection('workspace-fixture', describeWorkspace(runtime.workspacePath));
    logSection('launch:start', { launchArgs: runtime.launchArgs });

    await runTests({
      extensionDevelopmentPath: runtime.extensionDevelopmentPath,
      extensionTestsPath: runtime.extensionTestsPath,
      launchArgs: runtime.launchArgs,
    });

    logSection('launch:success', {
      durationMs: Date.now() - runtime.startedAtMs,
    });
  } catch (error) {
    logSection('launch:failure', {
      durationMs: Date.now() - runtime.startedAtMs,
      error: formatError(error),
      environment: collectEnvironmentSnapshot(runtime),
    });
    console.error(`${LOG_PREFIX} failed to run VSCode E2E tests`);
    throw error;
  }
}

function createRuntimeContext(): E2ERuntimeContext {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, '../../dist/test/e2e/suite/index.js');
  const workspacePath = createE2EWorkspace();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-vscode-user-data-'));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-vscode-extensions-'));
  const launchArgs = [
    workspacePath,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--disable-updates',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
  ];

  return {
    extensionDevelopmentPath,
    extensionTestsPath,
    workspacePath,
    userDataDir,
    extensionsDir,
    launchArgs,
    startedAtMs: Date.now(),
  };
}

function createE2EWorkspace(): string {
  const templateRoot = path.resolve(__dirname, '../fixtures/workspace');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-vscode-workspace-'));
  fs.cpSync(templateRoot, workspaceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, 'data', 'invalid.xml'),
    '<root><worksheet name="Sheet1"></worksheet></root>',
    'utf8',
  );

  return workspaceRoot;
}

function describeWorkspace(workspacePath: string): Record<string, unknown> {
  const files = collectRelativeEntries(workspacePath);
  return {
    fixtureFileCount: files.length,
    fixtureFiles: files,
    invalidXmlPath: path.join(workspacePath, 'data', 'invalid.xml'),
  };
}

function collectRelativeEntries(rootPath: string): string[] {
  const entries: string[] = [];
  const queue = [''];

  while (queue.length > 0) {
    const relativeDir = queue.shift();
    if (relativeDir === undefined) {
      continue;
    }

    const absoluteDir = path.join(rootPath, relativeDir);
    const children = fs.readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

    for (const child of children) {
      const childRelativePath = path.join(relativeDir, child.name);
      const normalizedPath = childRelativePath.split(path.sep).join('/');
      if (child.isDirectory()) {
        queue.push(childRelativePath);
        continue;
      }
      entries.push(normalizedPath);
    }
  }

  return entries;
}

function collectEnvironmentSnapshot(runtime: E2ERuntimeContext): Record<string, unknown> {
  return {
    pid: process.pid,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    tmpdir: os.tmpdir(),
    workspaceExists: fs.existsSync(runtime.workspacePath),
    extensionTestsExists: fs.existsSync(runtime.extensionTestsPath),
    extensionDevelopmentExists: fs.existsSync(runtime.extensionDevelopmentPath),
    userDataEntries: safeReadDir(runtime.userDataDir),
    extensionsEntries: safeReadDir(runtime.extensionsDir),
    workspaceEntries: safeReadDir(runtime.workspacePath),
    env: pickEnv([
      'DISPLAY',
      'WAYLAND_DISPLAY',
      'XDG_RUNTIME_DIR',
      'ELECTRON_RUN_AS_NODE',
      'MMI_E2E_WORKSPACE',
      'CI',
      'npm_config_user_agent',
    ]),
  };
}

function safeReadDir(targetPath: string): string[] {
  try {
    return fs.readdirSync(targetPath).sort();
  } catch (error) {
    return [`<unavailable: ${formatError(error)}> `].map((entry) => entry.trimEnd());
  }
}

function pickEnv(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }

  return {
    message: String(error),
  };
}

function logSection(label: string, payload: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${label}`);
  console.log(JSON.stringify(payload, null, 2));
}

void main();
