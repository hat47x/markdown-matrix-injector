import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import XLSX from 'xlsx';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { parseCsv } from '../src/core/workbookLoader.js';

function createMarkdownIt(markdownFilePath: string, workspaceRoot?: string): MarkdownIt {
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    markdownFilePath,
    workspaceRoot,
    cache: new WorkbookCache(),
  });
  return md;
}

function createCsvFixture(rows: string[][]): { markdownFilePath: string; filePath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-csv-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const filePath = path.join(docsDir, 'roles.csv');
  fs.writeFileSync(filePath, rows.map((row) => row.join(',')).join('\n'));
  return {
    markdownFilePath: path.join(docsDir, 'spec.md'),
    filePath,
  };
}

type Phase9BenchmarkRow = {
  ruleId: string;
  queryExample: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadPhase9BenchmarkRows(filePath: string): Phase9BenchmarkRow[] {
  // Uses the production RFC4180 parser (issue-0106) rather than a hand-rolled
  // fixed-column reconstruction: now that QueryExample is properly CSV-quoted
  // (issue-0106 follow-up), a standard quote-aware parser recovers it directly
  // by header name -- no special-casing "columns 8..length-4" needed anymore.
  const [header, ...dataRows] = parseCsv(fs.readFileSync(filePath, 'utf-8'));
  const ruleIdIndex = header.indexOf('RuleId');
  const queryExampleIndex = header.indexOf('QueryExample');
  return dataRows.map((row) => ({
    ruleId: row[ruleIdIndex] ?? '',
    queryExample: row[queryExampleIndex] ?? '',
  }));
}

test('markdownMatrixPlugin renders csv embeds as html tables', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B3?header=first]]');

  assert.match(html, /<table class="mmi-table">/);
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td class="mmi-table__cell">Alice<\/td><td class="mmi-table__cell">Admin<\/td>/);
});

test('markdownMatrixPlugin supports columns and grep query parameters', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
    ['2', 'Bob', 'User'],
    ['3', 'Carol', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C4?header=first&columns=B,C&grep=Admin]]');

  assert.doesNotMatch(html, /<th>ID<\/th>/);
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td class="mmi-table__cell">Alice<\/td><td class="mmi-table__cell">Admin<\/td>/);
  assert.match(html, /<td class="mmi-table__cell">Carol<\/td><td class="mmi-table__cell">Admin<\/td>/);
  assert.doesNotMatch(html, /Bob/);
});

