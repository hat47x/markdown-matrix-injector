/**
 * Excel + Markdown coauthoring in real VS Code with real Excel
 * (issue-0211 scenarios A, B, C, D, F). Excel (COM, hidden) creates and saves
 * the workbook between steps, exactly as a person saving in Excel would; this
 * suite then looks at what VS Code shows: the render the preview uses, the
 * diagnostics, the table catalog and whether open previews were asked to
 * refresh. Every check records a result and the run lists all problems.
 */
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

const LOG = '[mmi:coauthoring]';
const problems: string[] = [];
const note = (kind: string, data: unknown) => console.log(`${LOG} ${kind} ${JSON.stringify(data)}`);
const expect = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function excel(book: string, op: string): Promise<void> {
  const script = path.join(process.env.MMI_COAUTHORING_SCRIPTS!, 'excel-op.ps1');
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Book', book, '-Op', op], { timeout: 120_000 }, (error, _out, err) =>
      error ? reject(new Error(`excel ${op}: ${err || error.message}`)) : resolve());
  });
}

/** Polls until `condition` holds (the preview/catalog catch up asynchronously after Excel saves). */
async function waitFor(condition: () => Promise<boolean> | boolean, label: string): Promise<boolean> {
  for (let i = 0; i < 60; i += 1) {
    if (await condition()) return true;
    await sleep(250);
  }
  problems.push(`${label}: not reflected within 15s`);
  return false;
}
const render = async (document: vscode.TextDocument) => vscode.commands.executeCommand<string>('markdown.api.render', document);
const tree = () => vscode.commands.executeCommand<string[]>('markdownMatrixInjector.__test.tableCatalogTree');
const diagnosticsOf = (document: vscode.TextDocument) => vscode.languages.getDiagnostics(document.uri).map((d) => String(d.code));

export async function run(): Promise<void> {
  const dir = process.env.MMI_COAUTHORING_WORKSPACE!;
  note('host', { vscode: vscode.version, excel: 'COM' });
  const extension = vscode.extensions.getExtension('hat47x.markdown-matrix-injector');
  await extension?.activate();

  const book = path.join(dir, '設計.xlsx');
  const doc = path.join(dir, 'doc.md');
  try {
    await excel(book, 'create');
    fs.writeFileSync(doc, ['# 画面', '', '![[./設計.xlsx#画面|A1:C4?header=first&x-headers=項目名,型,必須]]', ''].join('\n'));
    const document = await vscode.workspace.openTextDocument(doc);
    await vscode.window.showTextDocument(document);

    // A. the reference shows the saved workbook; MMI-only operations leave the source untouched.
    const before = sha(book);
    let html = await render(document);
    expect(html.includes('顧客コード') && html.includes('受注日'), 'A: the first render shows the saved rows');
    await tree();
    expect(sha(book) === before, 'A: rendering and the catalog must not change the workbook');

    // C. Excel saves a changed value -> the preview is asked to refresh, and the render shows the saved value.
    await excel(book, 'value');
    await waitFor(async () => (html = await render(document)).includes('得意先コード'), 'C: the render shows the value saved in Excel');
    expect(!html.includes('顧客コード'), 'C: the old value is gone from the render');

    // D1. a row appended below the fixed range is not included (no auto-expansion); the catalog shows the larger table.
    await excel(book, 'append-row-outside');
    await waitFor(async () => (await tree()).some((l) => /A1:C5/u.test(l)), 'D1: the catalog shows the enlarged table');
    html = await render(document);
    expect(!html.includes('追記した項目'), 'D1: a row outside the fixed range is not shown');
    const lines = await tree();
    note('catalog-after-append', lines.filter((l) => l.includes('A1:')));
    expect(lines.some((l) => /A1:C5/u.test(l)), 'D1: the catalog shows the table as A1:C5 so the writer can see the range is stale');

    // D2. a row inserted inside the range: the range still resolves, and the last row falls out.
    await excel(book, 'insert-row-inside');
    await waitFor(async () => (html = await render(document)).includes('挿入した項目'), 'D2: the inserted row appears');
    expect(html.includes('挿入した項目') && !html.includes('受注日'), 'D2: the inserted row is shown and the former last row falls out of A1:C4');
    note('d2-diagnostics', diagnosticsOf(document));

    // D3. a renamed header is reported by x-headers.
    await excel(book, 'rename-header');
    await vscode.commands.executeCommand('workbench.action.files.save');
    let codes: string[] = [];
    for (let i = 0; i < 20 && !codes.includes('MMI_HEADERS_MISMATCH'); i += 1) {
      await sleep(250);
      codes = diagnosticsOf(document);
    }
    expect(codes.includes('MMI_HEADERS_MISMATCH'), `D3: the changed header is reported (got ${codes.join(',')})`);

    // B. a new sheet with a new table appears in the catalog without reloading.
    await excel(book, 'add-sheet');
    await waitFor(async () => (await tree()).some((l) => l.includes('新しい表')), 'B: the new sheet reaches the catalog');
    const after = await tree();
    expect(after.some((l) => l.includes('新しい表')) && after.some((l) => /A1:B3/u.test(l)), 'B: the new sheet and its table are in the catalog');

    // F1. sheet renamed: a visible error, never the old table.
    await excel(book, 'rename-sheet');
    await waitFor(async () => (html = await render(document)).includes('mmi-error'), 'F1: the renamed sheet shows an error');
    expect(html.includes('mmi-error') && !html.includes('mmi-table'), 'F1: a renamed sheet shows an error, not the old table');
    await vscode.commands.executeCommand('workbench.action.files.save');
    for (let i = 0; i < 20 && !diagnosticsOf(document).includes('MMI_SHEET_NOT_FOUND'); i += 1) await sleep(250);
    expect(diagnosticsOf(document).includes('MMI_SHEET_NOT_FOUND'), 'F1: the Problems panel reports MMI_SHEET_NOT_FOUND');

    // F2. workbook deleted: error, never the last table.
    fs.unlinkSync(book);
    await waitFor(async () => (html = await render(document)).includes('mmi-error'), 'F2: the deleted workbook shows an error');
    expect(html.includes('mmi-error') && !html.includes('mmi-table'), 'F2: a deleted workbook shows an error, not the old table');
  } catch (error) {
    problems.push(`threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  note('summary', { problems: problems.length });
  if (problems.length > 0) throw new Error(`${LOG} ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
}
