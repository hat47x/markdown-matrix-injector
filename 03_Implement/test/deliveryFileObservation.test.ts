import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DELIVERY_FILE_OBSERVATION_SCHEMA,
  observeDeliveryFiles,
} from '../src/application/deliveryFileObservation.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-observation-'));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);
  fs.writeFileSync(path.join(excel, 'a.xlsx'), 'fictional excel bytes');
  fs.writeFileSync(path.join(excel, 'b.xlsx'), 'fictional excel bytes');
  fs.mkdirSync(path.join(excel, 'folder.xlsx'));
  return {
    root,
    workspaceRoot: root,
    docs,
    excel,
    markdownFilePath: path.join(docs, 'delivery.md'),
  };
}

test('whole-file Excel references are observed with headings, duplicates and visible failures', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const markdownText = [
    '# Delivery',
    '## Design',
    '![[../excel/a.xlsx]]',
    '![[../excel/b.xlsx]]',
    '![[../excel/a.xlsx]]',
    '![[../excel/missing.xlsx]]',
    '![[../../outside.xlsx]]',
    '![[../excel/folder.xlsx]]',
    '![[../excel/a.xlsx#Sheet1|A1:B2]]',
    '![[../excel/notes.csv]]',
    '~~~markdown',
    '![[../excel/ignored.xlsx]]',
    '~~~',
  ].join('\n');
  const before = fs.readFileSync(path.join(f.excel, 'a.xlsx'));
  const result = observeDeliveryFiles({ ...f, markdownText });

  assert.equal(result.schema, DELIVERY_FILE_OBSERVATION_SCHEMA);
  assert.equal(result.scope, 'file-only-excel-mmi-embeds');
  assert.equal(result.referentialCompleteness, 'incomplete');
  assert.deepEqual(result.counts, {
    references: 6,
    resolved: 3,
    missing: 1,
    outsideWorkspace: 1,
    notFile: 1,
    unreadable: 0,
    duplicateReferences: 1,
    sameContentDifferentFiles: 1,
  });
  assert.deepEqual(result.references.map((item) => [item.line, item.status]), [
    [3, 'resolved'],
    [4, 'resolved'],
    [5, 'resolved'],
    [6, 'missing'],
    [7, 'outside-workspace'],
    [8, 'not-file'],
  ]);
  assert.deepEqual(result.references[0].headings, ['Delivery', 'Design']);
  assert.equal(result.references[0].resolvedPath, 'excel/a.xlsx');
  assert.match(result.references[0].digest ?? '', /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.references[1].sameContentAsLine, 3);
  assert.equal(result.references[2].duplicateOfLine, 3);
  assert.equal(result.references[3].digest, undefined);
  assert.equal(result.references[4].resolvedPath, undefined);
  assert.deepEqual(fs.readFileSync(path.join(f.excel, 'a.xlsx')), before);
});

test('no file-only references is empty, not a positive completeness assertion', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const result = observeDeliveryFiles({
    ...f,
    markdownText: [
      '# Design',
      '![[../excel/a.xlsx#Sheet1|A1:C5]]',
      '[ordinary Markdown link](../excel/a.xlsx)',
      '~~~markdown',
      '![[../excel/a.xlsx]]',
      '~~~',
    ].join('\n'),
  });
  assert.equal(result.referentialCompleteness, 'empty');
  assert.equal(result.counts.references, 0);
});

test('two complete references still do not assert contractual completeness', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const result = observeDeliveryFiles({
    ...f,
    markdownText: '![[../excel/a.xlsx]]\n![[../excel/b.xlsx]]',
  });
  assert.equal(result.referentialCompleteness, 'complete');
  assert.equal(result.counts.resolved, 2);
  assert.equal(result.counts.sameContentDifferentFiles, 1);
});

test('existing symlink escaping the workspace is rejected before content is read', (t) => {
  const f = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-outside-'));
  t.after(() => {
    fs.rmSync(f.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  const outsideFile = path.join(outside, 'secret.xlsx');
  fs.writeFileSync(outsideFile, 'outside secret bytes');
  try {
    fs.symlinkSync(outsideFile, path.join(f.excel, 'linked.xlsx'), 'file');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error
      && ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(error.code))) {
      t.skip('creating a file symlink requires operating system permission');
      return;
    }
    throw error;
  }

  const result = observeDeliveryFiles({
    ...f,
    markdownText: '![[../excel/linked.xlsx]]',
  });
  assert.equal(result.referentialCompleteness, 'incomplete');
  assert.equal(result.references[0].status, 'outside-workspace');
  assert.equal(result.references[0].digest, undefined);
});

test('the Markdown path itself must be inside the authorized workspace', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  assert.throws(() => observeDeliveryFiles({
    markdownText: '![[../excel/a.xlsx]]',
    markdownFilePath: path.resolve(f.root, '..', 'outside.md'),
    workspaceRoot: f.root,
  }), /Delivery Markdown must be inside the workspace/u);
});

test('a changed source gets a changed digest without modifying the file', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const options = { ...f, markdownText: '![[../excel/a.xlsx]]' };
  const first = observeDeliveryFiles(options);
  fs.writeFileSync(path.join(f.excel, 'a.xlsx'), 'fictional updated content');
  const second = observeDeliveryFiles(options);
  assert.notEqual(first.references[0].digest, second.references[0].digest);
  assert.equal(fs.readFileSync(path.join(f.excel, 'a.xlsx'), 'utf8'), 'fictional updated content');
});
