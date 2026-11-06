/**
 * `mmi pdf`: one-step PDF output through WeasyPrint. The generator is replaced by a fake runner here; the real
 * WeasyPrint/veraPDF results are recorded in 02_Architecture/delivery-pdf-output.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli/mmi.js';
import { buildPdf, PDFA_IMAGE_CSS, type PdfRunner } from '../src/cli/pdf.js';
import { RenderError } from '../src/cli/render.js';

type Call = { command: string; args: string[]; html: string };

function workspace(markdown = '---\ntitle: 基本設計書\n---\n## 概要\n\n本文\n'): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-pdf-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return { root, doc };
}

/** Behaves like WeasyPrint: reads HTML from stdin and writes the PDF to the path it was given. */
const fakeWeasyPrint = (calls: Call[], stderr = ''): PdfRunner => (command, args, html) => {
  calls.push({ command, args, html });
  fs.writeFileSync(args[1], '%PDF-fake');
  return { status: 0, stderr };
};

test('buildPdf pipes the exported HTML to WeasyPrint with the base URL and the PDF/A-2a tags', () => {
  const { root, doc } = workspace();
  const output = path.join(root, 'out.pdf');
  const calls: Call[] = [];
  buildPdf({ markdownFilePath: doc, workspaceRoot: root, output, variant: 'pdf/a-2a' }, fakeWeasyPrint(calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'weasyprint');
  assert.equal(calls[0].args[0], '-');
  assert.equal(calls[0].args[2], '--base-url');
  assert.match(calls[0].args[3], /^file:\/\/\/.*\/$/, 'the base URL is the document folder, so relative images and links resolve');
  assert.deepEqual(calls[0].args.slice(4), ['--pdf-variant', 'pdf/a-2a', '--pdf-tags']);
  assert.match(calls[0].html, /<title>基本設計書<\/title>/);
  assert.equal(fs.readFileSync(output, 'utf8'), '%PDF-fake');
  assert.ok(!fs.existsSync(`${output}.mmi-tmp`), 'the temporary file is renamed away');
});

test('variant none adds no PDF variant or tag options', () => {
  const { root, doc } = workspace();
  const calls: Call[] = [];
  buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'o.pdf'), variant: 'none' }, fakeWeasyPrint(calls));
  assert.equal(calls[0].args.length, 4);
});

test('PDF/A variants turn off image interpolation before the user CSS; other variants do not (#788)', () => {
  const { root, doc } = workspace('---\ntitle: 図\ncss: user.css\n---\n## 図\n\n![棒グラフ](chart.png)\n');
  fs.writeFileSync(path.join(root, 'user.css'), 'img { image-rendering: auto; }');
  for (const variant of ['pdf/a-2a', 'pdf/a-2b', 'pdf/ua-1', 'none'] as const) {
    const calls: Call[] = [];
    buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'out.pdf'), variant }, fakeWeasyPrint(calls));
    const html = calls[0].html;
    const ours = html.indexOf(PDFA_IMAGE_CSS);
    if (variant.startsWith('pdf/a-')) {
      assert.ok(ours > html.indexOf('<style>'), `${variant}: the rule is inside the document stylesheet`);
      assert.ok(ours < html.indexOf('img { image-rendering: auto; }'), `${variant}: the user CSS comes later and can override it`);
    } else {
      assert.equal(ours, -1, `${variant}: no PDF/A rule`);
    }
  }
});

test('a failed WeasyPrint run leaves no partial PDF, keeps the earlier one, and reports its message', () => {
  const { root, doc } = workspace();
  const output = path.join(root, 'out.pdf');
  fs.writeFileSync(output, 'previous');
  const failing: PdfRunner = (_command, args) => {
    fs.writeFileSync(args[1], 'partial');
    return { status: 1, stderr: 'ERROR: could not read the font\n' };
  };
  assert.throws(
    () => buildPdf({ markdownFilePath: doc, workspaceRoot: root, output, variant: 'none' }, failing),
    (error: unknown) => error instanceof RenderError && /exit 1/.test(error.message) && /could not read the font/.test(error.message),
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'previous');
  assert.ok(!fs.existsSync(`${output}.mmi-tmp`));
});

test('a missing WeasyPrint is reported with how to install it', () => {
  const { root, doc } = workspace();
  const missing: PdfRunner = () => ({ status: null, stderr: '', error: Object.assign(new Error('spawn weasyprint ENOENT'), { code: 'ENOENT' }) });
  assert.throws(
    () => buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'o.pdf'), variant: 'none' }, missing),
    (error: unknown) => error instanceof RenderError && /pip install weasyprint/.test(error.message),
  );
});

test('known harmless WeasyPrint warnings are dropped and real ones are returned', () => {
  const { root, doc } = workspace();
  const calls: Call[] = [];
  const warnings = buildPdf(
    { markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'o.pdf'), variant: 'none' },
    fakeWeasyPrint(calls, 'WARNING: Ignored `print-color-adjust: exact` at 1:1, unknown property.\nWARNING: .notdef glyph rendered for U+2705\n'),
  );
  assert.deepEqual(warnings, ['WARNING: .notdef glyph rendered for U+2705']);
});

test('reference errors stop the PDF before WeasyPrint runs', () => {
  const { root, doc } = workspace('![[./missing.csv#Sheet1|A1:B2]]\n');
  const calls: Call[] = [];
  assert.throws(() => buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'o.pdf'), variant: 'none' }, fakeWeasyPrint(calls)), RenderError);
  assert.equal(calls.length, 0);
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

test('mmi pdf validates its arguments before doing any work', async () => {
  const { root, doc } = workspace();
  assert.equal((await quiet(() => main(['pdf', '--root', root]))).code, 2);
  assert.equal((await quiet(() => main(['pdf', doc, '--root', root]))).code, 2, '-o is required');
  const badVariant = await quiet(() => main(['pdf', doc, '-o', path.join(root, 'a.pdf'), '--variant', 'pdf/x-4', '--root', root]));
  assert.equal(badVariant.code, 2);
  assert.match(badVariant.errors, /--variant must be one of/);
  const outside = await quiet(() => main(['pdf', doc, '-o', path.join(os.tmpdir(), 'mmi-outside.pdf'), '--root', root]));
  assert.equal(outside.code, 2);
  assert.match(outside.errors, /inside --root/);
});

test('mmi pdf refuses to overwrite a non-file and rejects colliding names', async () => {
  const { root, doc } = workspace();
  const sub = path.join(root, 'sub');
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, 'spec.md'), '本文\n');
  const collide = await quiet(() => main(['pdf', doc, path.join(sub, 'spec.md'), '-o', path.join(root, 'out'), '--root', root]));
  assert.equal(collide.code, 2);
  assert.match(collide.errors, /same PDF name/);
  fs.mkdirSync(path.join(root, 'spec.pdf'));
  const directory = await quiet(() => main(['pdf', doc, '-o', path.join(root, 'spec.pdf'), '--root', root]));
  assert.equal(directory.code, 2);
  assert.match(directory.errors, /will not overwrite/);
});

test('mmi pdf reports a missing WeasyPrint with exit 1 and writes nothing', async () => {
  const { root, doc } = workspace();
  const output = path.join(root, 'out.pdf');
  const missing = await quiet(() => main(['pdf', doc, '-o', output, '--weasyprint', path.join(root, 'no-such-weasyprint'), '--root', root]));
  assert.equal(missing.code, 1);
  assert.match(missing.errors, /WeasyPrint was not found/);
  assert.ok(!fs.existsSync(output) && !fs.existsSync(`${output}.mmi-tmp`));
});
