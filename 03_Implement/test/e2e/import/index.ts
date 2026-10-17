/**
 * Import assistance in real VS Code (see runImport.ts): run the import
 * command on each fictional 方眼紙 book, then render the draft with VS Code's
 * own Markdown engine (`markdown.api.render`, the one the preview uses, with
 * this extension's markdown-it plugin) and count tables, cards and errors.
 * The books must come out byte-identical. Every check records a result; the
 * run fails at the end listing every problem.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import * as XLSX from 'xlsx';
import { screenDesignWorkbook } from '../../helpers/buildXlsxWithImages.js';

const LOG = '[mmi:import-e2e]';
const problems: string[] = [];
const note = (kind: string, data: unknown) => console.log(`${LOG} ${kind} ${JSON.stringify(data)}`);
const expect = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

async function checkBook(folder: string, book: string, expected: { tables: number; cards: number }): Promise<void> {
  const workbook = path.join(folder, book);
  const before = digest(workbook);
  const draft = path.join(folder, `${book.replace(/\.xlsx$/, '')}_取り込み候補.md`);
  const written = await vscode.commands.executeCommand<string | undefined>('markdownMatrixInjector.__test.importFromWorkbook', { workbook, draft });
  // Compare as URIs: fsPath lower-cases the Windows drive letter.
  expect(written !== undefined && vscode.Uri.file(written).toString() === vscode.Uri.file(draft).toString(), `${book}: the command did not write the draft (${written})`);
  if (!written) return;

  const text = fs.readFileSync(draft, 'utf8');
  const references = count(text, /^!\[\[[^\]\n]+\]\]$/gmu);
  const document = await vscode.workspace.openTextDocument(draft);
  const html = await vscode.commands.executeCommand<string>('markdown.api.render', document);
  const rendered = {
    references,
    tables: count(html, /<table class="mmi-table">/g),
    cards: count(html, /class="mmi-card"/g),
    errors: count(html, /class="mmi-error"/g),
    headerCells: count(html, /<th>/g),
  };
  let diagnostics: vscode.Diagnostic[] = [];
  for (let i = 0; i < 5; i += 1) {
    diagnostics = vscode.languages.getDiagnostics(document.uri).filter((d) => d.source === 'markdown-matrix-injector');
    await sleep(150);
  }
  const unchanged = digest(workbook) === before;
  note('book', { book, ...rendered, diagnostics: diagnostics.map((d) => d.message), sourceUnchanged: unchanged });

  expect(rendered.errors === 0, `${book}: ${rendered.errors} references rendered as errors`);
  expect(rendered.tables === expected.tables, `${book}: expected ${expected.tables} tables, rendered ${rendered.tables}`);
  expect(rendered.cards === expected.cards, `${book}: expected ${expected.cards} cards, rendered ${rendered.cards}`);
  expect(rendered.references === expected.tables + expected.cards, `${book}: ${rendered.references} references in the draft`);
  expect(diagnostics.length === 0, `${book}: diagnostics on the draft: ${diagnostics.map((d) => d.message).join(' / ')}`);
  expect(unchanged, `${book}: the source workbook changed`);
}

type Transcript = { title: string; placeholder: string; items: string[] }[];

async function checkHybridImageImport(folder: string): Promise<void> {
  const workbook = path.join(folder, 'image-design.xlsx');
  fs.writeFileSync(workbook, screenDesignWorkbook().bytes);
  const before = digest(workbook);
  const draft = path.join(folder, 'image-design_取り込み候補.md');

  const written = await vscode.commands.executeCommand<string | undefined>(
    'markdownMatrixInjector.__test.importFromWorkbook',
    { workbook, draft },
  );
  expect(written !== undefined, 'image import: command did not return a draft path');
  if (!written) return;

  const markdown = fs.readFileSync(draft, 'utf8');
  const document = await vscode.workspace.openTextDocument(draft);
  const html = await vscode.commands.executeCommand<string>('markdown.api.render', document);
  const assetDir = path.join(folder, 'assets', 'image-design');
  const ledgerPath = path.join(folder, 'mmi-ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as { entries: Array<{ kind: string }> };
  const observed = {
    provenanceComments: count(markdown, /<!-- mmi:extracted /g),
    renderedImages: count(html, /<img\b/g),
    renderedTables: count(html, /<table class="mmi-table">/g),
    assetFiles: fs.readdirSync(assetDir).length,
    ledgerImages: ledger.entries.filter((entry) => entry.kind === 'image').length,
    sourceUnchanged: digest(workbook) === before,
  };
  note('hybrid-image-import', observed);

  expect(observed.provenanceComments === 4, `image import: expected 4 provenance comments, got ${observed.provenanceComments}`);
  expect(observed.renderedImages === 4, `image import: expected 4 rendered images, got ${observed.renderedImages}`);
  expect(observed.renderedTables === 1, `image import: expected 1 linked table, got ${observed.renderedTables}`);
  expect(observed.assetFiles === 2, `image import: expected 2 distinct content-addressed assets, got ${observed.assetFiles}`);
  expect(observed.ledgerImages === 4, `image import: expected 4 image occurrences in ledger, got ${observed.ledgerImages}`);
  expect(observed.sourceUnchanged, 'image import: source workbook changed');
}

async function checkExternalWorkbookIntake(folder: string): Promise<void> {
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-e2e-legacy-'));
  const workbook = path.join(legacyRoot, 'external-design.xlsx');
  fs.writeFileSync(workbook, screenDesignWorkbook().bytes);
  const before = digest(workbook);
  const copiedSource = path.join(folder, 'data', 'imported', 'external-design.xlsx');
  const draft = path.join(folder, 'external-design_取り込み候補.md');

  const written = await vscode.commands.executeCommand<string | undefined>(
    'markdownMatrixInjector.__test.importFromWorkbook',
    { workbook, draft, sourceCopy: copiedSource },
  );
  expect(written !== undefined, 'external import: command did not return a draft path');
  if (!written) return;

  const markdown = fs.readFileSync(draft, 'utf8');
  const document = await vscode.workspace.openTextDocument(draft);
  const html = await vscode.commands.executeCommand<string>('markdown.api.render', document);
  const ledgerPath = path.join(folder, 'mmi-ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as {
    entries: Array<{ kind: string; source: string }>;
  };
  const importedSourceEntries = ledger.entries.filter(
    (entry) => entry.source === 'data/imported/external-design.xlsx',
  );
  const observed = {
    sourceUnchanged: digest(workbook) === before,
    sourceCopied: fs.existsSync(copiedSource),
    copyMatchesSource: fs.existsSync(copiedSource) && digest(copiedSource) === before,
    linkedToCopy: markdown.includes('./data/imported/external-design.xlsx#画面一覧|A1:B3'),
    renderedTables: count(html, /<table class="mmi-table">/g),
    renderedImages: count(html, /<img\b/g),
    ledgerImagesForCopy: importedSourceEntries.filter((entry) => entry.kind === 'image').length,
  };
  note('external-workbook-intake', observed);

  expect(observed.sourceUnchanged, 'external import: original workbook changed');
  expect(observed.sourceCopied, 'external import: workspace source copy was not created');
  expect(observed.copyMatchesSource, 'external import: source copy differs from original bytes');
  expect(observed.linkedToCopy, 'external import: draft does not link to the workspace source copy');
  expect(observed.renderedTables === 1, `external import: expected 1 linked table, got ${observed.renderedTables}`);
  expect(observed.renderedImages === 4, `external import: expected 4 images, got ${observed.renderedImages}`);
  expect(observed.ledgerImagesForCopy === 4, `external import: expected 4 ledger image occurrences, got ${observed.ledgerImagesForCopy}`);
}

/** Guided authoring: choosing a 方眼紙 table presets header/columns/mode, and the confirm step shows a table. */
async function checkGuidedAuthoring(folder: string): Promise<void> {
  const file = path.join(folder, 'guided.md');
  fs.writeFileSync(file, '# 取り込み\n\n');
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document);
  const transcript = await vscode.commands.executeCommand<Transcript>('markdownMatrixInjector.__test.runAuthoringScripted', {
    line: 2,
    character: 0,
    answers: ['./画面定義書_受注.xlsx', '受注登録', 'B11:AD19', { keep: true }, 'insert'],
  });
  const inserted = document.lineAt(2).text;
  const confirm = transcript[transcript.length - 1]?.placeholder ?? '';
  const rangeStep = transcript.find((step) => step.items.some((item) => item.startsWith('B11:AD19')));
  note('guided', { inserted, confirm, rangeItems: rangeStep?.items.slice(0, 3) });
  expect(inserted === '![[./画面定義書_受注.xlsx#受注登録|B11:AD19?header=first&columns=A,C,I,O,R,T,V&mode=table&x-headers=No,項目名,項目ID,型,桁,必須,備考&x-below=0]]', `guided authoring inserted: ${inserted}`);
  expect(/^(表として表示: 本体8行 × 7列（見出しあり）|Renders as a table: 8 body rows × 7 columns \(with header\))/u.test(confirm), `guided confirm step: ${confirm}`);
}

