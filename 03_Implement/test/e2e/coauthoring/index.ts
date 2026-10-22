/**
 * Excel + Markdown coauthoring in real VS Code with real Excel
 * (issue-0211 scenarios A, B, C, D, F, and the x-below record of #521, plus a structural-change scene). Excel (COM, hidden) creates and saves
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

const SHOTS = process.env.MMI_COAUTHORING_SHOTS;

/**
 * Visual check (issue-0211): with MMI_COAUTHORING_SHOTS=<dir>, saves a PNG of this VS Code window after a step,
 * with the Markdown preview open next to the source. A failed capture is noted but never fails the run.
 */
async function shot(label: string): Promise<void> {
  if (!SHOTS) return;
  await sleep(1500);
  const script = path.join(process.env.MMI_COAUTHORING_SCRIPTS!, 'capture-window.ps1');
  const title = path.basename(process.env.MMI_COAUTHORING_WORKSPACE!);
  await new Promise<void>((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-TitleLike', title, '-Out', path.join(SHOTS, `${label}.png`)], { timeout: 60_000 }, (error, out, err) => {
      note('shot', { label, ok: !error, detail: error ? (err || error.message).slice(0, 300) : out.trim() });
      resolve();
    });
  });
}

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
/** The diagnostics that start on this 0-based line (each reference sits on its own line in this fixture). */
const diagnosticsAt = (document: vscode.TextDocument, line: number) =>
  vscode.languages.getDiagnostics(document.uri).filter((d) => d.range.start.line === line);
const codesAt = (document: vscode.TextDocument, line: number) => diagnosticsAt(document, line).map((d) => String(d.code));

