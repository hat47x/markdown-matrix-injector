import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDetachedDocument } from '../src/application/detachCheck.js';
import { materializeDocument } from '../src/application/materialize.js';

function workspace(): { root: string; source: string; doc: string; out: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'wide.csv');
  const headers = Array.from({ length: 11 }, (_, i) => `H${i + 1}`);
  const values = Array.from({ length: 11 }, (_, i) => `V${i + 1}`);
  fs.writeFileSync(source, `${headers.join(',')}\n${values.join(',')}\n`);
  const doc = path.join(docs, 'spec.md');
  const out = path.join(root, 'detached', 'spec.md');
  return { root, source, doc, out };
}

test('materialize externalizes a card-sized table and detach check passes after files are written', () => {
  const { root, doc, out } = workspace();
  fs.writeFileSync(doc, '# Spec\n\n![[../data/wide.csv#Sheet1|A1:K2?header=first&caption=Wide]]\n');
  const result = materializeDocument({ markdownFilePath: doc, workspaceRoot: root, outputDocumentPath: out });
  assert.deepEqual(result.problems, []);
  assert.equal(result.files.length, 1);
  assert.match(result.markdown, /\[Wide\]\(mmi-materialized\/table-[0-9a-f]{12}\.md\)/u);
  assert.match(result.files[0].content, /<!-- mmi:materialized source=/u);
  assert.match(result.files[0].content, /\| H1 \| H2 /u);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, result.markdown);
  for (const file of result.files) {
    fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
    fs.writeFileSync(file.absolutePath, file.content);
  }

  assert.deepEqual(checkDetachedDocument({ markdownFilePath: out, workspaceRoot: root }), { errors: 0, problems: [] });
});

test('materialize keeps ordinary small tables inline', () => {
  const { root, doc, out } = workspace();
  fs.writeFileSync(doc, '![[../data/wide.csv#Sheet1|A1:B2?header=first]]\n');
  const result = materializeDocument({ markdownFilePath: doc, workspaceRoot: root, outputDocumentPath: out });
  assert.deepEqual(result.problems, []);
  assert.equal(result.files.length, 0);
  assert.match(result.markdown, /\| H1 \| H2 \|\n\| --- \| --- \|/u);
});

test('materialize leaves an explicit marker when a source-dependent card cannot be safely detached', () => {
  const { root, doc, out } = workspace();
  fs.writeFileSync(doc, '![[../data/wide.csv]]\n');
  const result = materializeDocument({ markdownFilePath: doc, workspaceRoot: root, outputDocumentPath: out });
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].code, 'MMI_DETACH_UNMATERIALIZED_REFERENCE');
  assert.match(result.markdown, /<!-- mmi:unmaterialized/u);
});

test('detach check reports remaining MMI refs, legacy cards and broken local links, but ignores code fences', () => {
  const { root, doc } = workspace();
  fs.writeFileSync(
    doc,
    '![[../data/wide.csv#Sheet1|A1:B2]]\n\n> 別紙: old.xlsx\n\n[missing](./missing.md)\n\n```md\n![[ignored.csv]]\n```\n',
  );
  const result = checkDetachedDocument({ markdownFilePath: doc, workspaceRoot: root });
  assert.deepEqual(result.problems.map((p) => p.code), [
    'MMI_DETACH_REFERENCE_REMAINS',
    'MMI_DETACH_LEGACY_CARD',
    'MMI_DETACH_BROKEN_LINK',
  ]);
});


test('materialize copies local images into the detached package and rebases the link', () => {
  const { root, doc, out } = workspace();
  const sourceAssets = path.join(path.dirname(doc), 'assets');
  fs.mkdirSync(sourceAssets);
  const original = path.join(sourceAssets, 'screen.png');
  const bytes = Buffer.from('detached-image-bytes');
  fs.writeFileSync(original, bytes);
  fs.writeFileSync(doc, '# Spec\n\n![screen](./assets/screen.png)\n');

  const result = materializeDocument({
    markdownFilePath: doc,
    workspaceRoot: root,
    outputDocumentPath: out,
  });

  assert.deepEqual(result.problems, []);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].sourcePath, original);
  assert.deepEqual(result.assets[0].bytes, bytes);
  assert.match(
    result.markdown,
    /!\[screen\]\(mmi-assets\/[0-9a-f]{12}\.png\)/u,
  );

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, result.markdown);
  for (const asset of result.assets) {
    fs.mkdirSync(path.dirname(asset.absolutePath), { recursive: true });
    fs.writeFileSync(asset.absolutePath, asset.bytes);
  }
  fs.rmSync(sourceAssets, { recursive: true, force: true });

  assert.deepEqual(
    checkDetachedDocument({ markdownFilePath: out, workspaceRoot: root }),
    { errors: 0, problems: [] },
  );
});

test('materialize deduplicates repeated local images by content digest', () => {
  const { root, doc, out } = workspace();
  const image = path.join(path.dirname(doc), 'same.png');
  fs.writeFileSync(image, Buffer.from('same-image'));
  fs.writeFileSync(
    doc,
    '![first](./same.png)\n\n![second](./same.png "caption")\n',
  );

  const result = materializeDocument({
    markdownFilePath: doc,
    workspaceRoot: root,
    outputDocumentPath: out,
  });

  assert.deepEqual(result.problems, []);
  assert.equal(result.assets.length, 1);
  assert.match(result.markdown, /!\[first\]\(mmi-assets\/[0-9a-f]{12}\.png\)/u);
  assert.match(
    result.markdown,
    /!\[second\]\(mmi-assets\/[0-9a-f]{12}\.png "caption"\)/u,
  );
});

test('materialize reports missing and workspace-external image targets without hiding them', () => {
  const { root, doc, out } = workspace();
  fs.writeFileSync(
    doc,
    '![missing](./missing.png)\n\n![outside](../../outside.png)\n',
  );

  const result = materializeDocument({
    markdownFilePath: doc,
    workspaceRoot: root,
    outputDocumentPath: out,
  });

  assert.deepEqual(
    result.problems.map((problem) => problem.code),
    ['MMI_DETACH_ASSET_MISSING', 'MMI_DETACH_ASSET_OUTSIDE_ROOT'],
  );
  assert.match(result.markdown, /!\[missing\]\(\.\/missing\.png\)/u);
  assert.match(result.markdown, /!\[outside\]\(\.\.\/\.\.\/outside\.png\)/u);
});
