import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonTreeCandidate, readJsonTree, JSON_TREE_VERSION } from '../src/adapters/jsonTreeAdapter.js';
import { isXmlSpreadsheet2003, readXmlTree, xmlTreeCandidate } from '../src/adapters/xmlTreeAdapter.js';
import { structuralizeText, textTreeCandidates, TEXT_TREE_VERSION, type TextStructuralizeOptions } from '../src/adapters/textTreeStructuralizer.js';
import { candidateProblem, type Candidate } from '../src/core/candidate.js';
import { treeEdges, treeFromParentColumn, type Tree } from '../src/core/tree.js';
import { projectNestedList } from '../src/core/treeProjection.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { sliceRegion } from '../src/core/tableGeometry.js';
import { inspectSource } from '../src/cli/mmi.js';
import { readTreeSource, runTree, treeSourceFormat, type TreeCommandValues } from '../src/cli/tree.js';

const DIGEST = `sha256:${'0'.repeat(64)}`;

function tmp(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-tree-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function tree(result: { tree?: Tree; diagnostics: unknown[] }): Tree {
  assert.ok(result.tree, `expected a tree, got ${JSON.stringify(result.diagnostics)}`);
  return result.tree;
}

function claim(candidate: Candidate, aspect: string) {
  return candidate.claims.find((c) => c.aspect === aspect);
}

function runCli(args: string[], values: TreeCommandValues = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runTree(args, values, { out: (t) => out.push(t), err: (t) => err.push(t), usage: (m) => (err.push(`usage: ${m}`), 2) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

// --- JSON ---------------------------------------------------------------------------------

test('JSON: object/array nesting is copied exactly, keys in source order (integer-like keys are not reordered)', () => {
  const t = tree(readJsonTree('{"b": 1, "2": {"x": [true, null, "s"]}, "1": [], "a": {}, "n": -1.50e3}'));
  assert.deepEqual(treeEdges(t), [
    ['', '$'],
    ['$', 'b'],
    ['$', '2'],
    ['2', 'x'],
    ['x', '[0]'],
    ['x', '[1]'],
    ['x', '[2]'],
    ['$', '1'],
    ['$', 'a'],
    ['$', 'n'],
  ]);
  const n = t.roots[0].children[4];
  assert.equal(n.value, '-1.50e3', 'numbers keep their source text');
  assert.equal(n.valueType, 'number');
  assert.equal(t.roots[0].children[1].children[0].children[2].locator.path, '/2/x/2');
  assert.equal(
    projectNestedList(t),
    ['- $', '  - b: 1', '  - 2', '    - x', '      - [0]: true', '      - [1]: null', '      - [2]: s', '  - 1: []', '  - a: {}', '  - n: -1.50e3', ''].join('\n'),
  );
});

test('JSON: the Candidate is observed M0 deterministic and passes the contract invariants', () => {
  const candidate = jsonTreeCandidate({ source: './a.json', sourceDigest: DIGEST, tree: tree(readJsonTree('{"a":{"b":[1,2]}}')) });
  assert.equal(candidateProblem(candidate), undefined);
  assert.equal(candidate.kind, 'tree');
  assert.equal(candidate.status, 'observed');
  assert.equal(candidate.method, 'M0');
  assert.equal(candidate.execution, 'deterministic');
  assert.equal(claim(candidate, 'hierarchy')?.value, 'nodes=5 depth=4 roots=1');
  assert.equal(claim(candidate, 'hierarchy')?.reasonCode, 'json-object-array-nesting');
  assert.equal(candidate.provenance.run.execution === 'deterministic' && candidate.provenance.run.implementationVersion, JSON_TREE_VERSION);
  assert.deepEqual(candidate.scores, []);
});

test('JSON: duplicate keys are kept and reported; syntax errors name the line', () => {
  const dup = readJsonTree('{\n "a": 1,\n "a": 2\n}');
  assert.equal(tree(dup).roots[0].children.length, 2);
  assert.deepEqual(dup.diagnostics.map((d) => [d.code, d.line]), [['MMI_TREE_JSON_DUPLICATE_KEY', 3]]);
  const bad = readJsonTree('{\n "a": 1,\n "b": }');
  assert.equal(bad.tree, undefined);
  assert.deepEqual(bad.diagnostics.map((d) => [d.code, d.line]), [['MMI_TREE_JSON_SYNTAX', 3]]);
});

test('JSON: depth and node limits give a diagnostic and no tree, never a truncated one', () => {
  const deep = readJsonTree(`${'['.repeat(70)}${']'.repeat(70)}`);
  assert.equal(deep.tree, undefined);
  assert.equal(deep.diagnostics[0].code, 'MMI_TREE_LIMIT_DEPTH');
  assert.match(deep.diagnostics[0].message, /nothing was truncated/u);
  const wide = readJsonTree(JSON.stringify(Array.from({ length: 20 }, (_, i) => i)), { maxDepth: 64, maxNodes: 10 });
  assert.equal(wide.tree, undefined);
  assert.equal(wide.diagnostics[0].code, 'MMI_TREE_LIMIT_NODES');
  // Deep input far beyond the limit does not overflow the stack.
  assert.equal(readJsonTree(`${'['.repeat(100_000)}`).diagnostics[0].code, 'MMI_TREE_LIMIT_DEPTH');
});

// --- XML ----------------------------------------------------------------------------------

const GENERIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- prolog -->
<catalog xmlns:x="urn:example" version="2">
  <item id="1" x:kind="a&amp;b">Tea &lt;green&gt;</item>
  <item id="2"><name>Coffee</name><!-- note --><![CDATA[<raw> & text]]></item>
  <?render fast?>
  <empty/>
</catalog>
`;

test('XML: element nesting, attributes (in order), text, comments, CDATA and PIs are all kept', () => {
  const t = tree(readXmlTree(GENERIC_XML));
  assert.deepEqual(treeEdges(t), [
    ['', '#comment'],
    ['', 'catalog'],
    ['catalog', 'item'],
    ['item', '#text'],
    ['catalog', 'item'],
    ['item', 'name'],
    ['name', '#text'],
    ['item', '#comment'],
    ['item', '#cdata'],
    ['catalog', 'render'],
    ['catalog', 'empty'],
  ]);
  const catalog = t.roots[1];
  assert.deepEqual(catalog.attributes, [{ name: 'xmlns:x', value: 'urn:example' }, { name: 'version', value: '2' }]);
  assert.deepEqual(catalog.children[0].attributes, [{ name: 'id', value: '1' }, { name: 'x:kind', value: 'a&b' }]);
  assert.equal(catalog.children[0].children[0].value, 'Tea <green>');
  assert.equal(catalog.children[1].children[2].value, '<raw> & text');
  assert.equal(catalog.children[1].locator.path, '/catalog[1]/item[2]');
  assert.equal(catalog.children[1].locator.line, 5);
  assert.equal(
    projectNestedList(t),
    [
      '- (comment) prolog',
      '- catalog (@xmlns:x="urn:example", @version="2")',
      '  - item (@id="1", @x:kind="a&b"): Tea \\<green>',
      '  - item (@id="2")',
      '    - name: Coffee',
      '    - (comment) note',
      '    - (CDATA) \\<raw> & text',
      '  - (?render) fast',
      '  - empty',
      '',
    ].join('\n'),
  );
  const candidate = xmlTreeCandidate({ source: './c.xml', sourceDigest: DIGEST, tree: t });
  assert.equal(candidateProblem(candidate), undefined);
  assert.equal(candidate.status, 'observed');
  assert.equal(candidate.method, 'M0');
  assert.deepEqual(claim(candidate, 'hierarchy')?.evidence, [{ code: 'node-kinds', detail: 'element=5 text=2 cdata=1 comment=2 processing-instruction=1' }]);
});

const SPREADSHEET_2003 = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="S1"><Table>
  <Row><Cell><Data ss:Type="String">ID</Data></Cell><Cell><Data ss:Type="String">名前</Data></Cell></Row>
  <Row><Cell><Data ss:Type="String">A-1</Data></Cell><Cell><Data ss:Type="String">申請</Data></Cell></Row>
 </Table></Worksheet>
</Workbook>
`;

test('XML Spreadsheet 2003 is refused as a tree and still inspected as a table', () => {
  assert.equal(isXmlSpreadsheet2003(SPREADSHEET_2003), true);
  const refused = readXmlTree(SPREADSHEET_2003);
  assert.equal(refused.tree, undefined);
  assert.equal(refused.diagnostics[0].code, 'MMI_TREE_XML_SPREADSHEET');
  assert.match(refused.diagnostics[0].message, /table format/u);

  const file = tmp('book.xml', SPREADSHEET_2003);
  assert.equal(treeSourceFormat(file), undefined);
  const inspected = inspectSource(file, 0);
  assert.equal(inspected.tree, undefined);
  assert.equal(inspected.sheets[0].name, 'S1');
  assert.ok(inspected.candidates.length > 0);
  assert.ok(inspected.candidates.every((c) => c.kind === 'table-range'));
  const cli = runCli([file]);
  assert.equal(cli.code, 1);
  assert.match(cli.err, /MMI_TREE_XML_SPREADSHEET/u);
});

test('XML: external DTDs and entity declarations are refused, never resolved (XXE)', () => {
  const cases: [string, string][] = [
    ['<?xml version="1.0"?><!DOCTYPE r SYSTEM "file:///etc/passwd"><r>&xxe;</r>', 'MMI_TREE_XML_EXTERNAL_DTD'],
    ['<!DOCTYPE r PUBLIC "-//X//DTD X//EN" "http://example.invalid/x.dtd"><r/>', 'MMI_TREE_XML_EXTERNAL_DTD'],
    ['<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>', 'MMI_TREE_XML_DTD_UNSUPPORTED'],
    ['<!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><r>&b;</r>', 'MMI_TREE_XML_DTD_UNSUPPORTED'],
    ['<r>&undefined;</r>', 'MMI_TREE_XML_DTD_UNSUPPORTED'],
  ];
  for (const [xml, code] of cases) {
    const result = readXmlTree(xml);
    assert.equal(result.tree, undefined, xml);
    assert.equal(result.diagnostics[0].code, code, xml);
  }
  // A bare DOCTYPE is harmless and only ignored.
  assert.ok(readXmlTree('<!DOCTYPE r><r/>').tree);
  const ignored = readXmlTree('<!DOCTYPE r [<!ELEMENT r EMPTY>]><r/>');
  assert.ok(ignored.tree);
  assert.equal(ignored.diagnostics[0].code, 'MMI_TREE_XML_DTD_IGNORED');
});

test('XML: malformed markup, other encodings and limits are diagnostics', () => {
  assert.deepEqual(readXmlTree('<a>\n<b></a>').diagnostics.map((d) => [d.code, d.line]), [['MMI_TREE_XML_MALFORMED', 2]]);
  assert.equal(readXmlTree('<a/><b/>').diagnostics[0].code, 'MMI_TREE_XML_MALFORMED');
  assert.equal(readXmlTree('<a x="1" x="2"/>').diagnostics[0].code, 'MMI_TREE_XML_MALFORMED');
  assert.equal(readXmlTree('<?xml version="1.0" encoding="Shift_JIS"?><a/>').diagnostics[0].code, 'MMI_TREE_XML_ENCODING_UNSUPPORTED');
  assert.equal(readXmlTree(`${'<a>'.repeat(70)}${'</a>'.repeat(70)}`).diagnostics[0].code, 'MMI_TREE_LIMIT_DEPTH');
  assert.equal(readXmlTree(`<r>${'<a/>'.repeat(20)}</r>`, { maxDepth: 64, maxNodes: 10 }).diagnostics[0].code, 'MMI_TREE_LIMIT_NODES');
});

// --- flat text ----------------------------------------------------------------------------

const textCandidates = (text: string, options: TextStructuralizeOptions) =>
  textTreeCandidates({ source: './t.txt', sourceDigest: DIGEST, options, result: structuralizeText(text, options) });

test('text indent: spaces nest as written; inferred M1 with rule, lines and version', () => {
  const text = 'システム\n  画面\n    一覧\n    詳細\n  帳票\n運用\n';
  const result = structuralizeText(text, { methods: ['indent'] });
  assert.equal(result.status, 'structured');
  assert.deepEqual(treeEdges(result.outcomes[0].alternatives[0].tree), [
    ['', 'システム'],
    ['システム', '画面'],
    ['画面', '一覧'],
    ['画面', '詳細'],
    ['システム', '帳票'],
    ['', '運用'],
  ]);
  const [candidate] = textCandidates(text, { methods: ['indent'] });
  assert.equal(candidateProblem(candidate), undefined);
  assert.equal(candidate.status, 'inferred');
  assert.equal(candidate.method, 'M1');
  const hierarchy = claim(candidate, 'hierarchy')!;
  assert.equal(hierarchy.status, 'inferred');
  assert.equal(hierarchy.reasonCode, 'indent-levels');
  assert.deepEqual(hierarchy.evidence?.map((e) => e.code), ['indent-unit', 'indent-columns', 'lines']);
  assert.equal(claim(candidate, 'lines')?.value, 'L1-L6');
  assert.equal(claim(candidate, 'lines')?.status, 'observed');
  assert.equal(claim(candidate, 'selection'), undefined);
  assert.equal(candidate.provenance.algorithm, 'mmi.text-tree-structuralizer');
  assert.ok(candidate.provenance.run.execution === 'deterministic' && candidate.provenance.run.implementationVersion === TEXT_TREE_VERSION);
  assert.equal(candidate.provenance.run.execution === 'deterministic' && candidate.provenance.run.config.method, 'indent');
});

test('text numbering: 1. / 1.1 / (1) nest by number; body lines are left out and counted', () => {
  const text = ['1. 概要', '本文です。', '1.1 目的', '1.2 範囲', '2. 機能', '2.1 画面', '(1) 一覧', '(2) 詳細', '2.2 帳票', '３．付録'].join('\n');
  const result = structuralizeText(text, { methods: ['numbering'] });
  assert.equal(result.status, 'structured', JSON.stringify(result.outcomes[0].evidence));
  assert.deepEqual(treeEdges(result.outcomes[0].alternatives[0].tree), [
    ['', '1. 概要'],
    ['1. 概要', '1.1 目的'],
    ['1. 概要', '1.2 範囲'],
    ['', '2. 機能'],
    ['2. 機能', '2.1 画面'],
    ['2.1 画面', '(1) 一覧'],
    ['2.1 画面', '(2) 詳細'],
    ['2. 機能', '2.2 帳票'],
    ['', '３．付録'],
  ]);
  assert.deepEqual(result.outcomes[0].evidence[0], { code: 'numbered-lines', detail: '9 of 10 non-blank lines' });
  const [candidate] = textCandidates(text, { methods: ['numbering'] });
  assert.equal(candidateProblem(candidate), undefined);
  assert.equal(claim(candidate, 'hierarchy')?.reasonCode, 'numbering-levels');
});

test('text prefix: codes nest by their longest present prefix up to a separator', () => {
  const text = ['REQ-001 ログイン', '  補足', 'REQ-001-01 パスワード', 'REQ-001-02 ロック', 'REQ-002 検索', 'REQ-002-01 条件', 'REQ-0021 別件'].join('\n');
  const options: TextStructuralizeOptions = { methods: ['prefix'], prefix: String.raw`REQ-\d+(?:-\d+)*` };
  const result = structuralizeText(text, options);
  assert.equal(result.status, 'structured');
  assert.deepEqual(treeEdges(result.outcomes[0].alternatives[0].tree), [
    ['', 'REQ-001 ログイン'],
    ['REQ-001 ログイン', 'REQ-001-01 パスワード'],
    ['REQ-001 ログイン', 'REQ-001-02 ロック'],
    ['', 'REQ-002 検索'],
    ['REQ-002 検索', 'REQ-002-01 条件'],
    ['', 'REQ-0021 別件'],
  ]);
  const [candidate] = textCandidates(text, options);
  assert.equal(candidateProblem(candidate), undefined);
  assert.equal(claim(candidate, 'hierarchy')?.reasonCode, 'prefix-code-hierarchy');
  assert.equal(candidate.provenance.run.execution === 'deterministic' && candidate.provenance.run.config.prefix, options.prefix);
});

test('ambiguous text: mixed tabs and spaces whose reading depends on the tab width are not decided', () => {
  const text = 'A\n\tB\n        C\n';
  const result = structuralizeText(text, { methods: ['indent'] });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.outcomes[0].reasonCode, 'indent-mixed-tab-space');
  assert.equal(result.outcomes[0].alternatives.length, 2);
  const candidates = textCandidates(text, { methods: ['indent'] });
  assert.equal(candidates.length, 2);
  for (const [i, candidate] of candidates.entries()) {
    assert.equal(candidateProblem(candidate), undefined);
    assert.equal(candidate.status, 'inferred');
    assert.equal(claim(candidate, 'alternative')?.value, `${i + 1}/2`);
    assert.equal(claim(candidate, 'selection')?.status, 'abstained');
    assert.equal(claim(candidate, 'selection')?.value, undefined);
  }
  const cli = runCli([tmp('mixed.txt', text)], { method: 'indent' });
  assert.equal(cli.code, 1);
  assert.equal(cli.out, '', 'nothing is written when the structure is not decided');
  assert.match(cli.err, /\[1\] indent \(tab-width-4\)/u);
  assert.match(cli.err, /\[2\] indent \(tab-width-8\)/u);
});

test('ambiguous text: a dedent between two levels lists both readings', () => {
  const result = structuralizeText('A\n    B\n  C\n    D\n', { methods: ['indent'] });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.outcomes[0].reasonCode, 'indent-uneven-dedent');
  assert.deepEqual(result.outcomes[0].alternatives.map((a) => treeEdges(a.tree)), [
    [['', 'A'], ['A', 'B'], ['A', 'C'], ['C', 'D']],
    [['', 'A'], ['A', 'B'], ['A', 'C'], ['A', 'D']],
  ]);
  // Mixed tabs/spaces that give the same tree under every tab width are not ambiguous.
  assert.equal(structuralizeText('A\n\tB\n\tC\nD\n    E\n', { methods: ['indent'] }).status, 'structured');
});

test('ambiguous text: skipped, repeated or orphaned numbers are never confirmed', () => {
  for (const [text, code] of [
    ['1. A\n1.1 x\n1.3 y\n2. B\n', 'numbering-gap'],
    ['1. A\n1.1 x\n1.1 y\n2. B\n', 'numbering-duplicate'],
    ['1. A\n1.1 x\n2. B\n2.2.1 z\n', 'numbering-gap'],
  ] as const) {
    const result = structuralizeText(text, { methods: ['numbering'] });
    assert.equal(result.status, 'ambiguous', text);
    assert.ok(result.outcomes[0].evidence.some((e) => e.code === code), `${text}: ${JSON.stringify(result.outcomes[0].evidence)}`);
    for (const candidate of textCandidates(text, { methods: ['numbering'] })) {
      assert.equal(candidateProblem(candidate), undefined);
      assert.equal(claim(candidate, 'selection')?.status, 'abstained');
    }
  }
  // A missing parent number gives two different structures: by position and by number.
  const orphan = structuralizeText('1. A\n1.1 x\n1.2.1 z\n', { methods: ['numbering'] });
  assert.equal(orphan.status, 'ambiguous');
  assert.equal(orphan.outcomes[0].alternatives.length, 2);
  // Duplicate codes: children could belong to either occurrence.
  const dup = structuralizeText('REQ-1 a\nREQ-1-1 b\nREQ-1 c\nREQ-1-2 d\n', { methods: ['prefix'], prefix: String.raw`REQ-\d+(?:-\d+)*` });
  assert.equal(dup.status, 'ambiguous');
  assert.equal(dup.outcomes[0].alternatives.length, 2);
});

test('auto: methods that disagree are all listed; no structure gives one abstained Candidate', () => {
  const text = '1. A\n  note\n1.1 B\n';
  const auto = structuralizeText(text, { methods: ['indent', 'numbering'] });
  assert.equal(auto.status, 'ambiguous');
  const candidates = textCandidates(text, { methods: ['indent', 'numbering'] });
  assert.deepEqual(candidates.map((c) => c.provenance.run.execution === 'deterministic' && c.provenance.run.config.method), ['indent', 'numbering']);
  assert.ok(candidates.every((c) => claim(c, 'alternative')?.reasonCode === 'methods-disagree'));

  const flat = textCandidates('ただの段落です。\n次の段落です。\n', { methods: ['indent', 'numbering'] });
  assert.equal(flat.length, 1);
  assert.equal(candidateProblem(flat[0]), undefined);
  assert.equal(flat[0].status, 'abstained');
  assert.equal(claim(flat[0], 'hierarchy')?.reasonCode, 'no-structure-found');
});

test('text: limits and a bad prefix pattern are diagnostics, not silent cuts', () => {
  const many = Array.from({ length: 30 }, (_, i) => `${i % 2 ? '  ' : ''}line ${i}`).join('\n');
  const limited = structuralizeText(many, { methods: ['indent'], limits: { maxDepth: 64, maxNodes: 10 } });
  assert.equal(limited.outcomes.length, 0);
  assert.equal(limited.diagnostics[0].code, 'MMI_TREE_LIMIT_NODES');
  const deep = Array.from({ length: 10 }, (_, i) => `${' '.repeat(i)}x${i}`).join('\n');
  assert.equal(structuralizeText(deep, { methods: ['indent'], limits: { maxDepth: 5, maxNodes: 100 } }).diagnostics[0].code, 'MMI_TREE_LIMIT_DEPTH');
  assert.equal(structuralizeText('a', { methods: ['prefix'], prefix: '(' }).diagnostics[0].code, 'MMI_TREE_TEXT_BAD_PREFIX');
  const report = readTreeSource(tmp('many.txt', many), { method: 'indent', limits: { maxDepth: 64, maxNodes: 10 } });
  assert.equal(report.status, 'error');
});

test('Markdown: fenced code is skipped; bullets and heading markers are not part of labels', () => {
  const md = '# 設計\n\n- 画面\n  - 一覧\n```\n  code\n    more\n```\n- 帳票\n';
  const result = structuralizeText(md, { methods: ['indent'], skipFencedCode: true });
  assert.equal(result.status, 'structured');
  assert.deepEqual(treeEdges(result.outcomes[0].alternatives[0].tree), [['', '設計'], ['', '画面'], ['画面', '一覧'], ['', '帳票']]);
  assert.ok(result.outcomes[0].evidence.some((e) => e.code === 'skipped-fenced-code-lines' && e.detail === '4'));
});

test('projection: labels never start a new Markdown block, and tags outside code spans stay visible', () => {
  const line = (label: string) => projectNestedList({ roots: [{ kind: 'line', label, children: [], locator: { line: 1 } }] });
  assert.equal(line('1. 概要'), '- 1\\. 概要\n');
  assert.equal(line('# 見出し'), '- \\# 見出し\n');
  assert.equal(line('> 引用'), '- \\> 引用\n');
  assert.equal(line('`<p>` と <b>'), '- `<p>` と \\<b>\n');
  assert.equal(line('複数\n行'), '- 複数 行\n');
});

// --- reproducibility --------------------------------------------------------------------

test('the same input gives the same trees and Candidates; moving a block keeps its fingerprint', () => {
  const json = '{"a":[1,{"b":2}]}';
  const xml = GENERIC_XML;
  const text = '1. A\n1.1 B\n2. C\n';
  const once = () => JSON.stringify([
    jsonTreeCandidate({ source: 's', sourceDigest: DIGEST, tree: tree(readJsonTree(json)) }),
    xmlTreeCandidate({ source: 's', sourceDigest: DIGEST, tree: tree(readXmlTree(xml)) }),
    textCandidates(text, { methods: ['indent', 'numbering'] }),
    readJsonTree(json),
    readXmlTree(xml),
    structuralizeText(text, { methods: ['indent', 'numbering'] }),
  ]);
  assert.equal(once(), once());
  const moved = textCandidates(`\n\n\n${text}`, { methods: ['numbering'] })[0];
  const original = textCandidates(text, { methods: ['numbering'] })[0];
  assert.equal(moved.fingerprint.digest, original.fingerprint.digest);
  assert.notEqual(claim(moved, 'lines')?.value, claim(original, 'lines')?.value);
  assert.notEqual(textCandidates('1. A\n1.1 X\n2. C\n', { methods: ['numbering'] })[0].fingerprint.digest, original.fingerprint.digest);
});

// --- extension point: parent column -----------------------------------------------------

test('parent column: CSV rows with id and parent id build the same Tree model', () => {
  const csv = tmp('org.csv', 'ID,親ID,名称\nD1,,開発部\nD1-1,D1,第1課\nD1-2,D1,第2課\nD1-1-a,D1-1,Aチーム\nS1,,営業部\n');
  const sheet = loadWorkbook({ absolutePath: csv }).sheets.Sheet1;
  const rows = sliceRegion(sheet, 'A2:C6');
  const built = treeFromParentColumn({ rows, idColumn: 0, parentColumn: 1, labelColumn: 2, firstRowNumber: 2 });
  assert.deepEqual(built.problems, []);
  assert.deepEqual(treeEdges(built.tree!), [['', '開発部'], ['開発部', '第1課'], ['第1課', 'Aチーム'], ['開発部', '第2課'], ['', '営業部']]);
  assert.equal(built.tree!.roots[0].children[0].children[0].locator.line, 5);
  const broken = treeFromParentColumn({ rows: [['a', 'b'], ['b', 'a'], ['c', 'x'], ['c', '']], idColumn: 0, parentColumn: 1 });
  assert.equal(broken.tree, undefined);
  assert.deepEqual(broken.problems.map((p) => p.code).sort(), ['cycle', 'cycle', 'duplicate-id', 'missing-parent']);
});

// --- CLI and inspect --------------------------------------------------------------------

test('mmi tree prints a nested list with a provenance comment; --json carries trees and Candidates', () => {
  const file = tmp('data.json', '{"system":{"screens":["list","detail"]}}');
  const plain = runCli([file]);
  assert.equal(plain.code, 0, plain.err);
  const [comment, blank, ...list] = plain.out.split('\n');
  assert.match(comment, /^<!-- mmi:tree source="[^"]+data\.json" method="json" status="observed" fingerprint="sha256:[0-9a-f]{64}" -->$/u);
  assert.equal(blank, '');
  assert.deepEqual(list, ['- $', '  - system', '    - screens', '      - [0]: list', '      - [1]: detail', '']);
  const json = runCli([file], { json: true });
  assert.equal(json.code, 0);
  const report = JSON.parse(json.out);
  assert.equal(report.status, 'structured');
  assert.equal(report.candidates[0].kind, 'tree');
  assert.equal(report.choices[0].tree.roots[0].label, '$');
  assert.equal(runCli([file], { method: 'indent' }).code, 2, '--method is for text only');
  assert.equal(runCli([tmp('x.txt', 'a')], { method: 'prefix' }).code, 2, 'prefix needs --prefix');
});

test('inspect lists tree Candidates for .json/.xml/.txt/.md and leaves CSV inspection unchanged', () => {
  const json = inspectSource(tmp('a.json', '{"a":[1]}'), 0);
  assert.deepEqual(json.sheets, []);
  assert.equal(json.candidates.length, 1);
  assert.equal(json.candidates[0].kind, 'tree');
  assert.equal(json.tree?.status, 'structured');
  assert.equal('tree' in (json.tree?.choices[0] ?? {}), false, 'inspect shows structure, not node contents');
  const xml = inspectSource(tmp('a.xml', '<r><a/></r>'), 0);
  assert.equal(xml.candidates[0].status, 'observed');
  const txt = inspectSource(tmp('a.txt', 'A\n\tB\n        C\n'), 0);
  assert.equal(txt.tree?.status, 'ambiguous');
  assert.equal(txt.candidates.length, 2);
  const md = inspectSource(tmp('a.md', '# T\n\n- a\n  - b\n'), 0);
  assert.equal(md.tree?.status, 'structured');

  const csv = tmp('roles.csv', 'ID,操作\nOP-01,申請\n');
  const table = inspectSource(csv, 0);
  assert.equal(table.tree, undefined);
  assert.ok(table.candidates.every((c) => c.kind === 'table-range'));
  assert.equal(table.sheets[0].regions[0].a1, 'A1:B2');
});
