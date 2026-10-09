/**
 * Practical verification in real VS Code (see runPractical.ts). Every check
 * records a result; the run fails at the end listing every problem, so one
 * run reports the whole picture.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

const LOG = '[mmi:practical]';
const problems: string[] = [];
const note = (kind: string, data: unknown) => console.log(`${LOG} ${kind} ${JSON.stringify(data)}`);
const expect = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const EMBED = /!\[\[[^\]\n]*\]\]/gu;
/** Deliberately broken references in 11-diagnostics.md (line number, 0-based). */
const EXPECTED_ERRORS: Record<string, Record<number, string>> = {
  '11-diagnostics.md': { 7: 'MMI_FILE_NOT_FOUND', 13: 'MMI_SHEET_NOT_FOUND', 19: 'MMI_INVALID_XML' },
};

async function open(file: string): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor }> {
  const document = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(document);
  return { document, editor };
}

async function diagnosticsOf(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
  let last: vscode.Diagnostic[] = [];
  for (let i = 0; i < 20; i += 1) {
    last = vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'markdown-matrix-injector');
    if (i >= 4) break; // diagnostics settle within a few hundred ms
    await sleep(150);
  }
  return last;
}

async function hoverText(uri: vscode.Uri, position: vscode.Position): Promise<string> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position);
  return (hovers ?? [])
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === 'string' ? content : 'value' in content ? content.value : ''))
    .join('\n');
}

async function completionLabels(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CompletionItem[]> {
  const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, position);
  return list?.items ?? [];
}

const label = (item: vscode.CompletionItem) => (typeof item.label === 'string' ? item.label : item.label.label);

async function checkSampleDocuments(samples: string): Promise<void> {
  const docs = fs.readdirSync(samples).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
  for (const name of docs) {
    const { document } = await open(path.join(samples, name));
    const diagnostics = await diagnosticsOf(document.uri);
    const expected = EXPECTED_ERRORS[name] ?? {};
    for (const diagnostic of diagnostics) {
      const code = String(diagnostic.code);
      const line = diagnostic.range.start.line;
      expect(expected[line] === code, `${name}:${line + 1} unexpected diagnostic ${code}: ${diagnostic.message}`);
    }
    for (const [line, code] of Object.entries(expected)) {
      expect(diagnostics.some((d) => d.range.start.line === Number(line) && String(d.code) === code), `${name}:${Number(line) + 1} missing ${code}`);
    }

    for (let line = 0; line < document.lineCount; line += 1) {
      for (const match of document.lineAt(line).text.matchAll(EMBED)) {
        const at = new vscode.Position(line, (match.index ?? 0) + 3);
        const hover = await hoverText(document.uri, at);
        const kind = /別紙カード/u.test(hover) ? 'card' : /該当行0件/u.test(hover) ? 'empty' : /表として表示/u.test(hover) ? 'table' : /エラー/u.test(hover) ? 'error' : 'none';
        note('hover', { doc: name, line: line + 1, kind });
        const expectError = expected[line] !== undefined;
        expect(expectError ? kind === 'error' : kind !== 'error' && kind !== 'none', `${name}:${line + 1} hover ${kind}: ${hover.slice(0, 160)}`);
        if (expectError) continue;

        // Loss-free: keeping every value in the guided flow reproduces the text exactly.
        const original = document.lineAt(line).text;
        const version = document.version;
        const transcript = await vscode.commands.executeCommand<{ title: string; placeholder: string }[]>(
          'markdownMatrixInjector.__test.runAuthoringScripted',
          { line, character: at.character, answers: Array.from({ length: 8 }, () => ({ keep: true })) },
        );
        const last = transcript?.[transcript.length - 1];
        // Guard against a vacuous pass: the flow must have reached the confirm step on this embed.
        expect(Boolean(last && /\(5\/5\)/u.test(last.title) && /参照を編集/u.test(last.title)), `${name}:${line + 1} round trip did not reach confirm: ${JSON.stringify(transcript?.map((s) => s.title))}`);
        note('roundtrip', { doc: name, line: line + 1, steps: transcript?.length, confirm: last?.placeholder });
        const after = document.lineAt(line).text;
        expect(after === original, `${name}:${line + 1} round trip changed the reference:\n  before ${original}\n  after  ${after}`);
        if (document.version !== version) await vscode.commands.executeCommand('undo');
      }
    }
  }
}

