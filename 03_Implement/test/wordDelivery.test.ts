/**
 * Word delivery (`mmi docx`, #636). Pandoc is replaced by a fake that returns Pandoc-shaped packages; the real
 * Pandoc and Microsoft Word results are recorded in 02_Architecture/delivery-pdf-output.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readZip } from '../src/core/zipReader.js';
import { writeZip } from '../src/core/zipWriter.js';
import { buildDocx, type PandocRunner } from '../src/cli/docx.js';
import { main } from '../src/cli/mmi.js';
import { readFrontMatter } from '../src/cli/documentExport.js';
import { RenderError } from '../src/cli/render.js';
import { renderWordMarkdown } from '../src/cli/wordMarkdown.js';
import { buildReferenceDocx, finishDocx, pageGeometry } from '../src/cli/wordOoxml.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const part = (name: string, text: string) => ({ name, data: Buffer.from(text, 'utf8') });
const partsOf = (zip: Buffer): Map<string, string> => new Map([...readZip(zip).values()].map((entry) => [entry.name, entry.read().toString('utf8')]));

/** What `pandoc --print-default-data-file reference.docx` gives, reduced to the parts MMI touches. */
function pandocReference(): Buffer {
  return writeZip([
    part('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    part('word/document.xml', `<w:document ${W}><w:body><w:p><w:r><w:t>sample</w:t></w:r></w:p><w:sectPr /></w:body></w:document>`),
    part('word/styles.xml', '<w:styles xmlns:w="x"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi" />\n        <w:sz w:val="24" />\n        <w:szCs w:val="24" /><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA" /></w:rPr></w:rPrDefault></w:docDefaults>'
      + '<w:style w:type="table" w:default="1" w:styleId="Table"><w:name w:val="Table" /></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2" /><w:pPr><w:keepNext /></w:pPr><w:rPr><w:color w:val="4F81BD" /></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="TableCaption"><w:name w:val="Table Caption" /></w:style></w:styles>'),
    part('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="x/styles" Id="rId2" Target="styles.xml" /></Relationships>'),
    part('word/settings.xml', '<w:settings xmlns:w="x"><w:zoom w:percent="90" /><w:footnotePr><w:footnote w:id="-1" /></w:footnotePr></w:settings>'),
    part('docProps/core.xml', '<cp:coreProperties/>'),
  ]);
}

/** What Pandoc writes after converting: renumbered header/footer relationships, its own final section properties. */
function pandocOutput(body: string): Buffer {
  return writeZip([
    part('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    part('word/document.xml', `<w:document ${W}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId9" /><w:footerReference w:type="default" r:id="rId10" /><w:pgSz w:w="11906" w:h="16838" /><w:pgMar w:top="1134" w:right="1020" w:bottom="1020" w:left="1020" w:header="567" w:footer="567" w:gutter="0" /></w:sectPr></w:body></w:document>`),
    part('word/settings.xml', '<w:settings xmlns:w="x"><w:zoom w:percent="90" /><w:footnotePr><w:footnote w:id="-1" /></w:footnotePr></w:settings>'),
    part('docProps/core.xml', '<cp:coreProperties/>'),
  ]);
}

const TABLE = '<w:tbl><w:tblPr><w:tblStyle w:val="Table" /></w:tblPr><w:tblGrid /><w:tr><w:trPr><w:cnfStyle w:firstRow="1" /></w:trPr><w:tc><w:p /></w:tc></w:tr><w:tr><w:tc><w:p /></w:tc></w:tr><w:tr><w:tc><w:p /></w:tc></w:tr></w:tbl>';

const properties = (yaml: string) => readFrontMatter(`---\n${yaml}\n---\n`).properties;

test('the zip writer produces packages the zip reader reads back, with the same bytes every time', () => {
  const files = [part('a.xml', '<a>日本語</a>'.repeat(50)), part('dir/b.txt', 'b'), part('empty', '')];
  const zip = writeZip(files);
  assert.deepEqual([...partsOf(zip).entries()], files.map((file) => [file.name, file.data.toString('utf8')]));
  assert.ok(writeZip(files).equals(zip), 'deterministic');
});

test('page geometry follows paper, margin and gutter from the front matter', () => {
  assert.deepEqual(pageGeometry(properties('title: x')), { width: 11906, height: 16838, top: 1134, right: 1020, bottom: 1020, left: 1020, gutter: 0 });
  const a3 = pageGeometry(properties('paper: A3\nmargin: 25mm 20mm\ngutter: 10mm'));
  assert.equal(a3.width, 16838);
  assert.equal(a3.top, 1417);
  assert.equal(a3.left, 1134);
  assert.equal(a3.gutter, 567);
});

test('the reference document gets MMI fonts, table borders, running header and footer and the page setup', () => {
  const parts = partsOf(buildReferenceDocx(pandocReference(), properties('paper: A3\nfont: BIZ UDPGothic, Yu Gothic')));
  const styles = parts.get('word/styles.xml') as string;
  assert.match(styles, /w:ascii="BIZ UDPGothic" w:hAnsi="BIZ UDPGothic" w:eastAsia="BIZ UDPGothic"/);
  assert.match(styles, /<w:sz w:val="20"\/><w:szCs w:val="20"\/>/);
  assert.match(styles, /w:lang w:val="ja-JP" w:eastAsia="ja-JP"/);
  assert.match(styles, /<w:tblBorders>(?:<w:\w+ w:val="single" w:sz="4" w:space="0" w:color="808080"\/>){6}<\/w:tblBorders>/);
  assert.match(styles, /<w:tblStylePr w:type="firstRow">/);
  assert.match(styles, /w:styleId="Heading2"[\s\S]*?<w:color w:val="000000"\/>/, 'headings are black');
  assert.doesNotMatch(styles, /4F81BD/);
  assert.match(parts.get('word/header1.xml') as string, /TITLE[\s\S]*KEYWORDS/);
  assert.match(parts.get('word/footer1.xml') as string, /SUBJECT[\s\S]*PAGE[\s\S]*NUMPAGES/);
  assert.match(parts.get('word/_rels/document.xml.rels') as string, /Id="rId40" Target="header1.xml"/);
  assert.match(parts.get('[Content_Types].xml') as string, /\/word\/footer1\.xml/);
  const document = parts.get('word/document.xml') as string;
  assert.match(document, /<w:headerReference w:type="default" r:id="rId40"\/><w:footerReference w:type="default" r:id="rId41"\/><w:pgSz w:w="16838" w:h="23811"\/>/);
  assert.equal(document.match(/<w:sectPr/g)?.length, 1);
  // the right-hand tab of the header sits at the text width: A3 width minus the two side margins
  assert.match(parts.get('word/header1.xml') as string, /<w:tab w:val="right" w:pos="1[34]\d{3}"\/>|w:pos="14\d{3}"/);
});

test('finishing resolves the section sentinels from Pandoc\'s own final section, and landscape swaps the page', () => {
  const body = `<w:p/><w:p><w:pPr><w:sectPr>@@MMI_SECT:portrait:norefs@@</w:sectPr></w:pPr></w:p>${TABLE}<w:p><w:pPr><w:sectPr>@@MMI_SECT:landscape:refs@@</w:sectPr></w:pPr></w:p>`;
  const result = partsOf(finishDocx(pandocOutput(body), { properties: properties('title: x'), title: 'x', hasFields: false, now: new Date('2026-11-05T00:00:00Z') }));
  const document = result.get('word/document.xml') as string;
  assert.doesNotMatch(document, /@@MMI_SECT/);
  assert.match(document, /<w:sectPr><w:pgSz w:w="11906" w:h="16838"\/><w:pgMar [^>]*\/><\/w:sectPr>/, 'the cover section has no header or footer');
  assert.match(document, /<w:sectPr><w:headerReference w:type="default" r:id="rId9" \/><w:footerReference w:type="default" r:id="rId10" \/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
});

test('every table gets a repeating header row and rows that are not split, once', () => {
  const finish = (zip: Buffer) => finishDocx(zip, { properties: properties('title: x'), title: 'x', hasFields: false, now: new Date(0) });
  const once = finish(pandocOutput(TABLE));
  const document = partsOf(once).get('word/document.xml') as string;
  assert.match(document, /<w:tr><w:trPr><w:cnfStyle w:firstRow="1" \/><w:cantSplit\/><w:tblHeader\/><\/w:trPr>/);
  assert.equal(document.match(/<w:tblHeader\/>/g)?.length, 1);
  assert.equal(document.match(/<w:cantSplit\/>/g)?.length, 3, 'header row and the two body rows');
  const twice = partsOf(finish(once)).get('word/document.xml') as string;
  assert.equal(twice.match(/<w:tblHeader\/>/g)?.length, 1, 'finishing again does not repeat it');
});

test('the document properties come from front matter, and fields are updated on opening only when there are any', () => {
  const finish = (hasFields: boolean) => partsOf(finishDocx(pandocOutput('<w:p/>'), {
    properties: properties('documentNumber: SD-1\nversion: 第1.2版\nclassification: 社外秘\norganization: A社\nsubtitle: 案件<名>'), title: '設計書', hasFields, now: new Date('2026-11-05T09:30:12.345Z'),
  }));
  const core = finish(true).get('docProps/core.xml') as string;
  assert.match(core, /<dc:title>設計書<\/dc:title>/);
  assert.match(core, /<dc:subject>SD-1　第1.2版<\/dc:subject>/);
  assert.match(core, /<cp:keywords>社外秘<\/cp:keywords>/);
  assert.match(core, /<dc:creator>A社<\/dc:creator>/);
  assert.match(core, /<dc:description>案件&lt;名&gt;<\/dc:description>/);
  assert.match(core, /2026-11-05T09:30:12Z/);
  assert.match(finish(true).get('word/settings.xml') as string, /<w:updateFields w:val="true"\/><w:footnotePr>/);
  assert.doesNotMatch(finish(false).get('word/settings.xml') as string, /updateFields/);
});

function workspace(files: Record<string, string>): { root: string; doc: (name?: string) => string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-docx-test-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return { root, doc: (name = 'spec.md') => path.join(root, name) };
}

const CSV = 'ID,判定\nREL-01,完了\nREL-02,要確認\n';
const word = (markdown: string, extra: Record<string, string> = {}) => {
  const { root, doc } = workspace({ 'spec.md': markdown, 'data/gate.csv': CSV, ...extra });
  return renderWordMarkdown({ markdownFilePath: doc(), workspaceRoot: root });
};
const embed = (params: string): string => `![[./data/gate.csv#Sheet1|A1:B3?header=first&${params}]]`;

test('a captioned table becomes a Caption-style paragraph with a bookmark, then a GFM table', () => {
  const { markdown } = word(`## 概要\n\n${embed('caption=判定の状況&id=gate')}\n`);
  assert.match(markdown, /```\{=openxml\}\n<w:p><w:pPr><w:pStyle w:val="TableCaption"\/><w:keepNext\/><\/w:pPr><w:bookmarkStart w:id="1" w:name="mmi_gate"\/><w:r><w:t xml:space="preserve">判定の状況<\/w:t><\/w:r><w:bookmarkEnd w:id="1"\/><\/w:p>\n```/);
  assert.match(markdown, /\| ID \| 判定 \|\n\| --- \| --- \|\n\| REL-01 \| 完了 \|/);
  assert.match(markdown, /^---\nlang: ja-JP\n---\n/);
});

test('captionNumbers numbers tables in order, leaves hand-numbered captions alone, and links get number and page', () => {
  const { markdown, hasFields } = word(`---\ncaptionNumbers: true\n---\n[](#a)と[別の表](#b)と[手書き](#c)。\n\n${embed('caption=一つ目&id=a')}\n\n${embed('caption=二つ目&id=b')}\n\n${embed('caption=表9　手書き&id=c')}\n\n${embed('caption=三つ目')}\n`);
  assert.match(markdown, /w:name="mmi_a"\/><w:r><w:t xml:space="preserve">表1　一つ目</);
  assert.match(markdown, /w:name="mmi_b"\/><w:r><w:t xml:space="preserve">表2　二つ目</);
  assert.match(markdown, /w:name="mmi_c"\/><w:r><w:t xml:space="preserve">表9　手書き</, 'a caption that already carries its number is left as written');
  assert.match(markdown, /表3　三つ目/);
  assert.match(markdown, /\[表1\]\(#mmi_a\)（p\.`<w:r>.*PAGEREF mmi_a \\h .*<\/w:r>`\{=openxml\}）と\[別の表\]\(#mmi_b\)（p\./);
  assert.match(markdown, /\[手書き\]\(#mmi_c\)（p\./);
  assert.equal(hasFields, true);
});

test('without captionNumbers links only point at the bookmark and no fields are needed', () => {
  const { markdown, hasFields } = word(`[表](#gate)\n\n${embed('caption=判定&id=gate')}\n`);
  assert.match(markdown, /\[表\]\(#mmi_gate\)\n/);
  assert.doesNotMatch(markdown, /PAGEREF/);
  assert.equal(hasFields, false);
});

test('landscape tables sit in their own section and a heading goes with the table that starts it', () => {
  const { markdown } = word(`## 一\n\n本文\n\n## 二\n\n${embed('caption=横&orientation=landscape&pageBreak=before')}\n\n${embed('caption=続き&orientation=landscape')}\n\n後ろの本文\n`);
  const sentinels = [...markdown.matchAll(/@@MMI_SECT:(\w+):(\w+)@@/g)].map((match) => `${match[1]}:${match[2]}`);
  assert.deepEqual(sentinels, ['portrait:refs', 'landscape:refs'], 'one break into landscape, one back; consecutive landscape tables share the section');
  const breakAt = markdown.indexOf('MMI_SECT:portrait');
  assert.ok(breakAt < markdown.indexOf('## 二'), 'the portrait section ends before the heading of the landscape table');
  assert.ok(markdown.indexOf('MMI_SECT:landscape') < markdown.indexOf('後ろの本文'));
  assert.doesNotMatch(markdown, /w:br w:type="page"/, 'a section break already starts a new page');
});

test('a landscape section at the end of the document is closed, and pageBreak before/after become page breaks', () => {
  const end = word(`${embed('orientation=landscape')}\n`).markdown;
  assert.deepEqual([...end.matchAll(/@@MMI_SECT:(\w+)/g)].map((match) => match[1]), ['portrait', 'landscape']);
  const breaks = word(`前\n\n${embed('pageBreak=both')}\n\n後\n`).markdown;
  assert.equal(breaks.match(/w:br w:type="page"/g)?.length, 2);
  assert.doesNotMatch(word(`前\n\n${embed('caption=x')}\n`).markdown, /MMI_SECT|w:br/);
});

test('cover and table of contents come from front matter', () => {
  const { markdown, title, hasFields } = word('---\ncover: true\ntoc: true\ntitle: 運用設計書\nversion: 第2版\nclassification: 社外秘\napprovals: [承認, 作成]\n---\n## 1. 概要\n\n### 1.1 目的\n\n## 2. 範囲 **強**\n');
  assert.equal(title, '運用設計書');
  assert.match(markdown, /<w:t xml:space="preserve">運用設計書<\/w:t>/);
  assert.match(markdown, /<w:t xml:space="preserve">社外秘<\/w:t>/);
  assert.match(markdown, /<w:t>承認<\/w:t>[\s\S]*<w:t>作成<\/w:t>/);
  assert.match(markdown, /@@MMI_SECT:portrait:norefs@@/);
  assert.match(markdown, /TOC \\o "2-3" \\h \\z \\u/);
  assert.match(markdown, /<w:t xml:space="preserve">1\. 概要<\/w:t>[\s\S]*<w:ind w:left="420"\/>[\s\S]*1\.1 目的[\s\S]*2\. 範囲 強/);
  assert.equal(hasFields, true);
});

test('text that would break the XML is escaped', () => {
  const { markdown } = word(`---\ncover: true\ntitle: A & B <c>\n---\n${embed('caption=<x> "y"')}\n`);
  assert.match(markdown, /A &amp; B &lt;c&gt;/);
  assert.match(markdown, /&lt;x&gt; &quot;y&quot;/);
});

test('reference errors stop the export before Pandoc runs', () => {
  const { root, doc } = workspace({ 'spec.md': '![[./data/missing.csv#Sheet1|A1:B2]]\n' });
  assert.throws(() => renderWordMarkdown({ markdownFilePath: doc(), workspaceRoot: root }), RenderError);
});

type Call = { command: string; args: string[]; input?: string; reference?: string };

/** A fake Pandoc: serves the default reference document and "converts" by writing a Pandoc-shaped package. */
const fakePandoc = (calls: Call[], failure?: { status: number; stderr: string }): PandocRunner => (command, args, input) => {
  const referenceAt = args.indexOf('--reference-doc');
  calls.push({ command, args, input, reference: referenceAt >= 0 && args[0] !== '--print-default-data-file' ? fs.readFileSync(args[referenceAt + 1]).toString('latin1') : undefined });
  if (args[0] === '--print-default-data-file') return { status: 0, stdout: pandocReference(), stderr: '' };
  if (failure) return { status: failure.status, stdout: Buffer.alloc(0), stderr: failure.stderr };
  fs.writeFileSync(args[args.indexOf('-o') + 1], pandocOutput(`${TABLE}<w:p><w:pPr><w:sectPr>@@MMI_SECT:landscape:refs@@</w:sectPr></w:pPr></w:p>`));
  return { status: 0, stdout: Buffer.alloc(0), stderr: 'WARNING: sample\n' };
};

test('buildDocx asks Pandoc for its reference, converts with MMI\'s own, and writes a finished .docx', () => {
  const { root, doc } = workspace({ 'spec.md': `---\ntitle: 設計書\n---\n## 概要\n\n${embed('caption=表')}\n`, 'data/gate.csv': CSV });
  const output = path.join(root, 'out.docx');
  const calls: Call[] = [];
  const warnings = buildDocx({ markdownFilePath: doc(), workspaceRoot: root, output, now: new Date('2026-11-05T00:00:00Z') }, fakePandoc(calls));
  assert.equal(calls[0].command, 'pandoc');
  assert.deepEqual(calls[0].args, ['--print-default-data-file', 'reference.docx']);
  const convert = calls[1];
  assert.deepEqual(convert.args.slice(0, 4), ['-f', 'markdown-smart+east_asian_line_breaks', '-t', 'docx']);
  assert.ok(convert.args.includes('--reference-doc') && convert.args.includes('--resource-path'));
  assert.match(convert.input as string, /\| REL-01 \| 完了 \|/);
  assert.deepEqual(warnings, ['WARNING: sample']);
  const result = partsOf(fs.readFileSync(output));
  assert.doesNotMatch(result.get('word/document.xml') as string, /@@MMI_SECT/);
  assert.match(result.get('docProps/core.xml') as string, /<dc:title>設計書<\/dc:title>/);
  assert.ok(!fs.existsSync(`${output}.mmi-tmp`));
});

test('a reference document of your own replaces MMI\'s and Pandoc is not asked for its default', () => {
  const { root, doc } = workspace({ 'spec.md': '本文\n', 'ref.docx': 'not read by the fake' });
  const calls: Call[] = [];
  buildDocx({ markdownFilePath: doc(), workspaceRoot: root, output: path.join(root, 'o.docx'), referenceDoc: path.join(root, 'ref.docx') }, fakePandoc(calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reference, 'not read by the fake');
});

test('a Pandoc failure or a missing Pandoc is reported and leaves no .docx behind', () => {
  const { root, doc } = workspace({ 'spec.md': '本文\n' });
  const output = path.join(root, 'o.docx');
  fs.writeFileSync(output, 'previous');
  assert.throws(
    () => buildDocx({ markdownFilePath: doc(), workspaceRoot: root, output }, fakePandoc([], { status: 64, stderr: 'bad option' })),
    (error: unknown) => error instanceof RenderError && /exit 64/.test(error.message) && /bad option/.test(error.message),
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'previous');
  const missing: PandocRunner = () => ({ status: null, stdout: Buffer.alloc(0), stderr: '', error: Object.assign(new Error('spawn pandoc ENOENT'), { code: 'ENOENT' }) });
  assert.throws(() => buildDocx({ markdownFilePath: doc(), workspaceRoot: root, output: path.join(root, 'o2.docx') }, missing), /Pandoc was not found/);
  assert.ok(!fs.existsSync(path.join(root, 'o2.docx')) && !fs.existsSync(path.join(root, 'o2.docx.mmi-tmp')));
});

async function quiet(run: () => Promise<number>): Promise<{ code: number; errors: string }> {
  const lines: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    return { code: await run(), errors: lines.join('\n') };
  } finally {
    console.error = originalError;
  }
}

test('mmi docx validates its arguments and reports a missing Pandoc with exit 1', async () => {
  const { root, doc } = workspace({ 'spec.md': '本文\n', 'sub/spec.md': '本文\n', 'ref.docx': 'x' });
  assert.equal((await quiet(() => main(['docx', '--root', root]))).code, 2);
  assert.equal((await quiet(() => main(['docx', doc(), '--root', root]))).code, 2, '-o is required');
  const outside = await quiet(() => main(['docx', doc(), '-o', path.join(os.tmpdir(), 'mmi-outside.docx'), '--root', root]));
  assert.equal(outside.code, 2);
  assert.match(outside.errors, /inside --root/);
  const collide = await quiet(() => main(['docx', doc(), doc('sub/spec.md'), '-o', path.join(root, 'out'), '--root', root]));
  assert.equal(collide.code, 2);
  assert.match(collide.errors, /same \.docx name/);
  const badReference = await quiet(() => main(['docx', doc(), '-o', path.join(root, 'a.docx'), '--reference-doc', path.join(root, 'no.docx'), '--root', root]));
  assert.equal(badReference.code, 2);
  const missing = await quiet(() => main(['docx', doc(), '-o', path.join(root, 'a.docx'), '--pandoc', path.join(root, 'no-such-pandoc'), '--root', root]));
  assert.equal(missing.code, 1);
  assert.match(missing.errors, /Pandoc was not found/);
  assert.ok(!fs.existsSync(path.join(root, 'a.docx')));
});

test('with a real Pandoc the document converts, and the cover, sections and header row are in the package', (context) => {
  if (spawnSync('pandoc', ['--version']).status !== 0) return context.skip('pandoc is not installed');
  const { root, doc } = workspace({
    'spec.md': `---\ntitle: 設計書\ncover: true\ntoc: true\ncaptionNumbers: true\napprovals: [承認]\n---\n## 概要\n\n[](#g)\n\n${embed('caption=表&id=g&orientation=landscape')}\n\n以上\n`,
    'data/gate.csv': CSV,
  });
  const output = path.join(root, 'out.docx');
  buildDocx({ markdownFilePath: doc(), workspaceRoot: root, output });
  const parts = partsOf(fs.readFileSync(output));
  const document = parts.get('word/document.xml') as string;
  assert.doesNotMatch(document, /@@MMI_SECT/);
  assert.equal(document.match(/<w:sectPr/g)?.length, 4, 'cover, portrait, landscape and the final section');
  assert.match(document, /w:orient="landscape"/);
  assert.match(document, /<w:tblHeader\/>/);
  for (const id of document.match(/r:id="(rId\d+)"/g) ?? []) {
    assert.ok((parts.get('word/_rels/document.xml.rels') as string).includes(`Id="${id.slice(6, -1)}"`), `${id} resolves to a relationship`);
  }
});