test('markdownMatrixPlugin can slice drools-inspired system design table patterns', () => {
  const fixture = createCsvFixture([
    ['RuleName', 'DocScope', 'ConditionExpr', 'ActionExpr', 'Priority', 'EffectiveFrom', 'ExpiresAt'],
    ['PRINT_LAYOUT_LANDSCAPE', 'PrintControl', 'pageBreak=before AND orientation=landscape', 'apply print css profile', '90', '2026-04-01', '2026-12-31'],
    ['SUPPORT_TRIAGE_PRINT', 'Triage', 'print mismatch', 'classify as print failure', '75', '2026-04-01', '2026-12-31'],
    ['QUERY_FILTER_AUTH', 'QuerySlice', 'grep=AUTH', 'filter matching rows', '70', '2026-04-01', '2026-12-31'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:G4?header=first&columns=A,C,D,E&grep=print]]');

  assert.match(html, /<th>RuleName<\/th><th>ConditionExpr<\/th><th>ActionExpr<\/th><th>Priority<\/th>/);
  assert.match(html, /PRINT_LAYOUT_LANDSCAPE/);
  assert.match(html, /SUPPORT_TRIAGE_PRINT/);
  assert.doesNotMatch(html, /QUERY_FILTER_AUTH/);
});

test('markdownMatrixPlugin supports phase9 benchmark pack queries with header, columns, and grep', () => {
  const workspaceRoot = path.resolve('test/fixtures/workspace');
  const markdownFilePath = path.join(workspaceRoot, 'docs/spec.md');
  const md = createMarkdownIt(markdownFilePath, workspaceRoot);

  const html = md.render(
    '![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&header=first&columns=A,B,D,E,J,K&grep=path]]',
  );

  assert.match(
    html,
    /<th>BenchmarkTable<\/th><th>RuleId<\/th><th>ConditionExpr<\/th><th>ActionExpr<\/th><th>RelatedRequirement<\/th><th>RelatedTest<\/th>/,
  );
  assert.match(html, /TRIAGE_PATH_UNRESOLVED/);
  assert.doesNotMatch(html, /GATE_BLOCK_UNIT_FAIL/);
});

test('markdownMatrixPlugin keeps phase9 query observability across all benchmark tables', () => {
  const workspaceRoot = path.resolve('test/fixtures/workspace');
  const markdownFilePath = path.join(workspaceRoot, 'docs/spec.md');
  const md = createMarkdownIt(markdownFilePath, workspaceRoot);

  const requirementsHtml = md.render(
    '![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&header=first&columns=A,B,C&grep=ReqTrace]]',
  );
  assert.match(requirementsHtml, /RequirementsTraceability/);
  assert.match(requirementsHtml, /REQ_TRACE_AUTH/);

  const stateTransitionHtml = md.render(
    '![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&header=first&columns=A,B,D,E&grep=state=REVIEW]]',
  );
  assert.match(stateTransitionHtml, /StateTransition/);
  assert.match(stateTransitionHtml, /STATE_REVIEW_TO_APPROVED/);

  const triageHtml = md.render(
    '![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&header=first&columns=A,B,D,E&grep=path unresolved]]',
  );
  assert.match(triageHtml, /FailureTriage/);
  assert.match(triageHtml, /TRIAGE_PATH_UNRESOLVED/);

  const releaseGateHtml = md.render(
    '![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&header=first&columns=A,B,D,E&grep=unit test failed]]',
  );
  assert.match(releaseGateHtml, /ReleaseGateDecision/);
  assert.match(releaseGateHtml, /GATE_BLOCK_UNIT_FAIL/);
});

test('markdownMatrixPlugin can execute all QueryExample contracts from phase9 benchmark rows', () => {
  const workspaceRoot = path.resolve('test/fixtures/workspace');
  const markdownFilePath = path.join(workspaceRoot, 'docs/spec.md');
  const md = createMarkdownIt(markdownFilePath, workspaceRoot);
  const benchmarkPath = path.join(workspaceRoot, 'data/phase9-rule-table-benchmark-pack.csv');
  const rows = loadPhase9BenchmarkRows(benchmarkPath);

  for (const row of rows) {
    assert.notEqual(row.ruleId.trim(), '', 'RuleId must not be empty in phase9 benchmark rows');
    assert.notEqual(row.queryExample.trim(), '', `QueryExample must not be empty for RuleId=${row.ruleId}`);
    const html = md.render(
      `![[../data/phase9-rule-table-benchmark-pack.csv#Sheet1|A1:M6?mode=table&${row.queryExample}]]`,
    );
    assert.match(html, new RegExp(escapeRegExp(row.ruleId)));
  }
});

test('markdownMatrixPlugin supports transpose and numeric header rows', () => {
  const fixture = createCsvFixture([
    ['Metric', 'Q1', 'Q2'],
    ['Revenue', '10', '20'],
    ['Cost', '5', '8'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C3?transpose=true&header=2]]');

  assert.match(html, /<th>Q1<\/th><th>10<\/th><th>5<\/th>/);
  assert.match(
    html,
    /<td class="mmi-table__cell">Metric<\/td><td class="mmi-table__cell">Revenue<\/td><td class="mmi-table__cell">Cost<\/td>/,
  );
});

test('markdownMatrixPlugin highlights rows by column selector and value', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
    ['2', 'Bob', 'User'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render(
    '![[./roles.csv#Sheet1|A1:C3?header=first&highlightColumn=Role&highlightValue=Admin]]',
  );

  assert.match(
    html,
    /<tr class="mmi-table__row mmi-table__row--highlight"><td class="mmi-table__cell">1<\/td><td class="mmi-table__cell">Alice<\/td><td class="mmi-table__cell">Admin<\/td><\/tr>/,
  );
  assert.match(
    html,
    /<tr class="mmi-table__row"><td class="mmi-table__cell">2<\/td><td class="mmi-table__cell">Bob<\/td><td class="mmi-table__cell">User<\/td><\/tr>/,
  );
});

test('markdownMatrixPlugin resolves highlight columns case-insensitively against headers', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
    ['2', 'Bob', 'User'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render(
    '![[./roles.csv#Sheet1|A1:C3?header=first&highlightColumn= role &highlightValue=Admin]]',
  );

  assert.match(html, /mmi-table__row mmi-table__row--highlight/);
});

test('markdownMatrixPlugin normalizes highlight values before matching', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
    ['2', 'Bob', 'User'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render(
    '![[./roles.csv#Sheet1|A1:C3?header=first&highlightColumn=role&highlightValue= admin ]]',
  );

  assert.match(html, /mmi-table__row mmi-table__row--highlight/);
});

test('markdownMatrixPlugin formats a target column as code blocks', () => {
  const fixture = createCsvFixture([
    ['Name', 'Payload'],
    ['Alice', '{"role":"Admin"}'],
    ['Bob', '{"role":"User"}'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B3?header=first&formatColumn=Payload:json]]');

  assert.match(
    html,
    /<td class="mmi-table__cell mmi-table__cell--formatted"><pre class="mmi-table__cell-code" data-format="json"><code>\{&quot;role&quot;:&quot;Admin&quot;\}<\/code><\/pre><\/td>/,
  );
  assert.match(
    html,
    /<td class="mmi-table__cell mmi-table__cell--formatted"><pre class="mmi-table__cell-code" data-format="json"><code>\{&quot;role&quot;:&quot;User&quot;\}<\/code><\/pre><\/td>/,
  );
});

test('markdownMatrixPlugin trims whitespace around format column specs', () => {
  const fixture = createCsvFixture([
    ['Name', 'Payload'],
    ['Alice', '{"role":"Admin"}'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B2?header=first&formatColumn= payload : json ]]');

  assert.match(html, /mmi-table__cell--formatted/);
  assert.match(html, /data-format="json"/);
});

test('markdownMatrixPlugin supports multiple formatColumn query parameters', () => {
  const fixture = createCsvFixture([
    ['Name', 'Payload', 'Metadata'],
    ['Alice', '{"role":"Admin"}', '{"team":"A"}'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render(
    '![[./roles.csv#Sheet1|A1:C2?header=first&formatColumn=Payload:json&formatColumn=Metadata:json]]',
  );

  assert.match(
    html,
    /<td class="mmi-table__cell mmi-table__cell--formatted"><pre class="mmi-table__cell-code" data-format="json"><code>\{&quot;role&quot;:&quot;Admin&quot;\}<\/code><\/pre><\/td>/,
  );
  assert.match(
    html,
    /<td class="mmi-table__cell mmi-table__cell--formatted"><pre class="mmi-table__cell-code" data-format="json"><code>\{&quot;team&quot;:&quot;A&quot;\}<\/code><\/pre><\/td>/,
  );
});





test('markdownMatrixPlugin short-circuits mode=card before workbook loading', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-card-shortcircuit-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'broken.xml'), '<root />');

  const md = createMarkdownIt(path.join(docsDir, 'spec.md'));
  const html = md.render('![[./broken.xml#Sheet1|A1:B2?mode=card]]');

  assert.match(html, /class="mmi-card"/);
  assert.doesNotMatch(html, /class="mmi-error"/);
});

test('markdownMatrixPlugin auto-falls back to card mode for wide tables', () => {
  const fixture = createCsvFixture([
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:K2]]');

  assert.match(html, /class="mmi-card"/);
  assert.doesNotMatch(html, /class="mmi-table"/);
});

test('markdownMatrixPlugin keeps table mode when mode=table overrides smart fallback', () => {
  const fixture = createCsvFixture([
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:K2?mode=table]]');

  assert.match(html, /class="mmi-table"/);
  assert.doesNotMatch(html, /class="mmi-card"/);
});

test('markdownMatrixPlugin renders a visible mmi-error, not a huge table, when mode=table exceeds the hard cell limit', () => {
  // The declared range alone (A1:A100001, 100,001 cells) drives the decision --
  // the fixture data itself stays tiny. mode=table must not be able to bypass
  // this (input-assistance-source-model.md §3), and per notation spec P2 the
  // failure must be visible, never silent.
  const fixture = createCsvFixture([['x']]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:A100001?mode=table]]');

  assert.match(html, /class="mmi-error"/);
  assert.match(html, /100001 cells exceeds the 100000-cell limit/);
  assert.doesNotMatch(html, /class="mmi-table"/);
});

test('markdownMatrixPlugin auto-falls back to card mode when no sheet is specified', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name'],
    ['1', 'Alice'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv]]');

  assert.match(html, /class="mmi-card"/);
  assert.doesNotMatch(html, /class="mmi-table"/);
});

test('markdownMatrixPlugin renders card mode without loading a table', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C2?mode=card]]');

  assert.match(html, /class="mmi-card"/);
  assert.match(html, /roles.csv/);
  assert.match(html, /Sheet1 \/ A1:C2/);
  assert.doesNotMatch(html, /mmi-table/);
});