/** The Explorer's table catalog, and choosing columns by header and rows by keyword from it. */
async function checkCatalog(folder: string): Promise<void> {
  const tree = await vscode.commands.executeCommand<string[]>('markdownMatrixInjector.__test.tableCatalogTree');
  note('catalog', { lines: tree.length, sample: tree.filter((line) => line.includes('画面項目')).slice(0, 2) });
  expect(tree.some((line) => line === '画面定義書_受注.xlsx | .' || line.startsWith('画面定義書_受注.xlsx')), 'catalog lists the workbook');
  expect(tree.some((line) => /^ {4}2\. 画面項目 \| B11:AD19(?:・8行| · 8 rows)$/u.test(line)), 'catalog lists 受注登録の画面項目 with its range and row count');
  expect(tree.some((line) => /^ {6}必須 \| (U列|column U)$/u.test(line)), 'catalog lists the 必須 column at its sheet column');

  const file = path.join(folder, 'catalog.md');
  fs.writeFileSync(file, '# 目録から\n\n');
  const document = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(2, 0, 2, 0);
  const { result, transcript } = await vscode.commands.executeCommand<{ result: { reference?: string; rows?: unknown }; transcript: Transcript }>(
    'markdownMatrixInjector.__test.selectAndAuthorScripted',
    {
      bookPath: path.join(folder, '画面定義書_受注.xlsx'),
      request: { table: '受注登録!B11:AD19', columns: ['項目名', '必須'], rows: { contains: '○', column: '必須' } },
      answers: ['insert'],
    },
  );
  const inserted = document.lineAt(2).text;
  const confirm = transcript[transcript.length - 1]?.placeholder ?? '';
  note('catalog-select', { reference: result.reference, rows: result.rows, inserted, confirm });
  expect(inserted === '![[./画面定義書_受注.xlsx#受注登録|B11:AD19?columns=C,T&header=first&grep=○&mode=table&x-headers=項目名,必須&x-below=0]]', `catalog selection inserted: ${inserted}`);
  expect(/^(表として表示: 本体5行 × 2列（見出しあり）|Renders as a table: 5 body rows × 2 columns \(with header\))/u.test(confirm), `catalog selection confirm step: ${confirm}`);
}

