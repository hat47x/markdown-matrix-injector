import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectImportAssistance } from '../src/importAssist/inspectImportAssistance.js';

test('CLI import-assistance projection keeps inferred roles separate and emits only revalidated proposals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-assist-cli-'));
  const source = path.join(root, 'roles.csv');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(source, 'ID,操作,備考\nOP-01,申請,入力\nOP-02,承認,確認\n');
  fs.writeFileSync(doc, '');

  const items = inspectImportAssistance(source, doc);
  const table = items.find((item) => item.role === 'table');
  assert.ok(table);
  assert.equal(table.sheet, 'Sheet1');
  assert.equal(table.range, 'A1:C3');
  assert.equal(table.proposal, '![[./roles.csv#Sheet1|A1:C3?header=first]]');
  assert.deepEqual(table.cautions, []);
});

test('import-assistance projection does not expose copied cell values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-assist-redaction-'));
  const source = path.join(root, 'roles.csv');
  fs.writeFileSync(source, 'ID,操作\nSECRET-ROW,SECRET-VALUE\n');

  const json = JSON.stringify(inspectImportAssistance(source));
  assert.doesNotMatch(json, /SECRET-ROW|SECRET-VALUE/u);
});
