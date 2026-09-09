import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateOpenSourcePath } from '../src/core/openSourcePath.js';
import { renderEmbedCard } from '../src/core/renderCard.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';

test('external open accepts only existing table files inside workspace roots', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mmi-open-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'workspace');
  await fs.mkdir(root);
  const source = path.join(root, '設計.csv');
  await fs.writeFile(source, 'ID,Name\n1,Sample');
  assert.equal(await validateOpenSourcePath(source, [root]), await fs.realpath(source));
  await assert.rejects(validateOpenSourcePath(source, []));
  await assert.rejects(validateOpenSourcePath('./設計.csv', [root]));
  await assert.rejects(validateOpenSourcePath('https://example.com/a.csv', [root]));
  await assert.rejects(validateOpenSourcePath(path.join(root, 'run.exe'), [root]));
  await assert.rejects(validateOpenSourcePath(path.join(root, 'missing.csv'), [root]));
  const outside = path.join(temp, 'outside.csv');
  await fs.writeFile(outside, 'outside');
  await assert.rejects(validateOpenSourcePath(outside, [root]));
  if (process.platform !== 'win32') {
    const link = path.join(root, 'linked.csv');
    await fs.symlink(outside, link);
    await assert.rejects(validateOpenSourcePath(link, [root]));
  }
});

test('card URI follows the host scheme for Insiders', () => {
  const query = parseEmbedSyntax('![[./a.csv]]');
  assert.ok(query);
  assert.match(renderEmbedCard(query, '/ws/a.csv', 'vscode-insiders'), /href="vscode-insiders:\/\/hat47x/);
});
