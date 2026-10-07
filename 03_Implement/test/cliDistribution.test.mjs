import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectRuntimeModuleGraph,
  createCliPackageManifest,
  relativeModuleSpecifiers,
  stageCliPackage,
  verifyTarballOrRemove,
} from '../scripts/build-cli-package.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-dist-'));
  writeJson(path.join(root, 'package.json'), {
    name: 'markdown-matrix-injector',
    version: '0.1.0',
    description: 'source extension manifest',
    publisher: 'hat47x',
    main: './dist/src/extension.js',
    contributes: { commands: [] },
    license: 'MIT',
    type: 'module',
    repository: {
      type: 'git',
      url: 'https://github.com/hat47x/markdown-matrix-injector',
    },
    bugs: {
      url: 'https://github.com/hat47x/markdown-matrix-injector/issues',
    },
    homepage: 'https://github.com/hat47x/markdown-matrix-injector#readme',
    dependencies: {
      'markdown-it': '^14.1.0',
      saxes: '6.0.0',
      xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
      yaml: '2.9.1',
    },
    devDependencies: {
      typescript: '^5.9.2',
    },
  });
  write(
    path.join(root, 'dist/src/cli/bootstrap.js'),
    "#!/usr/bin/env node\nawait import('./mmi.js');\n",
  );
  write(
    path.join(root, 'dist/src/cli/mmi.js'),
    "#!/usr/bin/env node\nimport '../core/example.js';\nimport 'xlsx';\n",
  );
  write(
    path.join(root, 'dist/src/core/example.js'),
    "export { nested } from './nested.js';\n",
  );
  write(path.join(root, 'dist/src/core/nested.js'), 'export const nested = true;\n');
  write(path.join(root, 'dist/src/extension.js'), "import 'vscode';\n");
  write(
    path.join(root, 'dist/src/experimental/research.js'),
    'export const research = true;\n',
  );
  write(path.join(root, 'media/markdown-matrix.css'), '.mmi {}\n');
  write(path.join(root, 'LICENSE'), 'MIT fixture\n');
  write(path.join(root, 'cli-distribution/README.md'), '# CLI\n');
  write(
    path.join(root, 'cli-distribution/THIRD_PARTY_NOTICES.md'),
    '# notices\n',
  );
  return root;
}

test('CLI distribution manifest contains runtime-only package contract', () => {
  const manifest = createCliPackageManifest({
    name: 'markdown-matrix-injector',
    version: '0.1.0',
    license: 'MIT',
    publisher: 'hat47x',
    main: './dist/src/extension.js',
    contributes: { commands: [] },
    repository: { type: 'git', url: 'https://example.invalid/repo' },
    dependencies: {
      'markdown-it': '^14.1.0',
      saxes: '6.0.0',
      xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
      yaml: '2.9.1',
      developmentOnlyByMistake: '1.0.0',
    },
  });

  assert.equal(manifest.name, 'markdown-matrix-injector');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.bin, { mmi: './dist/src/cli/bootstrap.js' });
  assert.deepEqual(manifest.engines, { node: '>=20' });
  assert.equal(manifest.bundleDependencies, true);
  assert.deepEqual(manifest.files, [
    'dist',
    'media',
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ]);
  assert.deepEqual(manifest.dependencies, {
    'markdown-it': '^14.1.0',
    saxes: '6.0.0',
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    yaml: '2.9.1',
  });
  assert.equal('publisher' in manifest, false);
  assert.equal('contributes' in manifest, false);
  assert.equal('main' in manifest, false);
});

