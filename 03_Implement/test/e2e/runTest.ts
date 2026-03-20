import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_PREFIX = '[mmi:e2e:runner]';
const AUTOCOMPLETE_UNSTABLE_PATTERNS = [
  'Expected autocomplete suggestions after ![[.',
  'Expected sheet completion after #.',
  'Expected parameter completion after ?.',
  'completion',
  'autocomplete',
] as const;
const PASTE_DROP_PATTERNS = ['paste', 'drop', 'drag', 'DataTransfer', 'clipboard'] as const;

type E2ERuntimeContext = {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  workspacePath: string;
  userDataDir: string;
  extensionsDir: string;
  launchArgs: string[];
  startedAtMs: number;
  packageJson: Record<string, unknown>;
  packageJsonPath: string;
  fixtureSnapshot: WorkspaceSnapshot;
  launchMetadata: LaunchMetadata;
};

type WorkspaceSnapshot = {
  fixtureFileCount: number;
  fixtureFiles: string[];
  invalidXmlPath: string;
  markdownFiles: string[];
  dataFiles: string[];
  hasWorkspaceFile: boolean;
};

type LaunchMetadata = {
  executablePath?: string;
  requestedVersion?: string;
  platform: string;
  userHome: string;
  tmpdir: string;
  ci: boolean;
  displayServer: 'wayland' | 'x11' | 'headless';
  envHints: string[];
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
      packageJsonPath: runtime.packageJsonPath,
      packageJsonSummary: summarizePackageJson(runtime.packageJson),
    });

    logSection('workspace-context', runtime.fixtureSnapshot);
    logSection('launch-context', {
      ...runtime.launchMetadata,
      launchArgs: runtime.launchArgs,
      extensionDevelopmentExists: fs.existsSync(runtime.extensionDevelopmentPath),
      extensionTestsExists: fs.existsSync(runtime.extensionTestsPath),
    });
    logSection('triage-hints', {
      knownUnstableAutocompleteSignals: AUTOCOMPLETE_UNSTABLE_PATTERNS,
      pasteDropSignals: PASTE_DROP_PATTERNS,
      guidance:
        'If failureSignature.category=autocomplete-known-unstable, prioritize VSCode/headless completion investigation. If category=paste-drop-provider, prioritize DataTransfer / provider capability investigation.',
    });
    logSection('launch:start', { launchArgs: runtime.launchArgs });

    await runTests({
      extensionDevelopmentPath: runtime.extensionDevelopmentPath,
      extensionTestsPath: runtime.extensionTestsPath,
      launchArgs: runtime.launchArgs,
    });

    logSection('launch:success', {
      durationMs: Date.now() - runtime.startedAtMs,
      launchMetadata: runtime.launchMetadata,
    });
  } catch (error) {
    const signature = classifyFailure(error);
    logSection('launch:failure', {
      durationMs: Date.now() - runtime.startedAtMs,
      failureSignature: signature,
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
  const packageJsonPath = path.join(extensionDevelopmentPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
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
    packageJson,
    packageJsonPath,
    fixtureSnapshot: describeWorkspace(workspacePath),
    launchMetadata: collectLaunchMetadata(packageJson),
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

function describeWorkspace(workspacePath: string): WorkspaceSnapshot {
  const files = collectRelativeEntries(workspacePath);
  const normalizedWorkspaceFile = files.find((entry) => entry.endsWith('.code-workspace'));
  return {
    fixtureFileCount: files.length,
    fixtureFiles: files,
    invalidXmlPath: path.join(workspacePath, 'data', 'invalid.xml'),
    markdownFiles: files.filter((entry) => entry.endsWith('.md')),
    dataFiles: files.filter((entry) => /(\.csv|\.xlsx|\.xml)$/i.test(entry)),
    hasWorkspaceFile: normalizedWorkspaceFile !== undefined,
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
    displayServer: runtime.launchMetadata.displayServer,
    workspaceExists: fs.existsSync(runtime.workspacePath),
    extensionTestsExists: fs.existsSync(runtime.extensionTestsPath),
    extensionDevelopmentExists: fs.existsSync(runtime.extensionDevelopmentPath),
    workspaceSnapshot: runtime.fixtureSnapshot,
    packageJsonSummary: summarizePackageJson(runtime.packageJson),
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
      'HEADLESS',
      'VSCODE_CLI',
    ]),
  };
}

function collectLaunchMetadata(packageJson: Record<string, unknown>): LaunchMetadata {
  const requestedVersion = readNestedString(packageJson, ['devDependencies', '@vscode/test-electron']);
  const executablePath = typeof process.env.VSCODE_EXECUTABLE_PATH === 'string' ? process.env.VSCODE_EXECUTABLE_PATH : undefined;
  const envHints = [
    process.env.CI === 'true' ? 'ci' : undefined,
    executablePath ? 'custom-vscode-executable' : undefined,
    process.env.DISPLAY ? 'x11-display' : undefined,
    process.env.WAYLAND_DISPLAY ? 'wayland-display' : undefined,
    !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ? 'headless-display' : undefined,
  ].filter((value): value is string => value !== undefined);

  return {
    executablePath,
    requestedVersion,
    platform: `${process.platform}/${process.arch}`,
    userHome: os.homedir(),
    tmpdir: os.tmpdir(),
    ci: process.env.CI === 'true',
    displayServer: detectDisplayServer(),
    envHints,
  };
}

function summarizePackageJson(packageJson: Record<string, unknown>): Record<string, unknown> {
  return {
    name: packageJson.name,
    version: packageJson.version,
    engines: packageJson.engines,
    packageManager: packageJson.packageManager,
    vscodeTestElectron: readNestedString(packageJson, ['devDependencies', '@vscode/test-electron']),
    vscodeEngine: readNestedString(packageJson, ['engines', 'vscode']),
  };
}

function classifyFailure(error: unknown): Record<string, unknown> {
  const printable = JSON.stringify(formatError(error));
  const normalized = printable.toLowerCase();
  const matchedAutocompleteSignals = AUTOCOMPLETE_UNSTABLE_PATTERNS.filter((pattern) => normalized.includes(pattern.toLowerCase()));
  const matchedPasteDropSignals = PASTE_DROP_PATTERNS.filter((pattern) => normalized.includes(pattern.toLowerCase()));

  if (matchedPasteDropSignals.length > 0) {
    return {
      category: 'paste-drop-provider',
      matchedSignals: matchedPasteDropSignals,
      nextAction:
        'Inspect DataTransfer payloads, provider registration, and native capability checks before changing autocomplete assertions.',
    };
  }

  if (matchedAutocompleteSignals.length > 0) {
    return {
      category: 'autocomplete-known-unstable',
      matchedSignals: matchedAutocompleteSignals,
      nextAction:
        'Treat as likely headless VSCode completion instability first; confirm completion provider registration and host version before blaming paste/drop.',
    };
  }

  return {
    category: 'unclassified',
    matchedSignals: [],
    nextAction:
      'Inspect the error payload and runtime-context / launch-context logs to determine whether the failure is in workspace setup, launch, or provider behavior.',
  };
}

function detectDisplayServer(): LaunchMetadata['displayServer'] {
  if (process.env.WAYLAND_DISPLAY) {
    return 'wayland';
  }
  if (process.env.DISPLAY) {
    return 'x11';
  }
  return 'headless';
}

function readNestedString(source: Record<string, unknown>, pathSegments: string[]): string | undefined {
  let current: unknown = source;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
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