/** Prose IDs missing from the referenced sheet show in Problems on open/save, as information. */
async function checkProseIds(folder: string): Promise<void> {
  const file = path.join(folder, 'prose-ids.md');
  const sheet = XLSX.utils.aoa_to_sheet([['要件ID', '名称'], ['REQ-001', '登録'], ['REQ-002', '照会'], ['REQ-003', '承認']]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '要件');
  fs.writeFileSync(path.join(folder, '要件.xlsx'), XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  fs.writeFileSync(file, ['# 要件', '', '![[./要件.xlsx#要件|A1:B4?header=first]]', '', '登録は REQ-001 を満たす。削除済みの REQ-099 は使わない。', ''].join('\n'));
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.files.save');
  let found: vscode.Diagnostic[] = [];
  for (let i = 0; i < 20 && found.length === 0; i += 1) {
    await sleep(150);
    found = vscode.languages.getDiagnostics(document.uri).filter((d) => d.code === 'MMI_PROSE_ID_NOT_IN_SOURCE');
  }
  note('prose-ids', { found: found.map((d) => [document.getText(d.range), d.severity]) });
  expect(found.length === 1, `expected one prose ID diagnostic, got ${found.length}`);
  expect(found[0] !== undefined && document.getText(found[0].range) === 'REQ-099', 'the diagnostic marks REQ-099');
  expect(found[0]?.severity === vscode.DiagnosticSeverity.Information, 'prose ID diagnostics are information');
}

export async function run(): Promise<void> {
  const folder = process.env.MMI_IMPORT_WORKSPACE!;
  const expected = JSON.parse(process.env.MMI_IMPORT_EXPECTED ?? '{}') as Record<string, { tables: number; cards: number }>;
  note('host', { vscode: vscode.version, folder });
  const extension = vscode.extensions.getExtension('hat47x.markdown-matrix-injector');
  try {
    await extension?.activate();
  } catch (error) {
    problems.push(`activation failed: ${error instanceof Error ? error.stack : String(error)}`);
  }
  for (const [book, counts] of Object.entries(expected)) {
    try {
      await checkBook(folder, book, counts);
    } catch (error) {
      problems.push(`${book} threw: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
  try {
    await checkHybridImageImport(folder);
  } catch (error) {
    problems.push(`hybrid image import threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  try {
    await checkExternalWorkbookIntake(folder);
  } catch (error) {
    problems.push(`external workbook intake threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  try {
    await checkGuidedAuthoring(folder);
  } catch (error) {
    problems.push(`guided authoring threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  try {
    await checkCatalog(folder);
  } catch (error) {
    problems.push(`catalog threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  try {
    await checkProseIds(folder);
  } catch (error) {
    problems.push(`prose ids threw: ${error instanceof Error ? error.stack : String(error)}`);
  }
  note('summary', { problems: problems.length });
  if (problems.length > 0) throw new Error(`${LOG} ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
}
