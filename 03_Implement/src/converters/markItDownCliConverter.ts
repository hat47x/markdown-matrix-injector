/**
 * Optional MarkItDown CLI adapter for issue-0200 baseline conversion.
 *
 * MarkItDown stays outside MMI's dependency graph. We probe the executable,
 * record the version it reports, and invoke it without a shell. Its Markdown
 * output is only a converter artifact; Candidate reconciliation remains MMI's
 * separate authority boundary.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  BaselineConverter,
  BaselineConverterInput,
  BaselineConversionOutput,
} from '../core/baselineImport.js';

const execFileAsync = promisify(execFile);

export class BaselineConverterUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BaselineConverterUnavailableError';
  }
}

export interface CommandRunOptions {
  timeoutMs: number;
}

export interface CommandRunResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  executable: string,
  args: readonly string[],
  options: CommandRunOptions,
) => Promise<CommandRunResult>;

export interface MarkItDownCliOptions {
  executable?: string;
  timeoutMs?: number;
  outputFileName?: string;
  runner?: CommandRunner;
}

interface ResolvedMarkItDownCliOptions {
  executable: string;
  timeoutMs: number;
  outputFileName: string;
  runner: CommandRunner;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export async function createMarkItDownCliConverter(
  options: MarkItDownCliOptions = {},
): Promise<BaselineConverter> {
  const resolved = resolveOptions(options);
  const version = await probeVersion(resolved);

  return {
    descriptor: {
      id: 'microsoft.markitdown-cli',
      version,
    },
    async convert(input: BaselineConverterInput): Promise<BaselineConversionOutput> {
      return convertWithMarkItDown(input, resolved);
    },
  };
}

async function probeVersion(options: ResolvedMarkItDownCliOptions): Promise<string> {
  let result: CommandRunResult;
  try {
    result = await options.runner(
      options.executable,
      ['--version'],
      { timeoutMs: options.timeoutMs },
    );
  } catch (error) {
    throw asUnavailableOrCommandError(
      error,
      `MarkItDown executable is unavailable: ${options.executable}`,
      'MarkItDown version probe failed',
    );
  }

  const line = result.stdout.trim() || result.stderr.trim();
  const match = /^markitdown\s+([^\s]+)$/iu.exec(line);
  if (!match) {
    throw new Error(`Unrecognized MarkItDown --version output: ${JSON.stringify(line)}`);
  }
  return match[1];
}

async function convertWithMarkItDown(
  input: BaselineConverterInput,
  options: ResolvedMarkItDownCliOptions,
): Promise<BaselineConversionOutput> {
  assertSupportedOptions(input.options);
  fs.mkdirSync(input.outputRoot, { recursive: true });

  const outputPath = path.resolve(input.outputRoot, options.outputFileName);
  const relative = path.relative(path.resolve(input.outputRoot), outputPath);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error('MarkItDown outputFileName must stay under outputRoot');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  // Never accept a stale output left by a previous failed converter run.
  fs.rmSync(outputPath, { force: true });

  const args = [input.sourcePath, '-o', outputPath];
  if (input.options.keepDataUris === true) args.push('--keep-data-uris');

  try {
    await options.runner(options.executable, args, { timeoutMs: options.timeoutMs });
  } catch (error) {
    throw asUnavailableOrCommandError(
      error,
      `MarkItDown executable became unavailable: ${options.executable}`,
      'MarkItDown conversion failed',
    );
  }

  if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isFile()) {
    throw new Error('MarkItDown reported success without creating its Markdown output');
  }
  const bytes = fs.readFileSync(outputPath);
  return {
    artifacts: [{
      id: 'markitdown-markdown',
      kind: 'markdown',
      relativePath: path.relative(input.outputRoot, outputPath).split(path.sep).join('/'),
      contentDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      mediaType: 'text/markdown',
    }],
  };
}

function assertSupportedOptions(
  options: Readonly<Record<string, string | number | boolean>>,
): void {
  const unsupported = Object.keys(options).filter((key) => key !== 'keepDataUris');
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported MarkItDown conversion option(s): ${unsupported.sort().join(', ')}`,
    );
  }
  if (
    options.keepDataUris !== undefined
    && typeof options.keepDataUris !== 'boolean'
  ) {
    throw new Error('MarkItDown keepDataUris must be boolean');
  }
}

function resolveOptions(options: MarkItDownCliOptions): ResolvedMarkItDownCliOptions {
  const executable = options.executable ?? 'markitdown';
  if (!executable.trim()) throw new Error('MarkItDown executable must not be empty');

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('MarkItDown timeoutMs must be a positive integer');
  }

  const outputFileName = options.outputFileName ?? 'baseline.md';
  if (!outputFileName.trim()) throw new Error('MarkItDown outputFileName must not be empty');
  const portableOutput = outputFileName.replace(/\\/gu, '/');
  const normalizedOutput = path.posix.normalize(portableOutput);
  if (
    path.posix.isAbsolute(outputFileName)
    || path.win32.isAbsolute(outputFileName)
    || portableOutput.split('/').includes('..')
    || normalizedOutput === '.'
    || normalizedOutput.endsWith('/')
  ) {
    throw new Error('MarkItDown outputFileName must be a contained relative file path');
  }

  return {
    executable,
    timeoutMs,
    outputFileName: normalizedOutput,
    runner: options.runner ?? defaultCommandRunner,
  };
}

const defaultCommandRunner: CommandRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    timeout: options.timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8',
  });
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
};

function asUnavailableOrCommandError(
  error: unknown,
  unavailableMessage: string,
  commandMessage: string,
): Error {
  if (isNodeError(error) && error.code === 'ENOENT') {
    return new BaselineConverterUnavailableError(unavailableMessage, { cause: error });
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${commandMessage}: ${detail}`, { cause: error });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
