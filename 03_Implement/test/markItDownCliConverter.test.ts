import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BaselineConverterUnavailableError,
  createMarkItDownCliConverter,
  type CommandRunner,
} from '../src/converters/markItDownCliConverter.js';

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-'));
  const sourcePath = path.join(root, 'source.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, 'fixture-source');
  return { root, sourcePath, outputRoot };
}

test('adapter probes actual CLI version and emits one verified Markdown artifact', async () => {
  const { sourcePath, outputRoot } = workspace();
  const calls: { executable: string; args: readonly string[]; timeoutMs: number }[] = [];

  const runner: CommandRunner = async (executable, args, options) => {
    calls.push({ executable, args: [...args], timeoutMs: options.timeoutMs });
    if (args[0] === '--version') {
      return { stdout: 'markitdown 0.1.8\n', stderr: '' };
    }
    const outputAt = args.indexOf('-o');
    assert.notEqual(outputAt, -1);
    fs.mkdirSync(path.dirname(args[outputAt + 1]), { recursive: true });
    fs.writeFileSync(args[outputAt + 1], '# Sheet1\n\n| A |\n|---|\n| 1 |\n');
    return { stdout: '', stderr: '' };
  };

  const converter = await createMarkItDownCliConverter({
    executable: '/opt/tools/markitdown',
    timeoutMs: 4321,
    runner,
  });
  assert.deepEqual(converter.descriptor, {
    id: 'microsoft.markitdown-cli',
    version: '0.1.8',
  });

  const conversion = await converter.convert({
    sourcePath,
    outputRoot,
    options: {},
  });

  assert.deepEqual(calls.map((call) => call.executable), [
    '/opt/tools/markitdown',
    '/opt/tools/markitdown',
  ]);
  assert.deepEqual(calls[0].args, ['--version']);
  assert.deepEqual(calls[1].args, [
    sourcePath,
    '-o',
    path.join(outputRoot, 'baseline.md'),
  ]);
  assert.deepEqual(calls.map((call) => call.timeoutMs), [4321, 4321]);

  const output = path.join(outputRoot, 'baseline.md');
  assert.equal(conversion.artifacts.length, 1);
  assert.deepEqual(conversion.artifacts[0], {
    id: 'markitdown-markdown',
    kind: 'markdown',
    relativePath: 'baseline.md',
    contentDigest: sha256(fs.readFileSync(output)),
    mediaType: 'text/markdown',
  });
});

test('keepDataUris is opt-in and plugins/cloud flags are never injected', async () => {
  const { sourcePath, outputRoot } = workspace();
  let conversionArgs: readonly string[] = [];
  const runner: CommandRunner = async (_executable, args) => {
    if (args[0] === '--version') return { stdout: 'markitdown 0.1.8\n', stderr: '' };
    conversionArgs = [...args];
    const outputAt = args.indexOf('-o');
    fs.mkdirSync(path.dirname(args[outputAt + 1]), { recursive: true });
    fs.writeFileSync(args[outputAt + 1], 'ok');
    return { stdout: '', stderr: '' };
  };

  const converter = await createMarkItDownCliConverter({ runner });
  await converter.convert({
    sourcePath,
    outputRoot,
    options: { keepDataUris: true },
  });

  assert.equal(conversionArgs.includes('--keep-data-uris'), true);
  assert.equal(conversionArgs.includes('--use-plugins'), false);
  assert.equal(conversionArgs.includes('-p'), false);
  assert.equal(conversionArgs.includes('-d'), false);
  assert.equal(conversionArgs.includes('--use-cu'), false);
});

test('unsupported options are rejected rather than silently changing provenance', async () => {
  const { sourcePath, outputRoot } = workspace();
  let conversionRan = false;
  const runner: CommandRunner = async (_executable, args) => {
    if (args[0] === '--version') return { stdout: 'markitdown 0.1.8\n', stderr: '' };
    conversionRan = true;
    return { stdout: '', stderr: '' };
  };
  const converter = await createMarkItDownCliConverter({ runner });

  await assert.rejects(
    converter.convert({
      sourcePath,
      outputRoot,
      options: { unknown: true },
    }),
    /Unsupported MarkItDown conversion option/u,
  );
  assert.equal(conversionRan, false);
});

test('a failed run cannot reuse a stale Markdown artifact', async () => {
  const { sourcePath, outputRoot } = workspace();
  fs.mkdirSync(outputRoot);
  const stale = path.join(outputRoot, 'baseline.md');
  fs.writeFileSync(stale, 'stale');

  const runner: CommandRunner = async (_executable, args) => {
    if (args[0] === '--version') return { stdout: 'markitdown 0.1.8\n', stderr: '' };
    throw new Error('converter failed');
  };
  const converter = await createMarkItDownCliConverter({ runner });

  await assert.rejects(
    converter.convert({ sourcePath, outputRoot, options: {} }),
    /MarkItDown conversion failed/u,
  );
  assert.equal(fs.existsSync(stale), false);
});

test('missing executable is a typed unavailable condition', async () => {
  const missing = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
  const runner: CommandRunner = async () => {
    throw missing;
  };

  await assert.rejects(
    createMarkItDownCliConverter({ runner }),
    (error: unknown) => error instanceof BaselineConverterUnavailableError,
  );
});

test('version/output path/timeout validation fail before conversion', async () => {
  const badVersion: CommandRunner = async () => ({
    stdout: 'unexpected version banner\n',
    stderr: '',
  });
  await assert.rejects(
    createMarkItDownCliConverter({ runner: badVersion }),
    /Unrecognized MarkItDown --version output/u,
  );
  await assert.rejects(
    createMarkItDownCliConverter({ timeoutMs: 0, runner: badVersion }),
    /positive integer/u,
  );
  await assert.rejects(
    createMarkItDownCliConverter({ outputFileName: '../escape.md', runner: badVersion }),
    /contained relative path/u,
  );
  await assert.rejects(
    createMarkItDownCliConverter({ outputFileName: 'C:\\temp\\escape.md', runner: badVersion }),
    /contained relative path/u,
  );
});