test('markdownMatrixPlugin adds caption, id, page break and orientation metadata', () => {
  const fixture = createCsvFixture([
    ['ID', 'State'],
    ['1', 'Draft'],
    ['2', 'Done'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B3?header=first&caption=%E7%8A%B6%E6%85%8B%E4%B8%80%E8%A6%A7&id=tbl-state&pageBreak=before&orientation=landscape]]');

  assert.match(html, /<figure class="mmi-embed" id="tbl-state" data-page-break="before" data-orientation="landscape">/);
  assert.match(html, /<figcaption class="mmi-embed__caption">状態一覧<\/figcaption>/);
  assert.match(html, /<table class="mmi-table">/);
});

test('markdownMatrixPlugin wraps card mode embeds in the same metadata frame', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C2?mode=card&caption=Roles&id=card-roles&pageBreak=both&orientation=portrait]]');

  assert.match(html, /<figure class="mmi-embed" id="card-roles" data-page-break="both" data-orientation="portrait">/);
  assert.match(html, /<figcaption class="mmi-embed__caption">Roles<\/figcaption>/);
  assert.match(html, /class="mmi-card"/);
});

test('markdownMatrixPlugin resolves workspace fallback paths and xlsx sheets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-xlsx-'));
  const docsDir = path.join(tempDir, 'docs');
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['ID', 'State'],
    ['1', 'Draft'],
    ['2', 'Done'],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'States');
  fs.writeFileSync(path.join(workspaceDir, 'states.xlsx'), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  const md = createMarkdownIt(path.join(docsDir, 'spec.md'), workspaceDir);
  const html = md.render('prefix ![[states.xlsx#States|A1:B3?header=first]] suffix');

  assert.match(html, /prefix/);
  assert.match(html, /<td class="mmi-table__cell">1<\/td><td class="mmi-table__cell">Draft<\/td>/);
  assert.match(html, /suffix/);
});

