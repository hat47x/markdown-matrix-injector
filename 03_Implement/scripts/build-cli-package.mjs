#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { verifyCliPackage } from './verify-cli-package.mjs';
import { spawnPlan } from './npm-spawn.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const CLI_PACKAGE_STAGE_DIRECTORY = 'artifacts/cli-package-stage';
export const CLI_PACKAGE_OUTPUT_DIRECTORY = 'artifacts/cli-package';

const REQUIRED_RUNTIME_DEPENDENCIES = ['markdown-it', 'parse5', 'saxes', 'xlsx', 'yaml'];

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
      mmi: './dist/src/cli/bootstrap.js',
      'mmi-mcp': './dist/src/cli/mcp.js',
    },
    engines: {
      node: '>=20',
    },
    repository: sourcePackage.repository,
    bugs: sourcePackage.bugs,
    homepage: sourcePackage.homepage,
    files: [
      'dist',
      'build-identity.json',
      'media',
      'README.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
    ],
    dependencies,
    bundleDependencies: true,
  };
}

/**
 * tarballへ埋め込むビルド識別（mmi.build-identity/v1の固定部分）。
 * コミットは作成元のgit HEAD（取れなければ環境変数MMI_BUILD_COMMIT）、
 * lock digestは作成元package-lock.jsonの生バイト列のsha256とする。
 * 取れない項目はnullのまま残し、推測で埋めない。
 */
export function createBuildIdentity(projectRoot, lockPath) {
  let commit = null;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (head.status === 0 && /^[0-9a-f]{40}$/u.test(head.stdout.trim())) {
    commit = head.stdout.trim();
  } else if (/^[0-9a-f]{40}$/u.test(process.env.MMI_BUILD_COMMIT ?? '')) {
    commit = process.env.MMI_BUILD_COMMIT;
  }
  const lockfileDigest = fs.existsSync(lockPath)
    ? `sha256:${createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex')}`
    : null;
  return {
    schema: 'mmi.build-identity/v1',
    commit,
    lockfileDigest,
    distribution: 'tarball',
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
  const cliEntry = path.join(compiledRoot, 'cli', 'bootstrap.js');
  if (!fs.existsSync(cliEntry)) {
    throw new Error(
      `Compiled CLI bootstrap is missing: ${cliEntry}. Run npm run build:product first.`,
    );
  }
  const mcpEntry = path.join(compiledRoot, 'cli', 'mcp.js');
  if (!fs.existsSync(mcpEntry)) {
    throw new Error(
      `Compiled MCP entry is missing: ${mcpEntry}. Run npm run build:product first.`,
    );
  }

  fs.rmSync(stageDirectory, { recursive: true, force: true });
  fs.mkdirSync(stageDirectory, { recursive: true });

  const runtimeFiles = [...new Set([
    ...copyRuntimeModuleGraph(
      cliEntry,
      compiledRoot,
      path.join(stageDirectory, 'dist', 'src'),
    ),
    ...copyRuntimeModuleGraph(
      mcpEntry,
      compiledRoot,
      path.join(stageDirectory, 'dist', 'src'),
    ),
  ])].sort();
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
  fs.writeFileSync(
    path.join(stageDirectory, 'build-identity.json'),
    `${JSON.stringify(createBuildIdentity(projectRoot, sourceLockPath), null, 2)}\n`,
  );

  return {
    projectRoot,
    stageDirectory,
    manifest,
    sourcePackageText,
    sourceLockPath,
    runtimeFiles,
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

  let verification;
  try {
    verification = options.verify === false
      ? undefined
      : verifyTarballOrRemove(tarballPath, digestPath);
  } finally {
    if (options.keepStage !== true) {
      fs.rmSync(staged.stageDirectory, { recursive: true, force: true });
    }
  }

  return {
    ...staged,
    outputDirectory,
    tarballPath,
    digest,
    digestPath,
    npmPackReport: report[0],
    ...(verification ? { verification } : {}),
  };
}

export function collectRuntimeModuleGraph(entryPath, rootDirectory) {
  const root = fs.realpathSync(path.resolve(rootDirectory));
  const entry = fs.realpathSync(path.resolve(entryPath));
  if (!pathWithin(entry, root)) {
    throw new Error(`CLI entry must stay within compiled root: ${entry}`);
  }

  const pending = [entry];
  const seen = new Set();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const source = fs.readFileSync(current, 'utf8');
    for (const specifier of relativeModuleSpecifiers(source, current)) {
      const resolved = resolveRuntimeSpecifier(current, specifier, root);
      if (!seen.has(resolved)) pending.push(resolved);
    }
  }

  // '/'-separated on every OS, so the list compares with package and zip entries.
  return [...seen]
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .sort();
}

export function copyRuntimeModuleGraph(
  entryPath,
  rootDirectory,
  destinationRoot,
) {
  const root = fs.realpathSync(path.resolve(rootDirectory));
  const files = collectRuntimeModuleGraph(entryPath, root);
  for (const relative of files) {
    copyRequired(
      path.join(root, relative),
      path.join(destinationRoot, relative),
      `CLI runtime module ${relative}`,
    );
  }
  return files;
}

export function relativeModuleSpecifiers(source, filename = 'runtime.js') {
  const found = [];
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  const add = (node) => {
    if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
      found.push(node.text);
    }
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
    ) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
    ) {
      add(node.arguments[0]);
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments.length === 1
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function resolveRuntimeSpecifier(importer, specifier, root) {
  const raw = path.resolve(path.dirname(importer), specifier);
  const candidates = path.extname(raw)
    ? [raw]
    : [raw, `${raw}.js`, path.join(raw, 'index.js')];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const real = fs.realpathSync(candidate);
    if (!pathWithin(real, root)) {
      throw new Error(
        `CLI runtime import escapes compiled root: ${specifier} from ${importer}`,
      );
    }
    return real;
  }

  throw new Error(
    `CLI runtime import is missing: ${specifier} from ${importer}`,
  );
}

function pathWithin(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function verifyTarballOrRemove(
  tarballPath,
  digestPath,
  verifier = verifyCliPackage,
) {
  try {
    return verifier(tarballPath);
  } catch (error) {
    fs.rmSync(tarballPath, { force: true });
    fs.rmSync(digestPath, { force: true });
    throw error;
  }
}

function copyRequired(source, destination, label) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${label}: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function runNpm(args, cwd) {
  const plan = spawnPlan('npm', args);
  const result = spawnSync(plan.file, plan.args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: plan.shell,
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
        runtimeFiles: result.runtimeFiles,
        bundled: result.npmPackReport?.bundled ?? [],
        verification: result.verification ?? null,
      }, null, 2)}\n`,
    );
  } catch (error) {
    console.error(
      `mmi cli package: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
