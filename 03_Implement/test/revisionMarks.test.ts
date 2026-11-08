/**
 * Revision marks (#638): what changed against the previous version of a delivery document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli/mmi.js';
import { diffUnits, extractUnits, markRevisions } from '../src/cli/revisionMarks.js';
import { RenderError, renderDocumentHtml } from '../src/cli/render.js';
import { exportRevision } from '../src/cli/gitBase.js';

const TABLE = (rows: string[][]): string => `<table class="mmi-table"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

test('blocks are headings, paragraphs, list items, table rows, captions and cards, with their heading', () => {
  const units = extractUnits(
    '<h2>概要</h2><p>本文です。</p><ul><li>項目A</li><li>項目B</li></ul>'
    + `<figure class="mmi-embed"><figcaption class="mmi-embed__caption">残件</figcaption>${TABLE([['REL-01', '要確認']])}</figure>`
    + '<figure class="mmi-embed"><div class="mmi-card"><a>design.xlsx</a></div></figure>',
  );
  assert.deepEqual(units.map((unit) => unit.key), ['概要', '本文です。', '項目A', '項目B', '残件', 'REL-01 | 要確認', 'design.xlsx']);
  assert.deepEqual(units.map((unit) => unit.caption), [false, false, false, false, true, false, false]);
  assert.ok(units.slice(1).every((unit) => unit.heading === '概要'));
});

test('an added, an edited and a removed block are told apart, and unchanged blocks are left alone', () => {
  const previous = '<p>変わらない</p><p>古い文</p><p>間</p><p>消える文</p><p>末尾</p>';
  const current = '<p>変わらない</p><p>新しい文</p><p>間</p><p>末尾</p><p>追加した文</p>';
  const result = markRevisions(previous, current, '前版.md');
  assert.equal(result.html, '<p>変わらない</p><p data-mmi-rev="changed">新しい文</p><p>間</p><p>末尾</p><p data-mmi-rev="added">追加した文</p>');
  assert.deepEqual(result.counts, { added: 1, changed: 1, deleted: 1 });
  assert.match(result.appendixHtml, /比較元: 前版\.md　追加1件・変更1件・削除1件/);
  assert.match(result.appendixHtml, /<td>削除<\/td><td>消える文<\/td><td>―<\/td>/);
});

test('the appendix is an old/new comparison table: every change with its heading, kind, before and after', () => {
  const previous = '<h2>運用</h2><p>稼働は8時から20時です。</p><p>連絡はメールです。</p><h2>問い合わせ</h2><p>受付は9時からです。</p>';
  const current = '<h2>運用</h2><p>稼働は8時から22時です。</p><p>連絡はメールです。</p><h2>問い合わせ</h2><h2>緊急連絡</h2><p>当番表に従います。</p>';
  const rows = [...markRevisions(previous, current, 'v1').appendixHtml.matchAll(/<tr class="mmi-revisions__(\w+)"><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)]
    .map((match) => match.slice(1));
  assert.deepEqual(rows, [
    ['changed', '運用', '変更', '稼働は8時から20時です。', '稼働は8時から22時です。'],
    ['deleted', '問い合わせ', '削除', '受付は9時からです。', '―'],
    ['added', '緊急連絡', '追加', '―', '緊急連絡'],
    ['added', '緊急連絡', '追加', '―', '当番表に従います。'],
  ]);
});

test('a table row that changed is marked on the row, not on the whole table', () => {
  const previous = TABLE([['REL-01', '要確認'], ['REL-02', '完了']]);
  const current = TABLE([['REL-01', '完了'], ['REL-02', '完了']]);
  assert.equal(
    markRevisions(previous, current, 'x').html,
    '<table class="mmi-table"><tbody><tr data-mmi-rev="changed"><td>REL-01</td><td>完了</td></tr><tr><td>REL-02</td><td>完了</td></tr></tbody></table>',
  );
});

test('a changed caption is marked on the figure by a separate attribute and the tag still starts with its class', () => {
  const figure = (caption: string): string => `<figure class="mmi-embed" id="t"><figcaption class="mmi-embed__caption">${caption}</figcaption>${TABLE([['a']])}</figure>`;
  const html = markRevisions(figure('旧'), figure('新'), 'x').html;
  assert.match(html, /^<figure class="mmi-embed" id="t" data-mmi-rev-caption="changed"><figcaption class="mmi-embed__caption">新<\/figcaption>/);
});

test('a new section next to a deleted line is not reported as an edit of that line', () => {
  const result = markRevisions('<p>残す</p><p>受付時間は、平日9時から17時までです。</p>', '<p>残す</p><h2>4. 緊急時の連絡</h2><p>夜間・休日の緊急連絡先は、当番表に従います。</p>', 'x');
  assert.deepEqual(result.counts, { added: 2, changed: 0, deleted: 1 });
  assert.match(result.appendixHtml, /<td>削除<\/td><td>受付時間は、平日9時から17時までです。<\/td><td>―<\/td>/);
});

test('a block that only moved is reported as deleted and added', () => {
  const result = markRevisions('<p>A</p><p>B</p><p>C</p>', '<p>B</p><p>C</p><p>A</p>', 'x');
  assert.deepEqual(result.counts, { added: 1, changed: 0, deleted: 1 });
});

test('identical documents produce no marks and an empty list', () => {
  const html = '<h2>概要</h2><p>本文</p>';
  const result = markRevisions(html, html, 'x');
  assert.equal(result.html, html);
  assert.deepEqual(result.counts, { added: 0, changed: 0, deleted: 0 });
  assert.match(result.appendixHtml, /前の版からの変更はありません/);
});

test('deleted text is escaped in the appendix', () => {
  const result = markRevisions('<p>残す</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', '<p>残す</p>', '<b>前</b>.md');
  assert.doesNotMatch(result.appendixHtml, /<script>|<b>/);
  assert.match(result.appendixHtml, /&lt;script&gt;/);
});

test('an extreme difference is refused instead of exhausting memory', () => {
  const big = (prefix: string): ReturnType<typeof extractUnits> => Array.from({ length: 6000 }, (_, index) => ({ key: `${prefix}${index}`, tagEnd: 0, caption: false, heading: '' }));
  assert.throws(() => diffUnits(big('a'), big('b')), /too much/);
});

function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-rev-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const DOC = (note: string): string => `---\ntitle: 設計書\ncaptionNumbers: true\n---\n## 残件\n\n![[./data/gate.csv#Sheet1|A1:B3?header=first&caption=残件一覧&id=gate]]\n\n${note}\n`;

test('a changed value in the referenced CSV is a changed row when the previous version has its own data', () => {
  const previous = workspace({ 'spec.md': DOC('備考'), 'data/gate.csv': 'ID,判定\nREL-01,要確認\nREL-02,完了\n' });
  const current = workspace({ 'spec.md': DOC('備考'), 'data/gate.csv': 'ID,判定\nREL-01,完了\nREL-02,完了\n' });
  const html = renderDocumentHtml({
    markdownFilePath: path.join(current, 'spec.md'), workspaceRoot: current,
    base: { markdownFilePath: path.join(previous, 'spec.md'), workspaceRoot: previous, label: 'v1' },
  });
  assert.match(html, /<tr class="mmi-table__row" data-mmi-rev="changed"><td[^>]*>REL-01<\/td>/);
  assert.equal((html.match(/<[a-z]+ [^>]*data-mmi-rev="/g) ?? []).length, 1);
  assert.match(html, /追加0件・変更1件・削除0件/);
  assert.match(html, /<span class="mmi-embed__number">表1<\/span>/, 'table numbers still work when revisions are marked');
});

test('inserting a table does not mark the captions after it, because numbers are compared as written', () => {
  const gate = (extra: string): string => `${extra}![[./data/gate.csv#Sheet1|A1:B3?header=first&caption=残件一覧&id=gate]]\n\n`;
  const previous = workspace({ 'spec.md': `---\ncaptionNumbers: true\n---\n${gate('')}`, 'data/gate.csv': 'ID,判定\nA,1\n' });
  const current = workspace({
    'spec.md': `---\ncaptionNumbers: true\n---\n![[./data/gate.csv#Sheet1|A1:B3?header=first&caption=新しい表&id=new]]\n\n${gate('')}`,
    'data/gate.csv': 'ID,判定\nA,1\n',
  });
  const html = renderDocumentHtml({
    markdownFilePath: path.join(current, 'spec.md'), workspaceRoot: current,
    base: { markdownFilePath: path.join(previous, 'spec.md'), workspaceRoot: previous, label: 'v1' },
  });
  assert.doesNotMatch(html, /<figure [^>]*data-mmi-rev-caption="changed"/);
  assert.equal((html.match(/<figure [^>]*data-mmi-rev-caption="added"/g) ?? []).length, 1, 'only the new table caption is marked');
});

test('a document without a comparison is exported exactly as before', () => {
  const root = workspace({ 'spec.md': DOC('備考'), 'data/gate.csv': 'ID,判定\nA,1\n' });
  const html = renderDocumentHtml({ markdownFilePath: path.join(root, 'spec.md'), workspaceRoot: root });
  assert.doesNotMatch(html, /data-mmi-rev|mmi-revisions/);
});

test('a comparison base with reference errors stops the export', () => {
  const root = workspace({ 'spec.md': DOC('備考'), 'data/gate.csv': 'ID,判定\nA,1\n', 'old.md': '![[./data/missing.csv#Sheet1|A1:B2]]\n' });
  assert.throws(() => renderDocumentHtml({
    markdownFilePath: path.join(root, 'spec.md'), workspaceRoot: root,
    base: { markdownFilePath: path.join(root, 'old.md'), workspaceRoot: root, label: 'old' },
  }), RenderError);
});

test('mmi render --base marks the changes, and the base options are rejected for markdown output', async () => {
  const previous = workspace({ 'spec.md': '## 見出し\n\n旧\n' });
  const current = workspace({ 'spec.md': '## 見出し\n\n新\n' });
  const outFile = path.join(current, 'out.html');
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(await main(['render', path.join(current, 'spec.md'), '--to', 'html', '--base', path.join(previous, 'spec.md'), '--root', current, '-o', outFile]), 0);
    assert.equal(await main(['render', path.join(current, 'spec.md'), '--base', path.join(previous, 'spec.md'), '--root', current]), 2);
    assert.equal(await main(['render', path.join(current, 'spec.md'), '--to', 'html', '--base', 'a.md', '--base-rev', 'HEAD', '--root', current]), 1);
    assert.equal(await main(['render', path.join(current, 'spec.md'), '--to', 'html', '--base-root', previous, '--root', current]), 1);
  } finally {
    console.error = err;
  }
  assert.match(fs.readFileSync(outFile, 'utf8'), /<p data-mmi-rev="changed">新<\/p>/);
});

const git = (cwd: string, ...args: string[]): void => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

test('mmi render --base-rev compares with a git revision, including its data, without touching the working tree', async (t) => {
  if (spawnSync('git', ['--version']).status !== 0) return t.skip('git is not available');
  const root = workspace({ 'docs/spec.md': DOC('備考'), 'docs/data/gate.csv': 'ID,判定\nREL-01,要確認\nREL-02,完了\n' });
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'v1');
  fs.writeFileSync(path.join(root, 'docs/data/gate.csv'), 'ID,判定\nREL-01,完了\nREL-02,完了\n');
  fs.writeFileSync(path.join(root, 'docs/spec.md'), DOC('備考を追記した'));
  const outFile = path.join(root, 'docs/out.html');
  const err = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
  try {
    assert.equal(await main(['render', path.join(root, 'docs/spec.md'), '--to', 'html', '--base-rev', 'HEAD', '--root', path.join(root, 'docs'), '-o', outFile]), 0, messages.join('\n'));
    assert.equal(await main(['render', path.join(root, 'docs/spec.md'), '--to', 'html', '--base-rev', 'no-such-rev', '--root', path.join(root, 'docs')]), 1);
    assert.equal(await main(['render', path.join(root, 'docs/spec.md'), '--to', 'html', '--base-rev=--output=x', '--root', path.join(root, 'docs')]), 1);
  } finally {
    console.error = err;
  }
  const html = fs.readFileSync(outFile, 'utf8');
  assert.match(html, /data-mmi-rev="changed"><td[^>]*>REL-01/);
  assert.match(html, /<p data-mmi-rev="(?:changed|added)">備考を追記した<\/p>/);
  assert.match(html, /比較元: HEAD（[0-9a-f]{8}）/);
  assert.equal(fs.readFileSync(path.join(root, 'docs/data/gate.csv'), 'utf8'), 'ID,判定\nREL-01,完了\nREL-02,完了\n');
  assert.equal(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mmi-base-') && fs.existsSync(path.join(os.tmpdir(), name, 'docs'))).length, 0, 'the exported revision is removed');
});

test('exportRevision exports the committed bytes: export-ignore, export-subst, eol and text attributes do not change them (#793)', (t) => {
  if (spawnSync('git', ['--version']).status !== 0) return t.skip('git is not available');
  const root = workspace({
    '.gitattributes': 'docs/data/big.csv export-ignore\n*.md eol=crlf\n*.txt text eol=crlf\ndocs/ver.txt export-subst\n',
    'docs/spec.md': '# t\n',
    'docs/data/big.csv': 'a,b\n1,2\n',
    'docs/note.txt': 'x\ny\n',
    'docs/ver.txt': '$Format:%H$\n',
  });
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'v1');
  const exported = exportRevision(path.join(root, 'docs/spec.md'), path.join(root, 'docs'), 'HEAD');
  try {
    const read = (name: string): string => fs.readFileSync(path.join(exported.workspaceRoot, name), 'utf8');
    assert.equal(read('data/big.csv'), 'a,b\n1,2\n', 'a file marked export-ignore is still in the previous version');
    assert.equal(read('spec.md'), '# t\n');
    assert.equal(read('note.txt'), 'x\ny\n');
    assert.equal(read('ver.txt'), '$Format:%H$\n', 'export-subst is not expanded');
    assert.equal(fs.existsSync(path.join(exported.workspaceRoot, '..', '.gitattributes')), false, 'files outside --root are not exported');
  } finally {
    exported.cleanup();
  }
});