test('markdownMatrixPlugin emits error html for unsupported xml', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-xml-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'broken.xml'), '<root />');

  const md = createMarkdownIt(path.join(docsDir, 'spec.md'));
  const html = md.render('![[./broken.xml]]');

  assert.match(html, /class="mmi-error"/);
  assert.match(html, /Unsupported XML format/);
});

test('markdownMatrixPlugin resolves the document path from the markdown-it env (VS Code preview contract)', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);

  // Configured WITHOUT a static markdownFilePath: the path must come from env,
  // exactly as VS Code's Markdown preview supplies env.currentDocument (a Uri).
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, { cache: new WorkbookCache() });

  const html = md.render('![[./roles.csv#Sheet1|A1:B3?header=first]]', {
    currentDocument: { fsPath: fixture.markdownFilePath },
  });

  assert.match(html, /<table class="mmi-table">/);
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td class="mmi-table__cell">Alice<\/td><td class="mmi-table__cell">Admin<\/td>/);
});

test('markdownMatrixPlugin prefers env.currentDocument over the configured fallback path', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);

  // A bogus fallback path cannot resolve ./roles.csv; the env document must win.
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    markdownFilePath: path.join(os.tmpdir(), 'mmi-does-not-exist', 'spec.md'),
    cache: new WorkbookCache(),
  });

  const html = md.render('![[./roles.csv#Sheet1|A1:B2?header=first]]', {
    currentDocument: { fsPath: fixture.markdownFilePath },
  });

  assert.match(html, /<table class="mmi-table">/);
  assert.match(html, /<td class="mmi-table__cell">Alice<\/td><td class="mmi-table__cell">Admin<\/td>/);
});

