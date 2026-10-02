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
  assert.match(run.errors, /MMI_DETACH_NAME_COLLISION/u);
});
