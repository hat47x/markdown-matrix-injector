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
  'Known flaky autocomplete gap isolated',
  'autocomplete-boundary',
  'completion',
  'autocomplete',
] as const;
const PASTE_DROP_PROVIDER_PATTERNS = [
  'Expected command fallback compatibility path to insert paste embed',
  'Expected command fallback compatibility path to insert drop embed',
  'Expected native paste adapter to reuse shared parsing',
  'Expected native drop adapter to reuse shared parsing',
  'paste provider registration',
  'drop provider registration',
  'provider registration',
  'native provider',
  'paste-drop-boundary',
  'paste-drop-native-provider-surface',
  'paste-drop-fallback-compatibility',
  'DocumentPasteEditProvider',
  'DocumentDropEditProvider',
  'DataTransfer',
  'clipboard',
  'text/html',
  'text/uri-list',
  'paste',
  'drop',
  'drag',
] as const;
const DATA_TRANSFER_PATTERNS = [
  'DataTransfer',
  'text/html',
  'text/uri-list',
  'clipboard',
  'droppedFiles',
  'native paste adapter',
  'native drop adapter',
] as const;
const PROVIDER_CAPABILITY_PATTERNS = [
  'host lacks the API',
  'unsupported host',
  'capability=',
  'hostSupportsPasteProvider',
  'hostSupportsDropProvider',
  'registeredPasteProvider',
  'registeredDropProvider',
  'DocumentPasteEditProvider',
  'DocumentDropEditProvider',
] as const;
const ENVIRONMENT_PATTERNS = [
  'failed to launch',
  'browser',
  'display',
  'headless',
  'xvfb',
  'electron',
  'mmi_e2e_workspace is not set',
  'extension host terminated unexpectedly',
  'econnrefused',
  'spawn',
  'enoent',
  'timeout',
] as const;

type FailureCategory =
  | 'paste-drop-provider-capability'
  | 'paste-drop-data-transfer'
  | 'autocomplete-known-unstable'
  | 'environment-prerequisite'
  | 'unclassified';

type FailureSignature = {
  category: FailureCategory;
  matchedSignals: string[];
  confidence: 'high' | 'medium' | 'low';
  likelyStream: 'autocomplete' | 'paste-drop-provider' | 'environment' | 'unknown';
  nextAction: string;
  reasoning: string;
};

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
  headlessPrerequisiteState: {
    hasDisplayEnv: boolean;
    underXvfbHarness: boolean;
    recommendedRunner: string;
  };
};