test('markdownMatrixPlugin leaves embeds untouched when no document context is available', () => {
  // Neither a configured path nor an env document: preserve the source text
  // rather than emit a misleading error or a wrongly-resolved table.
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, { cache: new WorkbookCache() });

  const html = md.render('see ![[./roles.csv#Sheet1|A1:B3?header=first]] here');

  assert.doesNotMatch(html, /mmi-table/);
  assert.doesNotMatch(html, /mmi-error/);
  assert.match(html, /roles\.csv/);
});

test('preview resolves references at render time and reuses parsed tokens across documents', () => {
  const first = createCsvFixture([['Name'], ['First']]);
  const second = createCsvFixture([['Name'], ['Second']]);
  const md = new MarkdownIt().use(markdownMatrixPlugin, { cache: new WorkbookCache() });
  const tokens = md.parse('![[./roles.csv#Sheet1|A1:A2?header=first]]', {});
  const firstHtml = md.renderer.render(tokens, md.options, { currentDocument: { fsPath: first.markdownFilePath } });
  const secondHtml = md.renderer.render(tokens, md.options, { currentDocument: { fsPath: second.markdownFilePath } });
  assert.match(firstHtml, />First</);
  assert.match(secondHtml, />Second</);
  assert.doesNotMatch(secondHtml, />First</);
  assert.deepEqual(tokens[0].map, [0, 1], 'Preserve source lines for preview scroll synchronization.');
});

test('render-time inline embeds escape surrounding text and preserve code examples', () => {
  const fixture = createCsvFixture([['Name'], ['Alice']]);
  const md = new MarkdownIt().use(markdownMatrixPlugin, {});
  const source = '<img src=x onerror=alert(1)> ![[./roles.csv#Sheet1|A1:A2]] & after';
  const tokens = md.parse(source, {});
  const html = md.renderer.render(tokens, md.options, { currentDocument: { fsPath: fixture.markdownFilePath } });
  assert.match(html, /&lt;img/);
  assert.match(html, /&amp; after/);
  assert.match(html, /mmi-table/);
  assert.doesNotMatch(html, /<img/);
  const code = md.render('`![[./roles.csv#Sheet1|A1:A2]]`');
  assert.doesNotMatch(code, /mmi-table/);
});

test('markdownMatrixPlugin renders a standalone embed as a block without a <p> wrapper', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B2?header=first&caption=Roles&id=tbl-roles]]');

  // The block-level <figure>/<table> must be emitted at the top level, not nested
  // inside a paragraph (which the browser would split into an empty <p> + sibling).
  assert.doesNotMatch(html, /<p>/);
  assert.doesNotMatch(html, /<\/p>/);
  assert.match(html, /^<figure class="mmi-embed" id="tbl-roles">/);
  assert.match(html, /<table class="mmi-table">/);
});