export async function run(): Promise<void> {
  const dir = process.env.MMI_COAUTHORING_WORKSPACE!;
  note('host', { vscode: vscode.version, excel: 'COM' });
  const extension = vscode.extensions.getExtension('hat47x.markdown-matrix-injector');
  await extension?.activate();
  // Visual check in another message language (MMI_COAUTHORING_LANGUAGE=ja|en), set the way a person would.
  if (process.env.MMI_COAUTHORING_LANGUAGE) {
    await vscode.workspace.getConfiguration('markdownMatrixInjector').update('language', process.env.MMI_COAUTHORING_LANGUAGE, vscode.ConfigurationTarget.Global);
  }

  const book = path.join(dir, '設計.xlsx');
  const doc = path.join(dir, 'doc.md');
  try {
    await excel(book, 'create');
    fs.writeFileSync(doc, [
      '# 画面',
      '',
      '![[./設計.xlsx#画面|A1:C4?header=first&x-headers=項目名,型,必須&x-below=0]]', // line 3: written with a record
      '',
      '![[./設計.xlsx#画面|A1:C4?header=first]]', // line 5: written without one
      '',
    ].join('\n'));
    const document = await vscode.workspace.openTextDocument(doc);
    await vscode.window.showTextDocument(document);
    if (SHOTS) {
      await vscode.commands.executeCommand('markdown.showPreviewToSide');
      await vscode.commands.executeCommand('markdownMatrixInjector.tableCatalog.focus');
      await sleep(2000);
    }

    // A. the reference shows the saved workbook; MMI-only operations leave the source untouched.
    const before = sha(book);
    let html = await render(document);
    expect(html.includes('顧客コード') && html.includes('受注日'), 'A: the first render shows the saved rows');
    await tree();
    expect(sha(book) === before, 'A: rendering and the catalog must not change the workbook');
    await sleep(500);
    expect(codesAt(document, 2).length === 0, `A: a reference written with a matching record is quiet (got ${codesAt(document, 2).join(',')})`);
    await shot('A-initial');

    // C. Excel saves a changed value -> the preview is asked to refresh, and the render shows the saved value.
    await excel(book, 'value');
    await waitFor(async () => (html = await render(document)).includes('得意先コード'), 'C: the render shows the value saved in Excel');
    expect(!html.includes('顧客コード'), 'C: the old value is gone from the render');
    await shot('C-value-changed');

    // D1. a row appended below the fixed range is not included (no auto-expansion); the catalog shows the larger table.
    await excel(book, 'append-row-outside');
    await waitFor(async () => (await tree()).some((l) => /A1:C5/u.test(l)), 'D1: the catalog shows the enlarged table');
    html = await render(document);
    expect(!html.includes('追記した項目'), 'D1: a row outside the fixed range is not shown');
    const lines = await tree();
    note('catalog-after-append', lines.filter((l) => l.includes('A1:')));
    expect(lines.some((l) => /A1:C5/u.test(l)), 'D1: the catalog shows the table as A1:C5 so the writer can see the range is stale');
    await shot('D1-row-appended-outside');

    // D2. a row inserted inside the range: the range still resolves, and the last row falls out.
    await excel(book, 'insert-row-inside');
    await waitFor(async () => (html = await render(document)).includes('挿入した項目'), 'D2: the inserted row appears');
    expect(html.includes('挿入した項目') && !html.includes('受注日'), 'D2: the inserted row is shown and the former last row falls out of A1:C4');
    note('d2-diagnostics', diagnosticsOf(document));
    await waitFor(() => codesAt(document, 2).includes('MMI_BELOW_MISMATCH'), 'D2: the rows below the range grew since the record, and the writer is told');
    const grew = diagnosticsAt(document, 2).filter((d) => String(d.code) === 'MMI_BELOW_MISMATCH');
    expect(
      grew.length === 1 && grew[0].severity === vscode.DiagnosticSeverity.Warning,
      `D2: a grown table below the fixed range is a warning (got ${JSON.stringify(grew.map((d) => [String(d.code), d.severity]))})`,
    );
    expect(codesAt(document, 4).length === 0, `D2: a reference without a record stays quiet (got ${codesAt(document, 4).join(',')})`);
    await shot('D2-row-inserted-inside');

    // D4. a column inserted inside the fixed range: the range still resolves, but the former last column
    // falls out of A1:C4, so the writer can see the structure changed (EW05 structural change).
    await excel(book, 'insert-column-inside');
    await waitFor(async () => (html = await render(document)).includes('挿入列'), 'D4: the inserted column appears');
    expect(html.includes('挿入列') && !html.includes('必須'), 'D4: the inserted column is shown and the former last column falls out of A1:C4');
    note('d4-diagnostics', diagnosticsOf(document));
    await shot('D4-column-inserted-inside');

    // D3. a renamed header is reported by x-headers.
    await excel(book, 'rename-header');
    await vscode.commands.executeCommand('workbench.action.files.save');
    let codes: string[] = [];
    for (let i = 0; i < 20 && !codes.includes('MMI_HEADERS_MISMATCH'); i += 1) {
      await sleep(250);
      codes = diagnosticsOf(document);
    }
    expect(codes.includes('MMI_HEADERS_MISMATCH'), `D3: the changed header is reported (got ${codes.join(',')})`);
    if (SHOTS) await vscode.commands.executeCommand('workbench.actions.view.problems');
    await shot('D3-header-renamed');

    // E. the other direction (#521): the record is taken at the present state, then a row below the
    // range disappears. After D1 and D2, row 5 受注日 and row 6 追記した項目 continue below A1:C4, so
    // x-below=2 matches now; removing one of them is informational, never a warning that fails a run.
    const belowDoc = path.join(dir, 'below.md');
    fs.writeFileSync(belowDoc, ['# 下の行が減った場合', '', '![[./設計.xlsx#画面|A1:C4?header=first&x-below=2]]', ''].join('\n'));
    const belowDocument = await vscode.workspace.openTextDocument(belowDoc);
    await vscode.window.showTextDocument(belowDocument);
    const belowHtml = await render(belowDocument);
    expect(belowHtml.includes('mmi-table'), 'E: the reference renders before the row below is removed');
    await sleep(500);
    expect(codesAt(belowDocument, 2).length === 0, `E: the record matches the rows below the range (got ${codesAt(belowDocument, 2).join(',')})`);
    await excel(book, 'delete-row-below');
    await waitFor(() => codesAt(belowDocument, 2).includes('MMI_BELOW_MISMATCH'), 'E: removing the row below the range is reported');
    const shrank = diagnosticsAt(belowDocument, 2).filter((d) => String(d.code) === 'MMI_BELOW_MISMATCH');
    expect(
      shrank.length === 1 && shrank[0].severity === vscode.DiagnosticSeverity.Information,
      `E: fewer rows below the range is information, not a warning (got ${JSON.stringify(shrank.map((d) => [String(d.code), d.severity]))})`,
    );
    await shot('E-row-below-removed');
    await vscode.window.showTextDocument(document);

    // B. a new sheet with a new table appears in the catalog without reloading.
    await excel(book, 'add-sheet');
    await waitFor(async () => (await tree()).some((l) => l.includes('新しい表')), 'B: the new sheet reaches the catalog');
    const after = await tree();
    expect(after.some((l) => l.includes('新しい表')) && after.some((l) => /A1:B3/u.test(l)), 'B: the new sheet and its table are in the catalog');
    if (SHOTS) await vscode.commands.executeCommand('workbench.action.closePanel');
    await shot('B-new-sheet');
    if (SHOTS) await vscode.commands.executeCommand('workbench.actions.view.problems');

    // F1. sheet renamed: a visible error, never the old table.
    await excel(book, 'rename-sheet');
    await waitFor(async () => (html = await render(document)).includes('mmi-error'), 'F1: the renamed sheet shows an error');
    expect(html.includes('mmi-error') && !html.includes('mmi-table'), 'F1: a renamed sheet shows an error, not the old table');
    await vscode.commands.executeCommand('workbench.action.files.save');
    for (let i = 0; i < 20 && !diagnosticsOf(document).includes('MMI_SHEET_NOT_FOUND'); i += 1) await sleep(250);
    expect(diagnosticsOf(document).includes('MMI_SHEET_NOT_FOUND'), 'F1: the Problems panel reports MMI_SHEET_NOT_FOUND');
    await shot('F1-sheet-renamed');

    // F2. workbook deleted: error, never the last table.
    fs.unlinkSync(book);
    await waitFor(async () => (html = await render(document)).includes('mmi-error'), 'F2: the deleted workbook shows an error');
    expect(html.includes('mmi-error') && !html.includes('mmi-table'), 'F2: a deleted workbook shows an error, not the old table');
    await shot('F2-workbook-deleted');
  } catch (error) {
    problems.push(`threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  note('summary', { problems: problems.length });
  if (problems.length > 0) throw new Error(`${LOG} ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
}
