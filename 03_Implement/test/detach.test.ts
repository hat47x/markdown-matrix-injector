import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDetachedDocument } from '../src/application/detachCheck.js';
import { materializeDocument } from '../src/application/materialize.js';
import { main } from '../src/cli/mmi.js';

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

test('materialize externalizes a card-sized table and detach check passes after the original source is removed', () => {
  const { root, source, doc, out } = workspace();
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

  fs.rmSync(path.dirname(source), { recursive: true, force: true });
  assert.equal(fs.existsSync(source), false);
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


test('detach check recursively validates linked Markdown attachments', () => {
  const { root } = workspace();
  const detached = path.join(root, 'detached');
  fs.mkdirSync(detached, { recursive: true });
  const rootDoc = path.join(detached, 'root.md');
  const child = path.join(detached, 'child.md');
  fs.writeFileSync(rootDoc, '# Root\n\n[child](./child.md)\n');
  fs.writeFileSync(child, '# Child\n\n![[../data/wide.csv#Sheet1|A1:B2]]\n');

  const result = checkDetachedDocument({
    markdownFilePath: rootDoc,
    workspaceRoot: root,
  });

  assert.equal(result.errors, 1);
  assert.equal(result.problems[0].code, 'MMI_DETACH_REFERENCE_REMAINS');
  assert.equal(result.problems[0].file, 'detached/child.md');
  assert.equal(result.problems[0].line, 3);
});

test('detach check traverses cyclic Markdown links at most once', () => {
  const { root } = workspace();
  const detached = path.join(root, 'detached');
  fs.mkdirSync(detached, { recursive: true });
  const first = path.join(detached, 'first.md');
  const second = path.join(detached, 'second.md');
  fs.writeFileSync(first, '[second](./second.md)\n');
  fs.writeFileSync(second, '[first](./first.md)\n');

  assert.deepEqual(
    checkDetachedDocument({
      markdownFilePath: first,
      workspaceRoot: root,
    }),
    { errors: 0, problems: [] },
  );
});

async function captureMain(
  argv: string[],
): Promise<{ code: number; output: string; errors: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (
    output.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: output.join(''),
      errors: errors.join('\n'),
    };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('materialize preflights attachment collisions before writing the detached document', async () => {
  const { root, doc, out } = workspace();
  fs.writeFileSync(
    doc,
    '# Spec\n\n![[../data/wide.csv#Sheet1|A1:K2?header=first&caption=Wide]]\n',
  );
  const planned = materializeDocument({
    markdownFilePath: doc,
    workspaceRoot: root,
    outputDocumentPath: out,
  });
  assert.equal(planned.files.length, 1);
  fs.mkdirSync(path.dirname(planned.files[0].absolutePath), {
    recursive: true,
  });
  fs.writeFileSync(planned.files[0].absolutePath, 'conflicting content\n');

  const run = await captureMain([
    'materialize',
    doc,
    '--root',
    root,
    '-o',
    out,
    '--json',
  ]);

  assert.equal(run.code, 1);
  assert.equal(fs.existsSync(out), false);
  assert.equal(
    fs.readFileSync(planned.files[0].absolutePath, 'utf8'),
    'conflicting content\n',
  );
  const summary = JSON.parse(run.output);
  assert.deepEqual(summary.collisions, [planned.files[0].relativePath]);
  assert.equal(summary.written, false);
  assert.match(run.errors, /MMI_DETACH_NAME_COLLISION/u);
});


test('detach check rejects symlinked links that resolve outside the workspace', () => {
  const { root } = workspace();
  const detached = path.join(root, 'detached');
  fs.mkdirSync(detached, { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-outside-'));
  fs.writeFileSync(
    path.join(outside, 'child.md'),
    '# External\n\n![[source.xlsx#Sheet1|A1:B2]]\n',
  );
  const escape = path.join(detached, 'escape');
  fs.symlinkSync(
    outside,
    escape,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const rootDoc = path.join(detached, 'root.md');
  fs.writeFileSync(rootDoc, '[outside](./escape/child.md)\n');

  const result = checkDetachedDocument({
    markdownFilePath: rootDoc,
    workspaceRoot: root,
  });

  assert.equal(result.errors, 1);
  assert.equal(result.problems[0].code, 'MMI_DETACH_LINK_OUTSIDE_ROOT');
  assert.equal(result.problems[0].file, 'detached/root.md');
});

test('detach check accepts in-root names beginning with two dots', () => {
  const { root } = workspace();
  const detached = path.join(root, 'detached');
  const unusual = path.join(detached, '..notes');
  fs.mkdirSync(unusual, { recursive: true });
  fs.writeFileSync(path.join(unusual, 'child.md'), '# Child\n');
  const rootDoc = path.join(detached, 'root.md');
  fs.writeFileSync(rootDoc, '[child](./..notes/child.md)\n');

  assert.deepEqual(
    checkDetachedDocument({
      markdownFilePath: rootDoc,
      workspaceRoot: root,
    }),
    { errors: 0, problems: [] },
  );
});

test('detach check terminates symlink-directory cycles inside the workspace', () => {
  const { root } = workspace();
  const detached = path.join(root, 'detached');
  fs.mkdirSync(detached, { recursive: true });
  const rootDoc = path.join(detached, 'root.md');
  fs.writeFileSync(rootDoc, '[loop](./loop/root.md)\n');
  fs.symlinkSync(
    detached,
    path.join(detached, 'loop'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  assert.deepEqual(
    checkDetachedDocument({
      markdownFilePath: rootDoc,
      workspaceRoot: root,
    }),
    { errors: 0, problems: [] },
  );
});


test('materialize preflights image asset collisions before writing the detached document', async () => {
  const { root, doc, out } = workspace();
  const image = path.join(path.dirname(doc), 'screen.png');
  fs.writeFileSync(image, Buffer.from('source-image'));
  fs.writeFileSync(doc, '# Spec\n\n![screen](./screen.png)\n');

  const planned = materializeDocument({
    markdownFilePath: doc,
    workspaceRoot: root,
    outputDocumentPath: out,
  });
  assert.deepEqual(planned.problems, []);
  assert.equal(planned.assets.length, 1);

  const collision = planned.assets[0];
  fs.mkdirSync(path.dirname(collision.absolutePath), {
    recursive: true,
  });
  fs.writeFileSync(
    collision.absolutePath,
    Buffer.from('conflicting-asset'),
  );

  const run = await captureMain([
    'materialize',
    doc,
    '--root',
    root,
    '-o',
    out,
    '--json',
  ]);

  assert.equal(run.code, 1);
  assert.equal(fs.existsSync(out), false);
  assert.deepEqual(
    fs.readFileSync(collision.absolutePath),
    Buffer.from('conflicting-asset'),
  );
  const summary = JSON.parse(run.output);
  assert.deepEqual(summary.collisions, [collision.relativePath]);
  assert.equal(summary.written, false);
  assert.match(run.errors, /MMI_DETACH_NAME_COLLISION/u);
});