test('markdownMatrixPlugin renders multiple standalone embeds on adjacent lines as blocks', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  // Two embeds separated by a hard line break form a single paragraph in Markdown.
  const html = md.render('![[./roles.csv#Sheet1|A1:B2?header=first&id=a]]\n![[./roles.csv#Sheet1|A1:B2?header=first&id=b]]');

  assert.doesNotMatch(html, /<p>/);
  assert.match(html, /<figure class="mmi-embed" id="a">/);
  assert.match(html, /<figure class="mmi-embed" id="b">/);
});

test('markdownMatrixPlugin keeps an embed inline when mixed with surrounding prose', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('see ![[./roles.csv#Sheet1|A1:B2?header=first]] here');

  // Mixed content stays within the paragraph so the surrounding prose is preserved.
  assert.match(html, /<p>see /);
  assert.match(html, / here<\/p>/);
  assert.match(html, /<table class="mmi-table">/);
});

// --------------------------------------------------------------------------
// Production preview entry path (extendMarkdownIt equivalent)
//
// extendMarkdownIt (extension.ts) uses markdownMatrixPlugin with a
// resolveWorkspaceRoot callback that calls vscode.workspace.getWorkspaceFolder.
// That vscode dependency makes it un-importable in unit tests.  We reproduce
// the same wiring here by injecting an equivalent callback directly into the
// plugin — same code path, no vscode module required.
// --------------------------------------------------------------------------

test('markdownMatrixPlugin (production preview wiring) resolves workspace root via callback and renders block HTML', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);
  const workspaceRoot = path.dirname(path.dirname(fixture.filePath)); // parent of docs/

  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    // No static markdownFilePath — document path must come from env, like the real preview.
    cache: new WorkbookCache(),
    resolveWorkspaceRoot: (_markdownFilePath: string) => workspaceRoot,
  });

  const html = md.render('![[./roles.csv#Sheet1|A1:B2?header=first&caption=Roles&id=tbl-roles]]', {
    currentDocument: { fsPath: fixture.markdownFilePath },
  });

  // Structural correctness (G1: HTML structure survival check)
  assert.match(html, /<figure class="mmi-embed" id="tbl-roles">/, 'production entry must emit the embed frame');
  assert.match(html, /<table class="mmi-table">/, 'production entry must render the table');
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td class="mmi-table__cell">Alice<\/td>/);

  // Block rendering: standalone embed must NOT be wrapped in a <p>
  assert.doesNotMatch(html, /<p>/, 'standalone embed must not produce a <p> wrapper (block-in-paragraph nesting)');
  assert.doesNotMatch(html, /<\/p>/);
});

test('markdownMatrixPlugin (production preview wiring) emits expected mmi-* classes and data-* attributes', () => {
  const fixture = createCsvFixture([
    ['ID', 'State'],
    ['1', 'Draft'],
  ]);

  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    cache: new WorkbookCache(),
    resolveWorkspaceRoot: () => undefined,
  });

  const html = md.render(
    '![[./roles.csv#Sheet1|A1:B2?header=first&caption=状態一覧&id=tbl-state&pageBreak=before&orientation=landscape&highlightColumn=State&highlightValue=Draft]]',
    { currentDocument: { fsPath: fixture.markdownFilePath } },
  );

  // Frame attributes that CSS targets — these must survive DOMPurify defaults
  assert.match(html, /class="mmi-embed"/, 'mmi-embed class must be present');
  assert.match(html, /id="tbl-state"/, 'id attribute must be present');
  assert.match(html, /data-page-break="before"/, 'data-page-break must be present');
  assert.match(html, /data-orientation="landscape"/, 'data-orientation must be present');
  assert.match(html, /<figcaption class="mmi-embed__caption">状態一覧<\/figcaption>/);
  assert.match(html, /mmi-table__row--highlight/, 'highlight class must be applied');
  assert.doesNotMatch(html, /<p>/, 'no <p> wrapper on standalone embed');
});
