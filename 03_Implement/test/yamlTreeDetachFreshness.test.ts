import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  checkExtractedProvenanceFreshness,
} from '../src/application/detachFreshness.js';
import { extractYamlTree } from '../src/cli/extractTree.js';

function workspace() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-detach-yaml-tree-'),
  );
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'service.yaml');
  const doc = path.join(docs, 'spec.md');
  const ledger = path.join(root, 'mmi-ledger.json');

  fs.writeFileSync(
    source,
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
  );

  const extracted = extractYamlTree({
    sourcePath: source,
    pointer: '/service',
    outDir: path.join(docs, 'assets'),
    fromDocument: doc,
    ledgerPath: ledger,
  });
  assert.deepEqual(extracted.problems, []);
  assert.ok(extracted.extracted);
  fs.writeFileSync(
    doc,
    `# Spec\n\n${extracted.extracted.markdown}\n`,
  );

  return { root, source, doc, ledger };
}

test('detach freshness accepts YAML subtree across unrelated source edits', () => {
  const f = workspace();

  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: f.doc,
      workspaceRoot: f.root,
      ledgerPath: f.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );

  fs.writeFileSync(
    f.source,
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: false',
      '',
    ].join('\n'),
  );

  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: f.doc,
      workspaceRoot: f.root,
      ledgerPath: f.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );
});

test('detach freshness blocks YAML detach when the adopted subtree changes', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    [
      'service:',
      '  name: payments',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
  );

  const result = checkExtractedProvenanceFreshness({
    markdownFilePath: f.doc,
    workspaceRoot: f.root,
    ledgerPath: f.ledger,
  });

  assert.equal(result.errors, 1);
  assert.equal(
    result.problems[0].code,
    'MMI_DETACH_EXTRACTED_STALE',
  );
  assert.equal(result.problems[0].ledgerState, 'changed');
  assert.equal(result.problems[0].place, 'path:/service');
});