test('CLI staging copies compiled runtime and disclosure files, not extension manifest fields', () => {
  const root = fixture();
  const stage = path.join(root, 'stage');
  const result = stageCliPackage({
    projectRoot: root,
    stageDirectory: stage,
  });

  assert.equal(result.stageDirectory, stage);
  assert.equal(fs.existsSync(path.join(stage, 'dist/src/cli/mmi.js')), true);
  assert.equal(fs.existsSync(path.join(stage, 'dist/src/core/example.js')), true);
  assert.equal(fs.existsSync(path.join(stage, 'dist/src/core/nested.js')), true);
  assert.equal(fs.existsSync(path.join(stage, 'dist/src/extension.js')), false);
  assert.equal(
    fs.existsSync(path.join(stage, 'dist/src/experimental/research.js')),
    false,
  );
  assert.deepEqual(result.runtimeFiles, [
    'cli/bootstrap.js',
    'cli/mmi.js',
    'core/example.js',
    'core/nested.js',
  ]);
  assert.equal(
    fs.existsSync(path.join(stage, 'media/markdown-matrix.css')),
    true,
  );
  assert.equal(fs.existsSync(path.join(stage, 'LICENSE')), true);
  assert.equal(fs.existsSync(path.join(stage, 'README.md')), true);
  assert.equal(
    fs.existsSync(path.join(stage, 'THIRD_PARTY_NOTICES.md')),
    true,
  );

  const manifest = JSON.parse(
    fs.readFileSync(path.join(stage, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.bin.mmi, './dist/src/cli/bootstrap.js');
  assert.equal(manifest.engines.node, '>=20');
  assert.equal(manifest.bundleDependencies, true);
  assert.deepEqual(manifest.files, [
    'dist',
    'media',
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ]);
  assert.equal('publisher' in manifest, false);
  assert.equal('activationEvents' in manifest, false);
  assert.equal('contributes' in manifest, false);
});





test('runtime import parsing ignores comments and string literals', () => {
  assert.deepEqual(
    relativeModuleSpecifiers(`
      // import './commented.js';
      const note = "import './string.js'";
      import './real.js';
      export { value } from '../shared.js';
      async function load() { return import('./lazy.js'); }
      const legacy = require('./legacy.cjs');
    `),
    ['./real.js', '../shared.js', './lazy.js', './legacy.cjs'],
  );
});

test('runtime graph ignores external packages and follows local imports recursively', () => {
  const root = fixture();
  assert.deepEqual(
    collectRuntimeModuleGraph(
      path.join(root, 'dist/src/cli/bootstrap.js'),
      path.join(root, 'dist/src'),
    ),
    [
      'cli/mmi.js',
      'core/example.js',
      'core/nested.js',
    ],
  );
});

test('runtime graph fails closed on a missing local module', () => {
  const root = fixture();
  write(
    path.join(root, 'dist/src/core/example.js'),
    "import './missing.js';\n",
  );

  assert.throws(
    () => collectRuntimeModuleGraph(
      path.join(root, 'dist/src/cli/mmi.js'),
      path.join(root, 'dist/src'),
    ),
    /CLI runtime import is missing/u,
  );
});

test('runtime graph rejects imports that escape the compiled root', () => {
  const root = fixture();
  write(path.join(root, 'dist/outside.js'), 'export const outside = true;\n');
  write(
    path.join(root, 'dist/src/core/example.js'),
    "import '../../outside.js';\n",
  );

  assert.throws(
    () => collectRuntimeModuleGraph(
      path.join(root, 'dist/src/cli/mmi.js'),
      path.join(root, 'dist/src'),
    ),
    /escapes compiled root/u,
  );
});



test('failed CLI tarball verification removes distributable artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-artifact-'));
  const tarball = path.join(root, 'mmi.tgz');
  const digest = `${tarball}.sha256`;
  fs.writeFileSync(tarball, 'unverified');
  fs.writeFileSync(digest, 'digest');

  assert.throws(
    () => verifyTarballOrRemove(
      tarball,
      digest,
      () => {
        throw new Error('smoke failed');
      },
    ),
    /smoke failed/u,
  );

  assert.equal(fs.existsSync(tarball), false);
  assert.equal(fs.existsSync(digest), false);
});

test('successful CLI tarball verification keeps artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-artifact-'));
  const tarball = path.join(root, 'mmi.tgz');
  const digest = `${tarball}.sha256`;
  fs.writeFileSync(tarball, 'verified');
  fs.writeFileSync(digest, 'digest');

  const receipt = verifyTarballOrRemove(
    tarball,
    digest,
    () => ({ checks: { render: 'passed' } }),
  );

  assert.deepEqual(receipt, { checks: { render: 'passed' } });
  assert.equal(fs.existsSync(tarball), true);
  assert.equal(fs.existsSync(digest), true);
});

test('CLI staging fails closed when compiled CLI is absent', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'dist/src/cli/mmi.js'));

  assert.throws(
    () => stageCliPackage({
      projectRoot: root,
      stageDirectory: path.join(root, 'stage'),
    }),
    /Compiled CLI bootstrap is missing/u,
  );
});

test('CLI manifest refuses a missing required runtime dependency', () => {
  assert.throws(
    () => createCliPackageManifest({
      name: 'markdown-matrix-injector',
      version: '0.1.0',
      license: 'MIT',
      dependencies: {
        'markdown-it': '^14.1.0',
        saxes: '6.0.0',
        xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
      },
    }),
    /runtime dependency: yaml/u,
  );
});

function write(filepath, text) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, text);
}

function writeJson(filepath, value) {
  write(filepath, `${JSON.stringify(value, null, 2)}\n`);
}
