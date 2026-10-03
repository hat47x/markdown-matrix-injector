import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkPaths,
  inspectSource,
  main,
  readCliVersion,
} from '../src/cli/mmi.js';
import { RenderError, renderDocumentMarkdown } from '../src/cli/render.js';

function fixture(markdown: string): { root: string; doc: string; csv: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-'));
  fs.mkdirSync(path.join(root, 'data'));
  const csv = path.join(root, 'data', 'roles.csv');
  fs.writeFileSync(csv, 'ID,操作,備考\nOP-01,申請,a|b\nOP-02,承認,\n');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return { root, doc, csv };
}

test('CLI --version and -v report the package version', async () => {
  const expected = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).version;
  assert.equal(readCliVersion(), expected);

  for (const option of ['--version', '-v']) {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map((value) => String(value)).join(' '));
    };
    try {
      assert.equal(await main([option]), 0);
    } finally {
      console.log = original;
    }
    assert.deepEqual(lines, [expected]);
  }
});

test('inspect lists regions with headers and a reference relative to the document, without cell values by default', () => {
  const { csv, doc } = fixture('');
  const result = inspectSource(csv, 0, doc);
  const region = result.sheets[0].regions[0];
  assert.equal(region.a1, 'A1:C3');
  assert.deepEqual(region.headers, ['ID', '操作', '備考']);
  assert.equal(region.reference, '![[./data/roles.csv#Sheet1|A1:C3?header=first]]');
  assert.equal(region.sample, undefined);
  assert.deepEqual(inspectSource(csv, 1, doc).sheets[0].regions[0].sample, [['OP-01', '申請', 'a|b']]);
});

test('check reports stable diagnostic codes with 1-based positions', async () => {
  const { root, doc } = fixture('# t\n\n![[./data/missing.csv]]\n![[./data/roles.csv#NoSheet|A1:C3]]\n');
  const problems = await checkPaths([doc], root);
  assert.deepEqual(problems.map((p) => [p.code, p.line]), [['MMI_FILE_NOT_FOUND', 3], ['MMI_SHEET_NOT_FOUND', 4]]);
  assert.equal(problems[0].column, 4);
});

test('render --to md expands references into GFM tables and leaves code fences alone', () => {
  const { root, doc } = fixture('本文\n\n![[./data/roles.csv#Sheet1|A1:C3?header=first&columns=A,C&caption=表1 権限]]\n\n```md\n![[./data/roles.csv]]\n```\n');
  const out = renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root });
  assert.match(out, /\*\*表1 権限\*\*\n\n\| ID \| 備考 \|\n\| --- \| --- \|\n\| OP-01 \| a\\\|b \|\n\| OP-02 \|  \|/);
  assert.match(out, /```md\n!\[\[\.\/data\/roles\.csv\]\]\n```/);
});

test('render refuses to export when a reference cannot be resolved', () => {
  const { root, doc } = fixture('![[./data/missing.csv]]\n');
  assert.throws(() => renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root }), RenderError);
});

test('render never reads outside the workspace boundary', () => {
  const { root, doc } = fixture('![[../outside.csv]]\n');
  fs.writeFileSync(path.join(root, '..', 'outside.csv'), 'a\n');
  assert.throws(() => renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root }), RenderError);
});