async function checkCompletionByFileType(samples: string): Promise<void> {
  const file = path.join(samples, 'zz-completion-check.md');
  const cases: { text: string; want: string; what: string }[] = [
    { text: '![[./data/design.xlsx#', want: '状態遷移', what: 'xlsx sheets' },
    { text: '![[./data/migration.xml#', want: '移行確認', what: 'XML 2003 sheets' },
    { text: '![[./data/settings.tsv#', want: 'Sheet1', what: 'tsv sheet' },
    { text: '![[./data/excel-cp932.csv#Sheet1|', want: 'A1:D3', what: 'cp932 csv range' },
    { text: '![[./data/design.xlsx#状態遷移|', want: 'A1:F13', what: 'xlsx range of the chosen sheet' },
    { text: '![[./data/design.xlsx#状態遷移|A1:F13?mode=', want: 'table', what: 'value candidates' },
    { text: '![[./data/design.xlsx#状態遷移|A1:F13?header=first&columns=', want: 'A', what: 'column letters' },
  ];
  fs.writeFileSync(file, '# completion\n');
  const { document, editor } = await open(file);
  for (const testCase of cases) {
    await editor.edit((edit) => edit.replace(new vscode.Range(0, 0, document.lineCount, 0), `${testCase.text}\n`));
    const items = await completionLabels(document.uri, new vscode.Position(0, testCase.text.length));
    const labels = items.map(label);
    note('completion', { what: testCase.what, labels: labels.slice(0, 8) });
    expect(labels.includes(testCase.want), `completion (${testCase.what}) lacks ${testCase.want}: ${labels.join(', ')}`);
  }

  // Accepting a value replaces only the value; one Undo restores it.
  const text = '![[./data/design.xlsx#状態遷移|A1:F13?mode=ta&header=first]] 後ろの本文';
  await editor.edit((edit) => edit.replace(new vscode.Range(0, 0, document.lineCount, 0), `${text}\n`));
  const cursor = new vscode.Position(0, text.indexOf('mode=ta') + 'mode=ta'.length);
  const table = (await completionLabels(document.uri, cursor)).find((item) => label(item) === 'table');
  const range = table?.range instanceof vscode.Range ? table.range : (table?.range as { replacing: vscode.Range } | undefined)?.replacing;
  expect(Boolean(table && range), 'value completion carries a replace range');
  if (table && range) {
    // Own undo stop on both sides, so this edit is one step distinct from the setup edit above.
    await editor.edit((edit) => edit.replace(range, String(table.insertText)), { undoStopBefore: true, undoStopAfter: true });
    expect(document.lineAt(0).text === text.replace('mode=ta', 'mode=table'), `accepting a value rewrote more than the value: ${document.lineAt(0).text}`);
    await vscode.commands.executeCommand('undo');
    // `undo` resolves before the model change is always visible; wait for it rather than race it.
    for (let i = 0; i < 20 && document.lineAt(0).text !== text; i += 1) await sleep(50);
    expect(document.lineAt(0).text === text, `one Undo did not restore: ${document.lineAt(0).text}`);
  }
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  fs.rmSync(file, { force: true });
}

