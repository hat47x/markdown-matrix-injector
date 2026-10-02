#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tarball = process.argv[2];
if (!tarball) {
  console.error('usage: node scripts/verify-cli-package.mjs <mmi-cli.tgz>');
  process.exitCode = 2;
} else {
  try {
    const result = verifyCliPackage(path.resolve(tarball));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(
      `mmi cli package verification: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

export function verifyCliPackage(tarballPath) {
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`CLI tarball is missing: ${tarballPath}`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-package-'));
  const prefix = path.join(root, 'install');
  const workspace = path.join(root, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });

  runNpm([
    'install',
    '--prefix',
    prefix,
    '--ignore-scripts',
    '--offline',
    '--no-audit',
    '--no-fund',
    tarballPath,
  ], root);

  const packageRoot = path.join(
    prefix,
    'node_modules',
    'markdown-matrix-injector',
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  if (packageJson.bin?.mmi !== './dist/src/cli/mmi.js') {
    throw new Error('Installed CLI package does not expose the expected mmi binary.');
  }

  const bin = path.join(
    prefix,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'mmi.cmd' : 'mmi',
  );
  if (!fs.existsSync(bin)) {
    throw new Error(`Installed mmi binary is missing: ${bin}`);
  }

  fs.writeFileSync(
    path.join(workspace, 'data.csv'),
    'ID,Name\n1,Alpha\n',
  );
  fs.writeFileSync(
    path.join(docs, 'spec.md'),
    '# Spec\n\n![[../data.csv#Sheet1|A1:B2?header=first]]\n',
  );

  const help = run(bin, ['--help'], workspace);
  const check = run(bin, ['check', 'docs', '--root', '.'], workspace);
  const render = run(
    bin,
    ['render', 'docs/spec.md', '--root', '.'],
    workspace,
  );

  if (help.status !== 0 || !help.stdout.includes('Usage: mmi')) {
    throw new Error(`mmi --help failed:\n${help.stderr || help.stdout}`);
  }
  if (check.status !== 0) {
    throw new Error(`mmi check failed:\n${check.stderr || check.stdout}`);
  }
  if (
    render.status !== 0
    || !render.stdout.includes('| ID | Name |')
    || !render.stdout.includes('| 1 | Alpha |')
  ) {
    throw new Error(`mmi render failed:\n${render.stderr || render.stdout}`);
  }

  return {
    schema: 'mmi.cli-package-verification/v1',
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    package: {
      name: packageJson.name,
      version: packageJson.version,
    },
    checks: {
      offlineInstall: 'passed',
      bin: 'passed',
      help: 'passed',
      check: 'passed',
      render: 'passed',
    },
  };
}

function runNpm(args, cwd) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} failed with exit ${result.status}:\n${result.stderr}`,
    );
  }
  return result;
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
