import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createCliPackageManifest,
  stageCliPackage,
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
      xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    },
    devDependencies: {
      typescript: '^5.9.2',
    },
  });
  write(path.join(root, 'dist/src/cli/mmi.js'), '#!/usr/bin/env node\n');
  write(path.join(root, 'dist/src/core/example.js'), 'export const ok = true;\n');
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
      xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
      developmentOnlyByMistake: '1.0.0',
    },
  });

  assert.equal(manifest.name, 'markdown-matrix-injector');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.bin, { mmi: './dist/src/cli/mmi.js' });
  assert.deepEqual(manifest.engines, { node: '>=20' });
  assert.equal(manifest.bundleDependencies, true);
  assert.deepEqual(manifest.dependencies, {
    'markdown-it': '^14.1.0',
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
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
  assert.equal(manifest.bin.mmi, './dist/src/cli/mmi.js');
  assert.equal(manifest.engines.node, '>=20');
  assert.equal(manifest.bundleDependencies, true);
  assert.equal('publisher' in manifest, false);
  assert.equal('activationEvents' in manifest, false);
  assert.equal('contributes' in manifest, false);
});

test('CLI staging fails closed when compiled CLI is absent', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'dist/src/cli/mmi.js'));

  assert.throws(
    () => stageCliPackage({
      projectRoot: root,
      stageDirectory: path.join(root, 'stage'),
    }),
    /Compiled CLI entry is missing/u,
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
      },
    }),
    /runtime dependency: xlsx/u,
  );
});

function write(filepath, text) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, text);
}

function writeJson(filepath, value) {
  write(filepath, `${JSON.stringify(value, null, 2)}\n`);
}