async function checkMultiRoot(samples: string, fixtures: string): Promise<void> {
  const inside = (root: string, docDir: string, filepath: string) => {
    const candidate = path.resolve(docDir, filepath);
    const relative = path.relative(path.resolve(root), candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  };
  // Completion of files: only the document's own folder.
  const file = path.join(fixtures, 'docs', 'zz-multiroot.md');
  fs.writeFileSync(file, '![[\n');
  const { document } = await open(file);
  const files = (await completionLabels(document.uri, new vscode.Position(0, 3))).map(label);
  note('multi-root-files', { folder: 'fixtures', files });
  expect(files.length > 0, 'no file candidates in the fixtures folder');
  for (const candidate of files) expect(inside(fixtures, path.dirname(file), candidate), `fixtures doc was offered ${candidate} from another folder`);

  // Guided editing must use the same source-resolution precedence as rendering:
  // a missing document-relative path may fall back to the current workspace root,
  // without leaking into the other root of this multi-root workspace.
  const rootRelativeDoc = path.join(fixtures, 'docs', 'zz-root-relative-authoring.md');
  const rootRelativeEmbed = '![[data/roles.csv#Sheet1|A1:B3?header=first]]';
  fs.writeFileSync(rootRelativeDoc, `# Root relative\n${rootRelativeEmbed}\n`);
  const rootRelativeOpened = await open(rootRelativeDoc);
  const rootRelativeTranscript = await vscode.commands.executeCommand<{ title: string; placeholder: string; items: string[] }[]>(
    'markdownMatrixInjector.__test.runAuthoringScripted',
    {
      line: 1,
      character: 5,
      answers: Array.from({ length: 8 }, () => ({ keep: true })),
    },
  );
  const rangeStep = rootRelativeTranscript.find((step) => /\(3\/5\)/u.test(step.title));
  const confirmStep = rootRelativeTranscript.at(-1);
  note('multi-root-root-relative-authoring', {
    embed: rootRelativeEmbed,
    rangeItems: rangeStep?.items,
    confirm: confirmStep?.placeholder,
  });
  expect(
    Boolean(rangeStep?.items.includes('A1:B3')),
    `workspace-root-relative guided authoring did not load roles.csv ranges: ${JSON.stringify(rootRelativeTranscript)}`,
  );
  expect(
    Boolean(confirmStep && /\(5\/5\)/u.test(confirmStep.title)),
    `workspace-root-relative guided authoring did not reach confirm: ${JSON.stringify(rootRelativeTranscript.map((step) => step.title))}`,
  );
  expect(
    rootRelativeOpened.document.lineAt(1).text === rootRelativeEmbed,
    `workspace-root-relative guided round trip changed the embed: ${rootRelativeOpened.document.lineAt(1).text}`,
  );
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  fs.rmSync(rootRelativeDoc, { force: true });

  // Search: each folder's index only returns its own books.
  for (const [root, doc, query] of [
    [samples, path.join(samples, 'zz-search.md'), '状態遷移'],
    [fixtures, path.join(fixtures, 'docs', 'zz-search.md'), 'release-gate'],
  ] as const) {
    fs.writeFileSync(doc, '# search\n\n');
    const opened = await open(doc);
    opened.editor.selection = new vscode.Selection(2, 0, 2, 0);
    const found = await vscode.commands.executeCommand<{ items: string[]; transcript: unknown[] }>(
      'markdownMatrixInjector.__test.findAndAuthorScripted',
      { query, pick: 0, answers: ['insert'] },
    );
    const inserted = opened.document.lineAt(2).text;
    note('search', { folder: path.basename(root), query, items: found.items.slice(0, 3), inserted });
    const target = /!\[\[([^#|?\]]+)/u.exec(inserted)?.[1];
    expect(Boolean(target), `search "${query}" inserted nothing: ${found.items.join(' / ')}`);
    if (target) expect(inside(root, path.dirname(doc), target), `search in ${path.basename(root)} returned ${target} from another folder`);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    fs.rmSync(doc, { force: true });
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  fs.rmSync(file, { force: true });
}

export async function run(): Promise<void> {
  const samples = process.env.MMI_PRACTICAL_SAMPLES!;
  const fixtures = process.env.MMI_PRACTICAL_FIXTURES!;
  note('host', { vscode: vscode.version, folders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) });
  // Hidden test commands are not in the manifest, so calling them does not activate the extension.
  const extension = vscode.extensions.getExtension('hat47x.markdown-matrix-injector');
  try {
    await extension?.activate();
  } catch (error) {
    problems.push(`activation failed: ${error instanceof Error ? error.stack : String(error)}`);
  }
  note('activation', { active: extension?.isActive ?? false });
  const stages: [string, () => Promise<void>][] = [
    ['sample-documents', () => checkSampleDocuments(samples)],
    ['completion-by-file-type', () => checkCompletionByFileType(samples)],
    ['multi-root', () => checkMultiRoot(samples, fixtures)],
  ];
  for (const [name, stage] of stages) {
    try {
      await stage();
      note('stage', { name, ok: true });
    } catch (error) {
      problems.push(`${name} threw: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
  note('summary', { problems: problems.length });
  if (problems.length > 0) {
    for (const problem of problems) console.log(`${LOG} PROBLEM ${problem}`);
    throw new Error(`${problems.length} problem(s)`);
  }
}