async function main(): Promise<void> {
  const runtime = createRuntimeContext();

  try {
    process.env.MMI_E2E_WORKSPACE = runtime.workspacePath;
    assertHeadlessPrerequisites(runtime);

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
      triageBoundary: {
        environmentPrerequisite: 'Missing display/xvfb is categorized before provider or fallback assertions run.',
        providerFailures: 'Only provider registration/DataTransfer assertions should classify as paste-drop-provider-*.',
        autocompleteFailures: 'Known unstable autocomplete remains an independent category and does not fail paste/drop acceptance by itself.',
      },
    });
    logSection('triage-hints', {
      knownUnstableAutocompleteSignals: AUTOCOMPLETE_UNSTABLE_PATTERNS,
      pasteDropProviderSignals: PASTE_DROP_PROVIDER_PATTERNS,
      dataTransferSignals: DATA_TRANSFER_PATTERNS,
      providerCapabilitySignals: PROVIDER_CAPABILITY_PATTERNS,
      environmentSignals: ENVIRONMENT_PATTERNS,
      guidance: {
        'autocomplete-known-unstable':
          'Treat autocomplete as an independent headless instability first; do not regress paste/drop assertions until provider-specific signals appear.',
        'paste-drop-provider-capability':
          'Prioritize host capability probes, provider registration, and fallback routing. Compare capability=... payloads against integration state.',
        'paste-drop-data-transfer':
          'Prioritize DataTransfer payload shape, mime types, and adapter parsing before changing provider registration logic.',
        'environment-prerequisite':
          'Prioritize missing display/headless launch prerequisites, workspace/bootstrap failures, or extension host startup issues before blaming test logic.',
      },
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
    const signature = classifyFailure(error, runtime.launchMetadata);
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

function assertHeadlessPrerequisites(runtime: E2ERuntimeContext): void {
  if (process.platform !== 'linux') {
    return;
  }

  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.env.MMI_E2E_UNDER_XVFB === '1') {
    return;
  }

  logSection('launch:precondition-failure', {
    reason: 'missing-virtual-display',
    failureCategory: 'environment-prerequisite',
    separationFromSpec: 'Provider/fallback assertions were not executed; treat this as a headless prerequisite issue, not a paste/drop specification failure.',
    recommendation: 'Run through 03_Implement/scripts/run-vscode-e2e.sh so xvfb-run can provide a virtual display.',
    launchMetadata: runtime.launchMetadata,
  });

  throw new Error(
    'Headless prerequisite missing (environment-prerequisite): no DISPLAY/WAYLAND_DISPLAY detected, so provider/fallback assertions never started. Re-run via 03_Implement/scripts/run-vscode-e2e.sh or `cd 03_Implement && npm run test:e2e`.',
  );
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
    launchHints: runtime.launchMetadata.envHints,
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
    headlessPrerequisiteState: {
      hasDisplayEnv: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
      underXvfbHarness: process.env.MMI_E2E_UNDER_XVFB === '1',
      recommendedRunner: 'cd 03_Implement && npm run test:e2e',
    },
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

function classifyFailure(error: unknown, launchMetadata: LaunchMetadata): FailureSignature {
  const printable = JSON.stringify(formatError(error));
  const normalized = printable.toLowerCase();
  const matchedAutocompleteSignals = matchPatterns(normalized, AUTOCOMPLETE_UNSTABLE_PATTERNS);
  const matchedProviderSignals = matchPatterns(normalized, PASTE_DROP_PROVIDER_PATTERNS);
  const matchedDataTransferSignals = matchPatterns(normalized, DATA_TRANSFER_PATTERNS);
  const matchedCapabilitySignals = matchPatterns(normalized, PROVIDER_CAPABILITY_PATTERNS);
  const matchedEnvironmentSignals = matchPatterns(normalized, ENVIRONMENT_PATTERNS);

  if (matchedCapabilitySignals.length > 0) {
    return {
      category: 'paste-drop-provider-capability',
      matchedSignals: dedupe([...matchedProviderSignals, ...matchedCapabilitySignals]),
      confidence: 'high',
      likelyStream: 'paste-drop-provider',
      nextAction:
        'Inspect capability payloads, provider registration flags, and host API availability. Validate whether fallback commands should have been the proof point on this VSCode host.',
      reasoning:
        'Provider capability or registration markers were present in the failure, which usually indicates native API availability mismatches rather than autocomplete instability.',
    };
  }

  if (matchedDataTransferSignals.length > 0) {
    return {
      category: 'paste-drop-data-transfer',
      matchedSignals: dedupe([...matchedProviderSignals, ...matchedDataTransferSignals]),
      confidence: 'high',
      likelyStream: 'paste-drop-provider',
      nextAction:
        'Inspect DataTransfer contents, mime types, and adapter parsing output. Confirm whether HTML clipboard metadata or uri-list payloads were present before changing provider registration logic.',
      reasoning:
        'The failure references DataTransfer payloads or mime types, which points to paste/drop input parsing or adapter bridging rather than the autocomplete path.',
    };
  }

  if (matchedAutocompleteSignals.length > 0) {
    return {
      category: 'autocomplete-known-unstable',
      matchedSignals: matchedAutocompleteSignals,
      confidence: launchMetadata.displayServer === 'headless' ? 'high' : 'medium',
      likelyStream: 'autocomplete',
      nextAction:
        'Treat as likely headless VSCode completion instability first. Reproduce with the logged VSCode host version and display mode before blaming paste/drop provider work.',
      reasoning:
        'Only autocomplete-specific signals matched, and issue-0010 already records a known headless completion instability that is independent from paste/drop provider coverage.',
    };
  }

  if (matchedEnvironmentSignals.length > 0 || hasEnvironmentRisk(launchMetadata, normalized)) {
    return {
      category: 'environment-prerequisite',
      matchedSignals: dedupe([
        ...matchedEnvironmentSignals,
        ...(hasEnvironmentRisk(launchMetadata, normalized) ? [launchMetadata.displayServer === 'headless' ? 'headless-display' : 'display-server'] : []),
      ]),
      confidence: matchedEnvironmentSignals.length > 0 ? 'medium' : 'low',
      likelyStream: 'environment',
      nextAction:
        'Inspect launch-context and environment snapshot first. Confirm display/headless prerequisites, workspace bootstrap, and extension host startup before attributing the failure to provider logic.',
      reasoning:
        'The failure did not clearly point to a test assertion path and instead matched launch/bootstrap or host-environment signals. This category should be treated as an environment warning unless provider-specific assertions also appear.',
    };
  }

  return {
    category: 'unclassified',
    matchedSignals: dedupe([...matchedProviderSignals, ...matchedAutocompleteSignals]),
    confidence: 'low',
    likelyStream: 'unknown',
    nextAction:
      'Inspect the error payload together with runtime-context, launch-context, and workspace-context logs to determine whether this is a launch problem, autocomplete gap, or paste/drop provider regression.',
    reasoning:
      'No decisive signature matched, so additional context from the runner snapshots is required to reproduce and triage the failure.',
  };
}

function matchPatterns(normalized: string, patterns: readonly string[]): string[] {
  return patterns.filter((pattern) => normalized.includes(pattern.toLowerCase()));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function hasEnvironmentRisk(launchMetadata: LaunchMetadata, normalizedError: string): boolean {
  return launchMetadata.displayServer === 'headless' && !normalizedError.includes('autocomplete') && !normalizedError.includes('datatransfer');
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
