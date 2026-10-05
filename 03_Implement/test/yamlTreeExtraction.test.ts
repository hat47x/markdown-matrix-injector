import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  checkExtractedProvenanceFreshness,
} from '../src/application/detachFreshness.js';
import { extractYamlTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-yaml-tree-'));
  const source = path.join(root, 'service.yaml');
  const doc = path.join(root, 'spec.md');
  const ledger = path.join(root, 'mmi-ledger.json');
  const assets = path.join(root, 'assets');
  return { root, source, doc, ledger, assets };
}

function yaml(serviceName = 'Billing', other = 'keep'): string {
  return [
    'service:',
    `  name: ${serviceName}`,
    '  endpoints:',
    '    - path: /pay',
    '      method: POST',
    `other: ${other}`,
    '',
  ].join('\n');
}

test('YAML Tree extraction records ledger provenance and ignores unrelated changes', () => {
  const ws = workspace();
  fs.writeFileSync(ws.source, yaml(), 'utf8');

  const result = extractYamlTree({
    sourcePath: ws.source,
    pointer: '/service',
    outDir: ws.assets,
    fromDocument: ws.doc,
    ledgerPath: ws.ledger,
  });
  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(result.extracted.markdown, /- "service" \(object\)/u);
  assert.match(result.extracted.markdown, /projection="yaml-nested-list-v1"/u);

  fs.writeFileSync(
    ws.doc,
    `# Spec\n\n${result.extracted.markdown}\n`,
    'utf8',
  );
  const ledger = readLedger(ws.ledger);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(ledger.entries[0].place, 'path:/service');
  assert.equal(ledger.entries[0].conversion.mode, 'yaml-nested-list-v1');

  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: ws.doc,
      workspaceRoot: ws.root,
      ledgerPath: ws.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );

  fs.writeFileSync(ws.source, yaml('Billing', 'changed elsewhere'), 'utf8');
  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: ws.doc,
      workspaceRoot: ws.root,
      ledgerPath: ws.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );

  fs.writeFileSync(ws.source, yaml('Billing v2', 'changed elsewhere'), 'utf8');
  const stale = checkExtractedProvenanceFreshness({
    markdownFilePath: ws.doc,
    workspaceRoot: ws.root,
    ledgerPath: ws.ledger,
  });
  assert.equal(stale.errors, 1);
  assert.equal(stale.problems[0].code, 'MMI_DETACH_EXTRACTED_STALE');
});

test('YAML Tree extraction fails closed on unsafe YAML and review-time changes', () => {
  const ws = workspace();
  fs.writeFileSync(ws.source, yaml(), 'utf8');
  const first = extractYamlTree({
    sourcePath: ws.source,
    pointer: '/service',
    outDir: ws.assets,
  });
  assert.ok(first.extracted);

  fs.writeFileSync(ws.source, yaml('Changed'), 'utf8');
  const changed = extractYamlTree({
    sourcePath: ws.source,
    pointer: '/service',
    outDir: ws.assets,
    expectedCandidateFingerprint:
      first.extracted.candidateFingerprint,
  });
  assert.equal(changed.extracted, undefined);
  assert.equal(changed.problems[0].code, 'MMI_TREE_CANDIDATE_CHANGED');

  fs.writeFileSync(
    ws.source,
    'base: &base\n  value: 1\ncopy: *base\n',
    'utf8',
  );
  const unsafe = extractYamlTree({
    sourcePath: ws.source,
    pointer: '',
    outDir: ws.assets,
  });
  assert.equal(unsafe.extracted, undefined);
  assert.equal(unsafe.problems[0].code, 'MMI_TREE_YAML_INVALID');
});
