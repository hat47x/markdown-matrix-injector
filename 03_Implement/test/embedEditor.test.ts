import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';
import { getParams, parseEmbedParts, serializeEmbedParts, setParam, setRepeatedParam } from '../src/dx/embedEditor.js';
import { fileFixCandidates, sheetFixCandidates } from '../src/dx/embedFixes.js';

const RAW = '![[../data/設計.xlsx#状態遷移|C5:F12?x-note=%E6%B3%A8&formatColumn=E:json&mode=card&formatColumn=F:yaml&grep=要確認]]';

test('round trip without changes reproduces the input exactly', () => {
  for (const raw of [RAW, '![[a.csv]]', '![[a.xlsx#S]]', '![[a.xlsx#S?mode=card]]', '![[a.csv?header=first]]', '![[a.xlsx|A1:B2]]']) {
    assert.equal(serializeEmbedParts(parseEmbedParts(raw)!), raw, raw);
  }
});

test('setting one key rewrites only that segment; unknown and repeated keys survive', () => {
  const parts = setParam(parseEmbedParts(RAW)!, 'mode', 'table');
  assert.equal(
    serializeEmbedParts(parts),
    '![[../data/設計.xlsx#状態遷移|C5:F12?x-note=%E6%B3%A8&formatColumn=E:json&mode=table&formatColumn=F:yaml&grep=要確認]]',
  );
  const removed = serializeEmbedParts(setParam(parseEmbedParts(RAW)!, 'grep', undefined));
  assert.ok(!removed.includes('grep='));
  assert.ok(removed.includes('x-note=%E6%B3%A8') && removed.includes('formatColumn=F:yaml'));
  const added = serializeEmbedParts(setParam(parseEmbedParts('![[a.xlsx#S|A1:B2]]')!, 'header', 'first'));
  assert.equal(added, '![[a.xlsx#S|A1:B2?header=first]]');
});

test('values are escaped only where the notation needs it, and mean what the renderer reads', () => {
  const edited = serializeEmbedParts(setParam(parseEmbedParts('![[a.xlsx#S|A1:B2]]')!, 'grep', 'A&B #1 要確認'));
  assert.equal(edited, '![[a.xlsx#S|A1:B2?grep=A%26B%20%231%20要確認]]');
  assert.equal(parseEmbedSyntax(edited)?.params.get('grep'), 'A&B #1 要確認');
});

test('repeatable keys are replaced as a group at their first position', () => {
  const parts = setRepeatedParam(parseEmbedParts(RAW)!, 'formatColumn', ['G:sql']);
  assert.deepEqual(getParams(parts, 'formatColumn'), ['G:sql']);
  assert.equal(
    serializeEmbedParts(parts),
    '![[../data/設計.xlsx#状態遷移|C5:F12?x-note=%E6%B3%A8&formatColumn=G:sql&mode=card&grep=要確認]]',
  );
});

test('parts: sheet, range and a range-less query are separated correctly', () => {
  assert.deepEqual(parseEmbedParts('![[a.xlsx#Sheet1?mode=card]]'), { filepath: 'a.xlsx', sheet: 'Sheet1', range: undefined, segments: ['mode=card'] });
  assert.equal(parseEmbedParts('not an embed'), undefined);
  assert.equal(parseEmbedParts('![[]]'), undefined);
});

test('fixes: only existing names, most similar first, case/width folded', () => {
  assert.deepEqual(sheetFixCandidates('状態繊維', ['状態遷移', '画面一覧', '状態遷移（旧）']).map((c) => c.replacement), ['状態遷移']);
  assert.deepEqual(sheetFixCandidates('sheet1', ['Sheet1', 'Sheet2']).map((c) => c.replacement)[0], 'Sheet1');
  assert.deepEqual(sheetFixCandidates('予算', ['画面一覧', 'API']), []);
  assert.deepEqual(fileFixCandidates('../data/role.csv', ['../data/roles.csv', '../other/roles.csv', '../data/states.xlsx']).map((c) => c.replacement), [
    '../data/roles.csv',
    '../other/roles.csv',
  ]);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { describePreview, enPreviewPhrases, jaPreviewPhrases, summarizeRenderedEmbed, truncateTableHtml } from '../src/dx/embedPreview.js';

test('preview: summaries come from the real engine for table, empty, card and error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-preview-'));
  fs.writeFileSync(path.join(dir, 'roles.csv'), 'ID,Name,Status\n1,Alice,OK\n2,Bob,NG\n3,Carol,OK\n');
  const markdownFilePath = path.join(dir, 'doc.md');
  const render = (embed: string): string => {
    const md = new MarkdownIt();
    md.use(markdownMatrixPlugin, { markdownFilePath, workspaceRoot: dir, cache: new WorkbookCache<WorkbookData>() });
    return md.render(embed);
  };
  assert.deepEqual(summarizeRenderedEmbed(render('![[roles.csv#Sheet1|A1:C4?header=first]]')), { kind: 'table', bodyRows: 3, columns: 3, header: true });
  assert.deepEqual(summarizeRenderedEmbed(render('![[roles.csv#Sheet1|A1:C4?header=first&grep=zzz]]')), { kind: 'empty', columns: 3 });
  assert.equal(summarizeRenderedEmbed(render('![[roles.csv#Sheet1|A1:C4?mode=card]]')).kind, 'card');
  const error = summarizeRenderedEmbed(render('![[missing.csv#Sheet1|A1:B2]]'));
  assert.equal(error.kind, 'error');
  // The reference wording is English; the checked-on-screen wording is the Japanese phrase set.
  assert.match(describePreview(error), /^Error: /u);
  assert.match(describePreview(error, jaPreviewPhrases), /^エラー: /u);
  assert.match(describePreview({ kind: 'table', bodyRows: 3, columns: 3, header: true }, jaPreviewPhrases), /本体3行 × 3列（見出しあり）/u);
  assert.match(describePreview({ kind: 'table', bodyRows: 3, columns: 3, header: true }, enPreviewPhrases), /3 body rows × 3 columns \(with header\)/u);
  const cut = truncateTableHtml(render('![[roles.csv#Sheet1|A1:C4?header=first]]'), 2);
  assert.equal(cut.hiddenRows, 1);
  assert.deepEqual(summarizeRenderedEmbed(cut.html), { kind: 'table', bodyRows: 2, columns: 3, header: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
