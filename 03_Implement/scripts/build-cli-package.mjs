#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const CLI_PACKAGE_STAGE_DIRECTORY = 'artifacts/cli-package-stage';
export const CLI_PACKAGE_OUTPUT_DIRECTORY = 'artifacts/cli-package';

const REQUIRED_RUNTIME_DEPENDENCIES = ['markdown-it', 'xlsx'];

export function createCliPackageManifest(sourcePackage) {
  const dependencies = {};
  for (const name of REQUIRED_RUNTIME_DEPENDENCIES) {
    const spec = sourcePackage.dependencies?.[name];
    if (typeof spec !== 'string' || spec.length === 0) {
      throw new Error(`CLI distribution requires runtime dependency: ${name}`);
    }
    dependencies[name] = spec;
  }

  return {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description:
      'Standalone CLI distribution for Markdown Matrix Injector (MMI).',
    license: sourcePackage.license,
    type: 'module',
    bin: {
      mmi: './dist/src/cli/mmi.js',
    },
    engines: {
      node: '>=20',
    },
    repository: sourcePackage.repository,
    bugs: sourcePackage.bugs,
    homepage: sourcePackage.homepage,
    dependencies,
    bundleDependencies: true,
  };
}

export function stageCliPackage(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
  const stageDirectory = path.resolve(
    options.stageDirectory
      ?? path.join(projectRoot, CLI_PACKAGE_STAGE_DIRECTORY),
  );
  const sourcePackagePath = path.join(projectRoot, 'package.json');
  const sourceLockPath = path.join(projectRoot, 'package-lock.json');
  const sourcePackageText = fs.readFileSync(sourcePackagePath, 'utf8');
  const sourcePackage = JSON.parse(sourcePackageText);
  const manifest = createCliPackageManifest(sourcePackage);

  const compiledRoot = path.join(projectRoot, 'dist', 'src');
  const cliEntry = path.join(compiledRoot, 'cli', 'mmi.js');
  if (!fs.existsSync(cliEntry)) {
    throw new Error(
      `Compiled CLI entry is missing: ${cliEntry}. Run npm run build first.`,
    );
  }

  fs.rmSync(stageDirectory, { recursive: true, force: true });
  fs.mkdirSync(stageDirectory, { recursive: true });

  copyRequired(
    compiledRoot,
    path.join(stageDirectory, 'dist', 'src'),
    'compiled runtime',
  );
  copyRequired(
    path.join(projectRoot, 'media', 'markdown-matrix.css'),
    path.join(stageDirectory, 'media', 'markdown-matrix.css'),
    'preview stylesheet',
  );
  copyRequired(
    path.join(projectRoot, 'LICENSE'),
    path.join(stageDirectory, 'LICENSE'),
    'MMI license',
  );
  copyRequired(
    path.join(projectRoot, 'cli-distribution', 'README.md'),
    path.join(stageDirectory, 'README.md'),
    'CLI README',
  );
  copyRequired(
    path.join(projectRoot, 'cli-distribution', 'THIRD_PARTY_NOTICES.md'),
    path.join(stageDirectory, 'THIRD_PARTY_NOTICES.md'),
    'third-party notices',
  );

  fs.writeFileSync(
    path.join(stageDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return {
    projectRoot,
    stageDirectory,
    manifest,
    sourcePackageText,
    sourceLockPath,
  };
}

export function buildCliPackage(options = {}) {
  const staged = stageCliPackage(options);
  const outputDirectory = path.resolve(
    options.outputDirectory
      ?? path.join(staged.projectRoot, CLI_PACKAGE_OUTPUT_DIRECTORY),
  );
  fs.mkdirSync(outputDirectory, { recursive: true });

  if (!fs.existsSync(staged.sourceLockPath)) {
    throw new Error(
      `Source package lock is missing: ${staged.sourceLockPath}`,
    );
  }

  // Install the exact production graph already frozen and tested by the main
  // repository. The final CLI manifest is restored before packing so VS Code
  // extension metadata/devDependencies never leak into the CLI package.
  fs.writeFileSync(
    path.join(staged.stageDirectory, 'package.json'),
    staged.sourcePackageText,
  );
  fs.copyFileSync(
    staged.sourceLockPath,
    path.join(staged.stageDirectory, 'package-lock.json'),
  );
  runNpm(
    [
      'ci',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    staged.stageDirectory,
  );
  fs.writeFileSync(
    path.join(staged.stageDirectory, 'package.json'),
    `${JSON.stringify(staged.manifest, null, 2)}\n`,
  );
  fs.rmSync(path.join(staged.stageDirectory, 'package-lock.json'), {
    force: true,
  });
  fs.rmSync(
    path.join(staged.stageDirectory, 'node_modules', '.package-lock.json'),
    { force: true },
  );

  const pack = runNpm(
    ['pack', '--json', '--pack-destination', outputDirectory],
    staged.stageDirectory,
  );
  let report;
  try {
    report = JSON.parse(pack.stdout);
  } catch {
    throw new Error(`npm pack did not return JSON: ${pack.stdout}`);
  }
  const filename = report?.[0]?.filename;
  if (typeof filename !== 'string' || !filename.endsWith('.tgz')) {
    throw new Error('npm pack did not report a tarball filename.');
  }

  const tarballPath = path.isAbsolute(filename)
    ? filename
    : path.join(outputDirectory, path.basename(filename));
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`npm pack tarball is missing: ${tarballPath}`);
  }

  const digest = `sha256:${createHash('sha256')
    .update(fs.readFileSync(tarballPath))
    .digest('hex')}`;
  const digestPath = `${tarballPath}.sha256`;
  fs.writeFileSync(
    digestPath,
    `${digest.slice('sha256:'.length)}  ${path.basename(tarballPath)}\n`,
  );

  if (options.keepStage !== true) {
    fs.rmSync(staged.stageDirectory, { recursive: true, force: true });
  }

  return {
    ...staged,
    outputDirectory,
    tarballPath,
    digest,
    digestPath,
    npmPackReport: report[0],
  };
}

function copyRequired(source, destination, label) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${label}: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
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
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function isMainModule() {
  return process.argv[1]
    && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const result = buildCliPackage();
    process.stdout.write(
      `${JSON.stringify({
        tarball: result.tarballPath,
        sha256: result.digest,
        bundled: result.npmPackReport?.bundled ?? [],
      }, null, 2)}\n`,
    );
  } catch (error) {
    console.error(
      `mmi cli package: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
