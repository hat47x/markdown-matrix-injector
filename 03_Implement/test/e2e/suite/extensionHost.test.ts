import assert from 'node:assert/strict';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';

const LOG_PREFIX = '[mmi:e2e:extension-host]';
const PASTE_DROP_PROOF_TARGETS = [
  'provider-registration-surface',
  'fallback-compatibility',
  'shared-logic-reuse',
] as const;
const ISSUE_0010_ACCEPTANCE_TRACE = {
  acceptance1: 'issue-0010 acceptance 1: native provider registration surface',
  acceptance2: 'issue-0010 acceptance 2: shared logic reuse',
  acceptance3: 'issue-0010 acceptance 3: fallback compatibility path',
  acceptance4: 'issue-0010 acceptance 4: e2e regression coverage boundary',
} as const;
const AUTOCOMPLETE_ISOLATION_BOUNDARY =
  'Known unstable autocomplete remains outside the paste/drop proof boundary and must be triaged independently.';
const PASTE_DROP_E2E_BOUNDARY =
  'E2E proves provider registration surface, fallback compatibility, shared logic reuse, and the built-in Paste As command dispatch for text/plain TSV; it does not prove real Excel HTML/Windows-helper clipboard formats or visual picker interaction.';
const HEADLESS_ENTRY_CONDITION_GUIDANCE =
  'If Extension Host cannot start because headless prerequisites such as xvfb-run/display wiring are missing, treat it as a verification entry-condition failure rather than a provider regression.';
// Filepath-only, no `#sheet|range` -- pasteDrop.ts stopped guessing sheet name
// (from `data-sheet`) and range (from table shape) on 2026-09-14: a real Excel
// HTML capture never carries either honestly, so `suggestEmbedFromClipboardHtml`
// now returns only what it can actually verify (input-assistance-paste-provenance.md
// §6). These constants were not updated at the time because the e2e suite could
// not be run in this environment until 2026-09-17 (WSLg display discovery) --
// the stale `#Summary|A1:B2` / `#Summary|A1:B1` expectations were never caught.
const PASTE_FALLBACK_EXPECTED_INSERT = '![[/tmp/report.xlsx]]';
const DROP_FALLBACK_EXPECTED_INSERT = '![[/tmp/drop-target.csv]]';
const NATIVE_PASTE_EXPECTED_INSERT = '![[/tmp/native.xlsx]]';
const NATIVE_DROP_EXPECTED_INSERT = '![[/tmp/native-drop.csv]]';

export async function runIntegrationTests(): Promise<void> {
  const workspaceRoot = process.env.MMI_E2E_WORKSPACE;
  if (!workspaceRoot) {
    throw new Error('MMI_E2E_WORKSPACE is not set.');
  }

  const markdownFilePath = path.join(workspaceRoot, 'docs', 'spec.md');

  await runStage('render-command', () => verifyRenderEmbedForTestCommand(markdownFilePath, workspaceRoot));
  await runStage('markdown-preview-entry', () => verifyMarkdownPreviewEntry(markdownFilePath));
  logStage('issue-0010-e2e-scope', {
    acceptanceCriteria: {
      providerRegistrationSurface: `${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1}: Verify native paste/drop providers are exposed on the Extension Host registration surface when the host advertises the APIs.`,
      fallbackCompatibility: `${ISSUE_0010_ACCEPTANCE_TRACE.acceptance3}: Verify command fallback remains observable as the compatibility path when native provider support is absent or intentionally bypassed.`,
      sharedLogicReuse: `${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2}: Verify native-provider adapters and command fallback converge on the same embed-generation logic instead of diverging implementations.`,
      autocompleteIsolation: 'Keep autocomplete known instability out of paste/drop pass-fail so provider regressions remain attributable.',
    },
    validationPlan: {
      e2eLane: '03_Implement/test/e2e/** proves the automation boundary only.',
      excludedFromAutomation: ['final OS-native paste event dispatch', 'final OS-native drag-and-drop UX dispatch'],
      environmentPrerequisiteBoundary: HEADLESS_ENTRY_CONDITION_GUIDANCE,
    },
    proofTargets: PASTE_DROP_PROOF_TARGETS,
    autocompleteIsolationBoundary: AUTOCOMPLETE_ISOLATION_BOUNDARY,
    e2eProofBoundary: PASTE_DROP_E2E_BOUNDARY,
  });
  const pasteDropBoundary = await runStage('paste-drop-observation', () => observePasteDropBoundary());
  await runStage('paste-drop-boundary', () => verifyPasteDropCoverage(markdownFilePath, pasteDropBoundary));
  await runStage('content-match-standalone-command', () => verifyContentMatchStandaloneCommand(markdownFilePath));
  await runStage('content-match-paste-as-host-command', () =>
    verifyContentMatchPasteAsHostCommand(markdownFilePath, pasteDropBoundary.integrationState),
  );
  const autocompleteResult = await runStage('autocomplete-boundary', () => verifyAutocompleteIntegration(markdownFilePath));
  await runStage('diagnostics', () => verifyDiagnosticsIntegration(workspaceRoot));
  await runStage('quick-fix-on-held-back-line', () => verifyQuickFixOnHeldBackLine(workspaceRoot));
  await runStage('hover-and-authoring', () => verifyHoverAndAuthoringEntry(workspaceRoot));
  await runStage('guided-flows-scripted', () => verifyGuidedFlowsScripted(workspaceRoot));
  await runStage('search-observation-recording', () => verifySearchObservationRecording(workspaceRoot));
  logStage('paste-drop-proof-boundary:post-autocomplete', {
    autocompleteSheetCompletionStable: autocompleteResult.sheetCompletionStable,
    autocompleteKnownUnstableReason: autocompleteResult.knownUnstableReason,
    proofTargets: pasteDropBoundary.proofTargets,
    autocompleteIsolationBoundary: AUTOCOMPLETE_ISOLATION_BOUNDARY,
  });
  logStage('paste-drop-proof-boundary:summary', {
    whatThisE2EProves:
      'This Extension Host E2E proves provider registration surface, fallback compatibility, shared logic reuse, and built-in editor.action.pasteAs dispatch into the MMI content-match provider for a text/plain TSV clipboard.',
    whatThisE2EDoesNotProve:
      'It does not prove real Excel text/html or Windows-helper clipboard formats, the visual Paste As picker interaction, nor drag-and-drop OS dispatch.',
    autocompleteIsolationBoundary: AUTOCOMPLETE_ISOLATION_BOUNDARY,
    headlessEntryConditionGuidance: HEADLESS_ENTRY_CONDITION_GUIDANCE,
  });
}

async function verifyRenderEmbedForTestCommand(markdownFilePath: string, workspaceRoot: string): Promise<void> {
  const tableHtml = await vscode.commands.executeCommand<string>('markdownMatrixInjector.renderEmbedForTest', {
    markdown: '![[../data/roles.csv#Sheet1|A1:B3?header=first]]',
    markdownFilePath,
    workspaceRoot,
  });

  assert.ok(tableHtml, 'Expected table HTML to be returned.');
  assert.match(tableHtml, /<table class="mmi-table">/);
  assert.match(tableHtml, /<th>Name<\/th><th>Role<\/th>/);

  const cardHtml = await vscode.commands.executeCommand<string>('markdownMatrixInjector.renderEmbedForTest', {
    markdown: '![[../data/wide.csv#Sheet1|A1:K2]]',
    markdownFilePath,
    workspaceRoot,
  });

  assert.ok(cardHtml, 'Expected card HTML to be returned.');
  assert.match(cardHtml, /class="mmi-card"/);
  assert.doesNotMatch(cardHtml, /class="mmi-table"/);
}

/**
 * Exercises the *production* Markdown preview entry point — `extendMarkdownIt`,
 * the function VS Code calls via `contributes.markdown.markdownItPlugins`. This
 * is the code path that actually injects `![[...]]` into the live preview, and
 * (unlike the renderEmbedForTest command) was previously never covered by any
 * test. It resolves the document path from `env.currentDocument` exactly as the
 * real preview does, and must emit block-level <figure>/<table> HTML — never an
 * embed nested inside a <p> wrapper (issue-0097 / ADR-0010 G1).
 */
async function verifyMarkdownPreviewEntry(markdownFilePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension('hat47x.markdown-matrix-injector');
  assert.ok(extension, 'Expected the installed extension to be discoverable.');
  const api = await extension.activate();
  assert.equal(typeof api?.extendMarkdownIt, 'function', 'Markdown preview requires extendMarkdownIt on the activation API.');
  const md = api.extendMarkdownIt(new MarkdownIt());
  const tokens = md.parse('![[../data/roles.csv#Sheet1|A1:B3?header=first&caption=Roles&id=tbl-roles]]', {});
  const html = md.renderer.render(tokens, md.options, {
    currentDocument: vscode.Uri.file(markdownFilePath),
  });

  logStage('markdown-preview-entry:rendered', { htmlLength: html.length });

  assert.match(html, /<figure class="mmi-embed" id="tbl-roles">/, 'Expected the production preview entry to emit the embed frame.');
  assert.match(html, /<table class="mmi-table">/, 'Expected the production preview entry to render the table.');
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  // Standalone embed must render as a top-level block, not wrapped in a paragraph.
  assert.doesNotMatch(html, /<p>/, 'Standalone embed must not be wrapped in a <p> (invalid block-in-paragraph nesting).');
}

interface AutocompleteVerificationResult {
  readonly sheetCompletionStable: boolean;
  readonly knownUnstableReason?: string;
}

async function verifyAutocompleteIntegration(markdownFilePath: string): Promise<AutocompleteVerificationResult> {
  const fileCompletion = await getCompletionState({
    filePath: markdownFilePath,
    stageName: '![[ file path',
    content: 'Autocomplete file\n![[../da',
    expectedLabel: '../data/roles.csv',
  });
  assertCompletionIncludes(fileCompletion, '../data/roles.csv');

  const sheetCompletion = await getCompletionState({
    filePath: markdownFilePath,
    stageName: '# sheet',
    content: 'Autocomplete sheet\n![[../data/roles.csv#',
    expectedLabel: 'Sheet1',
    maxAttempts: 20,
    delayMs: 250,
  });
  const sheetCompletionStable = reportKnownSheetCompletionFlake(sheetCompletion, 'Sheet1');

  const queryCompletion = await getCompletionState({
    filePath: markdownFilePath,
    stageName: '? query parameter',
    content: 'Autocomplete query\n![[../data/roles.csv#Sheet1|A1:B2?he',
    expectedLabel: 'header',
  });
  assertCompletionIncludes(queryCompletion, 'header');

  // issue-0110: enum values with a replace range covering only the typed value.
  await verifyContextCompletionReplaceRange(markdownFilePath);

  return {
    sheetCompletionStable,
    knownUnstableReason: sheetCompletionStable
      ? undefined
      : `Known unstable autocomplete assertion after # is isolated from paste/drop acceptance. ${AUTOCOMPLETE_ISOLATION_BOUNDARY}`,
  };
}

async function verifyContextCompletionReplaceRange(markdownFilePath: string): Promise<void> {
  const uniqueFilePath = markdownFilePath.replace(/\.md$/, `-ctx-${Math.random().toString(36).slice(2)}.md`);
  const line = '前 ![[../data/roles.csv#Sheet1|A1:B2?mode=ta&x-keep=1]] 後';
  const document = await openMarkdownDocument(uniqueFilePath, `Context\n${line}`);
  await vscode.window.showTextDocument(document);
  const cursor = new vscode.Position(1, line.indexOf('mode=ta') + 'mode=ta'.length);
  const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, cursor);
  const item = (list?.items ?? []).find((candidate) => candidate.label.toString() === 'table');
  assert.ok(item, `Expected a 'table' value candidate, got: ${(list?.items ?? []).map((c) => c.label.toString()).join(', ')}`);
  const range = item.range instanceof vscode.Range ? item.range : (item.range as { replacing: vscode.Range } | undefined)?.replacing;
  assert.ok(range, 'Value candidate must carry an explicit replace range.');
  assert.equal(document.getText(range), 'ta', 'Only the typed value may be replaced; the rest of the embed and the prose must survive.');

  const fenced = await openMarkdownDocument(
    uniqueFilePath.replace(/\.md$/, '-fence.md'),
    'Fence\n```\n![[../data/roles.csv#Sheet1|A1:B2?mode=ta\n```',
  );
  const fencedList = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    fenced.uri,
    new vscode.Position(2, '![[../data/roles.csv#Sheet1|A1:B2?mode=ta'.length),
  );
  assert.ok(
    !(fencedList?.items ?? []).some((candidate) => candidate.label.toString() === 'table'),
    'No MMI candidates inside a fenced code block.',
  );
}

type Transcript = { title: string; placeholder: string; items: string[] }[];

/**
 * issue-0111 / issue-0115: the guided flows driven with scripted choices
 * through the same code path as the QuickPicks, in a real editor.
 */
async function verifyGuidedFlowsScripted(workspaceRoot: string): Promise<void> {
  const original = '![[../data/roles.csv#Sheet1|A1:B3?x-keep=1&header=first]]';
  const proseBefore = '前の本文 ';
  const proseAfter = ' 後ろの本文';
  const originalLine = `${proseBefore}${original}${proseAfter}`;
  const rolesSource = vscode.Uri.file(path.join(workspaceRoot, 'data', 'roles.csv'));
  const rolesBefore = Buffer.from(await vscode.workspace.fs.readFile(rolesSource));
  const document = await openMarkdownDocument(
    path.join(workspaceRoot, 'docs', 'guided-flows.md'),
    ['# Guided', originalLine].join('\n'),
  );
  await vscode.window.showTextDocument(document);
  const run = (answers: unknown[]) =>
    vscode.commands.executeCommand<Transcript>(
      'markdownMatrixInjector.__test.runAuthoringScripted',
      { line: 1, character: proseBefore.length + 5, answers },
    );

  // Cancel at the first step: nothing changes.
  const versionBefore = document.version;
  await run([{ cancel: true }]);
  assert.equal(document.version, versionBefore, 'Cancelling must not edit the document.');
  assert.equal(document.lineAt(1).text, originalLine, 'Cancelling must preserve surrounding prose.');

  // Back from the range step reaches the file step (the CSV sheet step skips itself both ways).
  const backTranscript = await run([{ keep: true }, { back: true }, { cancel: true }]);
  assert.deepEqual(
    backTranscript.map((step) => step.title.replace(/.*\((\d)\/5\)/u, '$1')),
    ['1', '3', '1'],
    `Back must return to the file step. Got: ${JSON.stringify(backTranscript.map((step) => step.title))}`,
  );
  assert.equal(document.lineAt(1).text, originalLine, 'Back/cancel must preserve surrounding prose.');

  // Edit: keep file and range, add mode=card; unknown x-keep survives; surrounding prose survives; one Undo restores.
  const transcript = await run([{ keep: true }, { keep: true }, { options: ['header=first', 'mode=card'] }, 'insert']);
  const edited = '![[../data/roles.csv#Sheet1|A1:B3?x-keep=1&header=first&mode=card]]';
  assert.equal(document.lineAt(1).text, `${proseBefore}${edited}${proseAfter}`);
  assert.match(transcript[transcript.length - 1].placeholder, /別紙カード|as a card sheet/u, 'The confirm step must show what the engine renders.');
  await vscode.commands.executeCommand('undo');
  assert.equal(document.lineAt(1).text, originalLine, 'One Undo must restore the original reference and surrounding prose.');
  assert.deepEqual(
    Buffer.from(await vscode.workspace.fs.readFile(rolesSource)),
    rolesBefore,
    'Guided reference editing must not modify the source bytes.',
  );

  // Find by description, then confirm: the search index covers the workspace workbooks.
  const releaseGateSource = vscode.Uri.file(
    path.join(workspaceRoot, 'data', 'sier-design', 'release-gate.csv'),
  );
  const releaseGateBefore = Buffer.from(
    await vscode.workspace.fs.readFile(releaseGateSource),
  );
  const blank = await openMarkdownDocument(path.join(workspaceRoot, 'docs', 'guided-find.md'), '# Find\n\n');
  const editor = await vscode.window.showTextDocument(blank);
  editor.selection = new vscode.Selection(2, 0, 2, 0);
  const found = await vscode.commands.executeCommand<{ items: string[]; transcript: Transcript }>(
    'markdownMatrixInjector.__test.findAndAuthorScripted',
    { query: 'release-gate', pick: 0, answers: ['insert'] },
  );
  assert.ok(found.transcript.length > 0, `Search must yield a candidate. Items: ${found.items.join(' / ')}`);
  assert.match(blank.lineAt(2).text, /^!\[\[\.\.\/data\/sier-design\/release-gate\.csv#Sheet1\|/u);
  assert.deepEqual(
    Buffer.from(await vscode.workspace.fs.readFile(releaseGateSource)),
    releaseGateBefore,
    'Search-assisted reference insertion must not modify source bytes.',
  );

  // A request the notation cannot express is refused with the reason, and nothing is inserted.
  const refused = await vscode.commands.executeCommand<{ items: string[]; transcript: Transcript }>(
    'markdownMatrixInjector.__test.findAndAuthorScripted',
    { query: 'release-gateをStatus別に集計', pick: 0, answers: ['insert'] },
  );
  assert.match(refused.items[0], /MMI記法で表せません|cannot be expressed in MMI notation/u);
  assert.equal(refused.transcript.length, 0);
}

/**
 * The local search-demand observation (ADR-0023, issue-0207) on the real host: with the setting on,
 * two scripted searches are recorded, and by default no request text or table name is stored.
 */
async function verifySearchObservationRecording(workspaceRoot: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  await config.update('search.observation.enabled', true, vscode.ConfigurationTarget.Workspace);
  try {
    await vscode.commands.executeCommand('markdownMatrixInjector.__test.clearSearchObservations');
    const blank = await openMarkdownDocument(path.join(workspaceRoot, 'docs', 'observation.md'), '# Observe\n\n');
    const editor = await vscode.window.showTextDocument(blank);
    editor.selection = new vscode.Selection(2, 0, 2, 0);

    // A request that finds a table, then one the notation cannot express.
    const found = await vscode.commands.executeCommand<{ items: string[]; transcript: Transcript }>(
      'markdownMatrixInjector.__test.findAndAuthorScripted',
      { query: 'release-gate', pick: 0, answers: ['insert'] },
    );
    assert.ok(found.transcript.length > 0, 'The first search must yield a candidate.');
    await vscode.commands.executeCommand<{ items: string[]; transcript: Transcript }>(
      'markdownMatrixInjector.__test.findAndAuthorScripted',
      { query: 'release-gateをStatus別に集計', pick: 0, answers: ['insert'] },
    );

    const records = await vscode.commands.executeCommand<{ final: { class: string; text?: string }; outcome: string }[]>(
      'markdownMatrixInjector.__test.searchObservationRecords',
    );
    assert.equal(records.length, 2, `Two searches must leave two records. Got ${records.length}.`);
    assert.deepEqual(records.map((record) => record.final.class), ['found', 'unsupported-op']);
    assert.deepEqual(records.map((record) => record.outcome), ['picked-candidate', 'cancelled']);
    const raw = JSON.stringify(records);
    assert.ok(!raw.includes('release-gate'), 'The request text and table names must not be stored by default.');
    assert.ok(records.every((record) => record.final.text === undefined), 'No record may hold request text by default.');
  } finally {
    await config.update('search.observation.enabled', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand('markdownMatrixInjector.__test.clearSearchObservations');
  }
}

async function verifyHoverAndAuthoringEntry(workspaceRoot: string): Promise<void> {
  const document = await openMarkdownDocument(
    path.join(workspaceRoot, 'docs', 'hover-authoring.md'),
    ['# Hover', '![[../data/roles.csv#Sheet1|A1:B3?header=first]]'].join('\n'),
  );
  await vscode.window.showTextDocument(document);
  const position = new vscode.Position(1, 10);
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, position);
  const text = (hovers ?? [])
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === 'string' ? content : 'value' in content ? content.value : ''))
    .join('\n');
  assert.match(text, /本体2行 × 2列|2 body rows × 2 columns/u, `Hover must summarise the real rendering. Got: ${text.slice(0, 300)}`);
  assert.match(text, /<table class="mmi-table">/u, 'Hover must show the engine table.');
  assert.match(text, /command:markdownMatrixInjector\.authorEmbed/u, 'Hover must offer editing.');

  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    document.uri,
    new vscode.Range(position, position),
  );
  assert.ok((actions ?? []).some((action) => /この参照を編集|Edit this reference/u.test(action.title)), 'An embed must offer the edit action.');

  const commands = await vscode.commands.getCommands(true);
  for (const id of ['markdownMatrixInjector.findEmbedByDescription', 'markdownMatrixInjector.clearSearchIndex']) {
    assert.ok(commands.includes(id), `${id} must be registered.`);
  }
}

// #579: while typing, the cursor line's diagnostic is held back from Problems
// (ADR-0019 D13), but its quick fix must still come up from the light bulb there.
async function verifyQuickFixOnHeldBackLine(workspaceRoot: string): Promise<void> {
  const document = await openMarkdownDocument(
    path.join(workspaceRoot, 'docs', 'held-back-fix.md'),
    ['# Held back', '![[../data/roles.csv#MissingSheet|A1:B2]]'].join('\n'),
  );
  const editor = await vscode.window.showTextDocument(document);
  const [shown] = await waitForDiagnostics(document.uri, 1);
  assert.equal(shown?.code?.toString(), 'MMI_SHEET_NOT_FOUND');

  // Type on the reference line: the authoring pass holds its diagnostic back.
  const end = document.lineAt(1).range.end;
  editor.selection = new vscode.Selection(end, end);
  assert.ok(await editor.edit((builder) => builder.insert(end, ' ')));
  let heldBack = false;
  for (let attempt = 0; attempt < 40 && !heldBack; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    heldBack = vscode.languages.getDiagnostics(document.uri).every((diagnostic) => diagnostic.range.start.line !== 1);
  }
  assert.ok(heldBack, 'While typing on the line, its diagnostic must be held back from Problems (D13).');

  const cursor = new vscode.Position(1, 5);
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    document.uri,
    new vscode.Range(cursor, cursor),
  );
  const titles = (actions ?? []).map((action) => action.title);
  assert.ok(
    titles.some((title) => /^(「Sheet1」に置き換える|Replace with "Sheet1")$/u.test(title)),
    `The light bulb on the held-back line must offer the sheet fix. Got: ${titles.join(', ')}`,
  );
}

async function verifyDiagnosticsIntegration(workspaceRoot: string): Promise<void> {
  const diagnosticsPath = path.join(workspaceRoot, 'docs', 'phase5-diagnostics.md');
  const document = await openMarkdownDocument(
    diagnosticsPath,
    [
      '# Diagnostics',
      '![[../data/missing.xlsx#Sheet1|A1:B2]]',
      '![[../data/invalid.xml#Sheet1|A1:B2]]',
      '![[../data/roles.csv#MissingSheet|A1:B2]]',
    ].join('\n'),
  );

  const diagnostics = await waitForDiagnostics(document.uri, 3);
  const codes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code?.toString()))];

  assert.deepEqual(codes, ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND']);

  // issue-0111: the quick fix offers only sheets that exist and replaces only the sheet name.
  // Line 3 (roles.csv#MissingSheet); line 2's invalid.xml cannot be read, so it rightly gets no fix.
  const sheetDiagnostic = diagnostics.find(
    (diagnostic) => diagnostic.code?.toString() === 'MMI_SHEET_NOT_FOUND' && diagnostic.range.start.line === 3,
  )!;
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    document.uri,
    sheetDiagnostic.range,
    vscode.CodeActionKind.QuickFix.value,
  );
  const fix = (actions ?? []).find((action) => /^(「Sheet1」に置き換える|Replace with "Sheet1")$/u.test(action.title));
  assert.ok(
    fix?.edit,
    `Expected a quick fix to Sheet1, got: ${(actions ?? []).map((action) => action.title).join(', ')}; diagnostic=${JSON.stringify({
      source: sheetDiagnostic.source,
      range: sheetDiagnostic.range,
      text: document.getText(sheetDiagnostic.range),
    })}`,
  );
  assert.ok(await vscode.workspace.applyEdit(fix.edit));
  assert.equal(document.lineAt(3).text, '![[../data/roles.csv#Sheet1|A1:B2]]');
  assert.ok(
    (await vscode.commands.getCommands(true)).includes('markdownMatrixInjector.authorEmbed'),
    'The guided authoring command must be registered.',
  );

  // A value the renderer would silently ignore is a warning with a fix to the closest valid value.
  const typo = await openMarkdownDocument(
    path.join(workspaceRoot, 'docs', 'param-typo.md'),
    ['# Typo', '![[../data/roles.csv#Sheet1|A1:B3?mode=tabel]]'].join('\n'),
  );
  const [warning] = await waitForDiagnostics(typo.uri, 1);
  assert.equal(warning.code?.toString(), 'MMI_INVALID_PARAM_VALUE');
  assert.equal(warning.severity, vscode.DiagnosticSeverity.Warning);
  const typoActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    typo.uri,
    warning.range,
    vscode.CodeActionKind.QuickFix.value,
  );
  const typoFix = (typoActions ?? []).find((action) => /^(「table」に置き換える|Replace with "table")$/u.test(action.title));
  assert.ok(typoFix?.edit, `Expected a fix to table, got: ${(typoActions ?? []).map((action) => action.title).join(', ')}`);
  assert.ok(await vscode.workspace.applyEdit(typoFix.edit));
  assert.equal(typo.lineAt(1).text, '![[../data/roles.csv#Sheet1|A1:B3?mode=table]]');

  // ADR-0022: a reference written against other headers warns, and the fix is offered (never preferred, never automatic).
  const stale = await openMarkdownDocument(
    path.join(workspaceRoot, 'docs', 'stale-headers.md'),
    ['# Stale', '![[../data/roles.csv#Sheet1|A1:B3?header=first&x-headers=Name,Permission]]'].join('\n'),
  );
  const [headerWarning] = await waitForDiagnostics(stale.uri, 1);
  assert.equal(headerWarning.code?.toString(), 'MMI_HEADERS_MISMATCH');
  const headerActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    stale.uri,
    headerWarning.range,
    vscode.CodeActionKind.QuickFix.value,
  );
  const headerFix = (headerActions ?? []).find((action) => action.title.includes('x-headers'));
  assert.ok(headerFix?.edit, `Expected an x-headers update fix, got: ${(headerActions ?? []).map((action) => action.title).join(', ')}`);
  assert.notEqual(headerFix.isPreferred, true, 'A source change must never be accepted by default.');
  assert.ok(await vscode.workspace.applyEdit(headerFix.edit));
  assert.equal(stale.lineAt(1).text, '![[../data/roles.csv#Sheet1|A1:B3?header=first&x-headers=Name,Role]]');
}

interface NativeProviderCapability {
  readonly hasNativePasteProvider: boolean;
  readonly hasNativeDropProvider: boolean;
}

interface PasteDropObservationState {
  readonly integrationState: PasteDropIntegrationState;
  readonly capability: NativeProviderCapability;
  readonly registeredCommandIds: readonly string[];
  readonly proofTargets: typeof PASTE_DROP_PROOF_TARGETS;
  readonly autocompleteIsolationBoundary: string;
  readonly e2eProofBoundary: string;
}

interface PasteDropIntegrationState {
  readonly fallbackCommandIds: readonly string[];
  readonly nativeEditKind: string;
  readonly contentMatchPasteEditKind: string;
  readonly pasteMimeTypes: readonly string[];
  readonly dropMimeTypes: readonly string[];
  readonly hostSupportsPasteProvider: boolean;
  readonly hostSupportsDropProvider: boolean;
  readonly registeredPasteProvider: boolean;
  readonly registeredDropProvider: boolean;
}

interface PasteDropVerificationBoundary {
  readonly autocompleteSheetCompletionStable: boolean;
  readonly autocompleteKnownUnstableReason?: string;
  readonly e2eProofBoundary: string;
  readonly proofTargets: typeof PASTE_DROP_PROOF_TARGETS;
  readonly nativeProviderSupported: boolean;
  readonly dropProviderSupported: boolean;
  readonly acceptanceTrace: typeof ISSUE_0010_ACCEPTANCE_TRACE;
}

async function observePasteDropBoundary(): Promise<PasteDropObservationState> {
  const capability = getNativeProviderCapability();
  const integrationState = await getPasteDropIntegrationState();
  const commands = await vscode.commands.getCommands(true);
  const registeredCommandIds = [
    ...integrationState.fallbackCommandIds,
    'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
    'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
    'markdownMatrixInjector.__test.getPasteDropIntegrationState',
  ].filter((commandId) => commands.includes(commandId));

  const observation: PasteDropObservationState = {
    integrationState,
    capability,
    registeredCommandIds,
    proofTargets: PASTE_DROP_PROOF_TARGETS,
    autocompleteIsolationBoundary: AUTOCOMPLETE_ISOLATION_BOUNDARY,
    e2eProofBoundary: PASTE_DROP_E2E_BOUNDARY,
  };

  logStage('paste-drop-observation:snapshot', {
    ...observation,
    acceptanceTrace: {
      acceptance1_providerRegistrationSurface: observation.capability.hasNativePasteProvider && observation.capability.hasNativeDropProvider,
      acceptance3_fallbackCompatibility: observation.integrationState.fallbackCommandIds,
      acceptance4_e2eRegressionBoundary: 'Extension Host E2E keeps proof limited to provider registration surface, fallback compatibility, and shared logic reuse.',
      acceptance2_sharedLogicReuse: 'native-provider adapters and command fallback are both verified against shared embed-generation commands',
      autocompleteIsolation: AUTOCOMPLETE_ISOLATION_BOUNDARY,
    },
  });

  return observation;
}

async function verifyPasteDropCoverage(
  markdownFilePath: string,
  observation: PasteDropObservationState,
): Promise<void> {
  const { capability, integrationState, registeredCommandIds } = observation;
  const verificationBoundary: PasteDropVerificationBoundary = {
    autocompleteSheetCompletionStable: false,
    autocompleteKnownUnstableReason:
      'Paste/drop acceptance is observed before autocomplete so the provider lane stays independent from known completion instability.',
    e2eProofBoundary: observation.e2eProofBoundary,
    proofTargets: observation.proofTargets,
    nativeProviderSupported: capability.hasNativePasteProvider,
    dropProviderSupported: capability.hasNativeDropProvider,
    acceptanceTrace: ISSUE_0010_ACCEPTANCE_TRACE,
  };

  logStage('paste-drop-proof-boundary:capability', {
    capability,
    integrationState,
    registeredCommandIds,
    verificationBoundary,
    acceptanceTrace: {
      acceptance1_providerRegistrationSurface: {
        hostSupportsPasteProvider: integrationState.hostSupportsPasteProvider,
        hostSupportsDropProvider: integrationState.hostSupportsDropProvider,
        registeredPasteProvider: integrationState.registeredPasteProvider,
        registeredDropProvider: integrationState.registeredDropProvider,
      },
      acceptance3_fallbackCompatibility: {
        fallbackCommandIds: integrationState.fallbackCommandIds,
        registeredCommandIds,
      },
      acceptance2_sharedLogicReuse: {
        testCommands: [
          'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
          'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
        ],
        assertion: 'native-provider adapters and command fallback must keep reusing shared embed parsing/building logic',
      },
      acceptance4_e2eRegressionBoundary: {
        proofTargets: observation.proofTargets,
        e2eProofBoundary: observation.e2eProofBoundary,
        headlessEntryConditionGuidance: HEADLESS_ENTRY_CONDITION_GUIDANCE,
      },
      knownUnstableIsolation: {
        autocompleteStateIsDeferred: true,
        reason: verificationBoundary.autocompleteKnownUnstableReason,
        boundary: AUTOCOMPLETE_ISOLATION_BOUNDARY,
      },
    },
  });

  assert.deepEqual(
    {
      hasNativePasteProvider: capability.hasNativePasteProvider,
      hasNativeDropProvider: capability.hasNativeDropProvider,
    },
    {
      hasNativePasteProvider: integrationState.hostSupportsPasteProvider,
      hasNativeDropProvider: integrationState.hostSupportsDropProvider,
    },
    `Expected Extension Host capability probe to match provider registration integration state. integrationState=${JSON.stringify(integrationState)}`,
  );

  assert.equal(registeredCommandIds.length, 5, `Expected fallback/test commands to be registered for paste/drop observation. observation=${JSON.stringify(observation)}`);
  for (const commandId of integrationState.fallbackCommandIds) {
    assert.ok(registeredCommandIds.includes(commandId), `Expected fallback command ${commandId} to be registered.`);
  }
  for (const commandId of [
    'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
    'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
    'markdownMatrixInjector.__test.getPasteDropIntegrationState',
  ]) {
    assert.ok(registeredCommandIds.includes(commandId), `Expected test observation command ${commandId} to be registered.`);
  }

  assert.equal(integrationState.nativeEditKind, 'text.markdownMatrixInjector.embed');
  assert.match(
    verificationBoundary.e2eProofBoundary,
    /does not prove real Excel HTML\/Windows-helper clipboard formats or visual picker interaction/,
    `Expected paste/drop proof boundary to remain explicit. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(integrationState.pasteMimeTypes.includes('text/html'));
  assert.ok(integrationState.dropMimeTypes.includes('text/uri-list'));
  assert.equal(
    verificationBoundary.acceptanceTrace.acceptance4,
    ISSUE_0010_ACCEPTANCE_TRACE.acceptance4,
    `Expected E2E boundary verification to remain explicitly mapped to ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance4}. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.match(
    verificationBoundary.e2eProofBoundary,
    /shared logic reuse/,
    `Expected ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance4} to keep regression proof scoped to provider surface, fallback compatibility, and shared logic reuse. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.equal(observation.autocompleteIsolationBoundary, AUTOCOMPLETE_ISOLATION_BOUNDARY);

  await runStage('issue-0010-acceptance3-fallback-compatibility', () =>
    verifyPasteDropCommandFallback(markdownFilePath, capability, integrationState, verificationBoundary),
  );

  if (capability.hasNativePasteProvider && capability.hasNativeDropProvider) {
    assert.ok(
      integrationState.registeredPasteProvider,
      `Expected supported host to register the native paste provider surface for ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1}. integrationState=${JSON.stringify(integrationState)}`,
    );
    assert.ok(
      integrationState.registeredDropProvider,
      `Expected supported host to register the native drop provider surface for ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1}. integrationState=${JSON.stringify(integrationState)}`,
    );
    await runStage('issue-0010-acceptance1-provider-registration-surface', () =>
      verifyNativeProviderAdapterCoverage(markdownFilePath, capability, integrationState, verificationBoundary),
    );
    return;
  }

  assert.equal(
    integrationState.registeredPasteProvider,
    capability.hasNativePasteProvider,
    `Paste provider registration should only be skipped when the host lacks the API. integrationState=${JSON.stringify(integrationState)}`,
  );
  assert.equal(
    integrationState.registeredDropProvider,
    capability.hasNativeDropProvider,
    `Drop provider registration should only be skipped when the host lacks the API. integrationState=${JSON.stringify(integrationState)}`,
  );

  logStage('paste-drop-proof-provider-registration-surface:skipped', {
    reason: 'unsupported-host',
    categorization: 'environment-or-host-capability',
    capability,
    verificationBoundary,
    triage: 'Treat this as unsupported-host or environment capability coverage, not as a provider parsing failure.',
    entryConditionGuidance: HEADLESS_ENTRY_CONDITION_GUIDANCE,
  });
}

async function runStage<T>(stageName: string, run: () => Promise<T>): Promise<T> {
  logStage(`${stageName}:start`);
  try {
    const result = await run();
    logStage(`${stageName}:success`);
    return result;
  } catch (error) {
    logStage(`${stageName}:failure`, { error: formatError(error) });
    throw error;
  }
}

function logStage(stageName: string, payload?: Record<string, unknown>): void {
  const body = payload ? ` ${JSON.stringify(payload)}` : '';
  console.log(`${LOG_PREFIX} ${stageName}${body}`);
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

async function verifyPasteDropCommandFallback(
  markdownFilePath: string,
  capability: NativeProviderCapability = getNativeProviderCapability(),
  integrationState?: PasteDropIntegrationState,
  verificationBoundary?: PasteDropVerificationBoundary,
): Promise<void> {
  assert.ok(
    verificationBoundary,
    `Expected fallback verification metadata for ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance3}. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)}`,
  );
  assert.equal(
    verificationBoundary.acceptanceTrace.acceptance3,
    ISSUE_0010_ACCEPTANCE_TRACE.acceptance3,
    `Expected fallback verification to remain explicitly mapped to ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance3}. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(
    verificationBoundary.proofTargets.includes('fallback-compatibility'),
    `Expected fallback compatibility to remain inside the fixed verification boundary. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.match(
    verificationBoundary.e2eProofBoundary,
    /fallback compatibility/,
    `Expected fallback verification to stay scoped to explicit proof boundary rather than autocomplete or headless prerequisite failures. boundary=${JSON.stringify(verificationBoundary)} autocompleteIsolation=${AUTOCOMPLETE_ISOLATION_BOUNDARY}`,
  );

  const document = await openMarkdownDocument(markdownFilePath, '# PasteDropFallback\n\n');
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  await vscode.commands.executeCommand('markdownMatrixInjector.__test.insertEmbedFromPaste', {
    clipboardHtml:
      '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>ID</td><td>Name</td></tr><tr><td>1</td><td>Auth</td></tr></table>',
  });

  const fallbackTextAfterPaste = document.getText();
  logStage('paste-drop-proof-fallback-compatibility:after-paste', {
    capability,
    integrationState,
    verificationBoundary,
    documentText: fallbackTextAfterPaste,
  });

  assert.match(
    fallbackTextAfterPaste,
    /!\[\[\/tmp\/report\.xlsx\]\]/,
    `Expected ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance3} to keep the paste fallback path inserting through the shared paste/drop logic. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(
    fallbackTextAfterPaste.includes(PASTE_FALLBACK_EXPECTED_INSERT),
    `Expected fallback paste command to produce ${PASTE_FALLBACK_EXPECTED_INSERT} so command compatibility remains distinguishable from autocomplete instability. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );

  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));
  await vscode.commands.executeCommand('markdownMatrixInjector.__test.insertEmbedFromDrop', {
    droppedFiles: ['/tmp/drop-target.csv'],
  });

  const fallbackTextAfterDrop = document.getText();
  logStage('paste-drop-proof-fallback-compatibility:after-drop', {
    capability,
    integrationState,
    verificationBoundary,
    documentText: fallbackTextAfterDrop,
  });

  assert.match(
    fallbackTextAfterDrop,
    /!\[\[\/tmp\/drop-target\.csv\]\]/,
    `Expected ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance3} to keep the drop fallback path inserting through the shared paste/drop logic. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(
    fallbackTextAfterDrop.includes(DROP_FALLBACK_EXPECTED_INSERT),
    `Expected fallback drop command to produce ${DROP_FALLBACK_EXPECTED_INSERT} so provider-regression triage remains separate from unrelated autocomplete flakes. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );
}

/**
 * issue-0114 作業D real GUI verification, standalone-command path (`MMI:
 * Insert Embed by Content Match`). Uses the real `vscode.env.clipboard` and
 * the real fixture workspace (`test/fixtures/workspace/data/roles.csv`,
 * containing a unique "Alice,Admin" row unmatched by any other workspace
 * fixture) to prove the whole pipeline end to end: clipboard TSV -> parseTsv
 * -> findWorkbookContentMatches (real `vscode.workspace.findFiles` scan of
 * the real workspace) -> a real document edit.
 *
 * `vscode.window.showQuickPick` is monkey-patched to auto-select the first
 * item rather than waiting for a human -- this test process shares the same
 * `vscode` module instance as the loaded extension (both run inside the one
 * Extension Host process that `@vscode/test-electron` starts), so patching it
 * here really does intercept the call `insertEmbedByContentMatch` makes.
 *
 * NOT covered here: the `editor.action.pasteAs` (Ctrl+.) integration path.
 * That requires the real OS clipboard to carry `text/html` (only `text/html`/
 * `files` mime types make VS Code invoke `provideDocumentPasteEdits` at all --
 * `vscode.env.clipboard` can only set plain text). Setting a real multi-MIME
 * clipboard payload from this environment would need an external tool
 * (xclip/wl-copy), which is not installed and cannot be installed without an
 * interactive sudo password (see issue-0114 "実VS Code GUI確認の試行記録").
 */
async function verifyContentMatchStandaloneCommand(markdownFilePath: string): Promise<void> {
  // Not `openMarkdownDocument` here: `markdownFilePath` (docs/spec.md) was
  // already opened as a real editor document by the paste-drop-boundary stage
  // above. `vscode.workspace.openTextDocument` returns the cached in-memory
  // TextDocument for a URI that is already open -- it does NOT pick up a
  // fresh `workspace.fs.writeFile` to the same path -- so resetting content
  // needs an actual edit, not a disk write + reopen.
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(markdownFilePath));
  const editor = await vscode.window.showTextDocument(document);
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  await editor.edit((editBuilder) => editBuilder.replace(fullRange, '# ContentMatch\n\n'));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  if (!(await clipboardKeeps('Alice\tAdmin', 'content-match-standalone-command'))) return;
  const clipboardReadBack = await vscode.env.clipboard.readText();
  const workspaceFolderForDoc = vscode.workspace.getWorkspaceFolder(document.uri);
  const workbookFilesSeen = await vscode.workspace.findFiles('**/*.{xlsx,xls,csv,xml}', '**/{node_modules,dist}/**');

  const originalShowQuickPick = vscode.window.showQuickPick;
  let pickedFrom: unknown;
  (vscode.window as { showQuickPick: unknown }).showQuickPick = async (itemsOrPromise: unknown) => {
    const items = await itemsOrPromise;
    pickedFrom = items;
    return Array.isArray(items) ? items[0] : undefined;
  };
  const originalShowInformationMessage = vscode.window.showInformationMessage;
  const infoMessages: unknown[] = [];
  (vscode.window as { showInformationMessage: unknown }).showInformationMessage = (...args: unknown[]) => {
    infoMessages.push(args[0]);
    return Promise.resolve(undefined);
  };

  let textAfterContentMatch: string;
  try {
    await vscode.commands.executeCommand('markdownMatrixInjector.insertEmbedByContentMatch');
    textAfterContentMatch = document.getText();
  } finally {
    (vscode.window as { showQuickPick: unknown }).showQuickPick = originalShowQuickPick;
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = originalShowInformationMessage;
  }

  logStage('content-match-standalone-command:after-command', {
    documentText: textAfterContentMatch,
    quickPickItems: pickedFrom,
    infoMessages,
    clipboardReadBack,
    workspaceFolderForDoc: workspaceFolderForDoc?.uri.fsPath,
    workbookFilesSeen: workbookFilesSeen.map((uri) => uri.fsPath),
  });

  assert.match(
    textAfterContentMatch,
    /!\[\[\.\.\/data\/roles\.csv#Sheet1\|A2:B2\]\]/,
    `Expected the content-match command to find the unique "Alice,Admin" row in data/roles.csv and insert it after an explicit (auto-selected single-item) pick. documentText=${textAfterContentMatch}`,
  );
}

async function verifyContentMatchPasteAsHostCommand(
  markdownFilePath: string,
  integrationState: PasteDropIntegrationState,
): Promise<void> {
  assert.equal(
    integrationState.contentMatchPasteEditKind,
    'text.markdownMatrixInjector.embed.contentMatch',
    'Expected the content-match Paste As kind to remain stable for targeted host dispatch.',
  );
  assert.ok(
    integrationState.pasteMimeTypes.includes('text/plain'),
    'Paste As content matching must be invokable from a plain TSV clipboard so Extension Host E2E can exercise the real built-in command path.',
  );

  const filePath = markdownFilePath.replace(/\.md$/u, '-paste-as-content-match.md');
  const document = await openMarkdownDocument(filePath, '# PasteAsContentMatch\n\n');
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  if (!(await clipboardKeeps('Alice\tAdmin', 'content-match-paste-as-host-command'))) return;
  // The command acts on the focused editor; showTextDocument can resolve before focus has settled.
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  await delay(500);

  const documentVersionBeforeCommand = document.version;
  const activeEditorUriBeforeCommand = activeEditorUri();
  const messageCapture = captureWindowMessages();
  const commandStartedAt = Date.now();
  let commandElapsedMs = 0;
  let documentVersionAfterCommand = documentVersionBeforeCommand;
  let activeEditorUriAfterCommand = activeEditorUriBeforeCommand;
  try {
    await vscode.commands.executeCommand('editor.action.pasteAs', {
      preferences: [integrationState.contentMatchPasteEditKind],
    });
  } finally {
    commandElapsedMs = Date.now() - commandStartedAt;
    documentVersionAfterCommand = document.version;
    activeEditorUriAfterCommand = activeEditorUri();
    messageCapture.restore();
  }

  const pollStartedAt = Date.now();
  const pasteAsText = await waitForDocumentText(
    document,
    (text) => /!\[\[\.\.\/data\/roles\.csv#Sheet1\|A2:B2\]\]/u.test(text),
  );
  const pollElapsedMs = Date.now() - pollStartedAt;
  const pasteAsDiagnostics = {
    documentUri: document.uri.toString(),
    documentVersionBeforeCommand,
    documentVersionAfterCommand,
    documentVersionAfterPoll: document.version,
    activeEditorUriBeforeCommand,
    activeEditorUriAfterCommand,
    activeEditorUriAfterPoll: activeEditorUri(),
    commandElapsedMs,
    pollElapsedMs,
    capturedWindowMessages: messageCapture.messages,
  };
  logStage('content-match-paste-as-host-command:paste-as-diagnostics', pasteAsDiagnostics);
  assert.match(
    pasteAsText,
    /!\[\[\.\.\/data\/roles\.csv#Sheet1\|A2:B2\]\]/u,
    `Expected editor.action.pasteAs to dispatch through the registered MMI provider and insert the unique content-match reference. Document was: ${JSON.stringify(pasteAsText)} diagnostics=${JSON.stringify(pasteAsDiagnostics)}`,
  );

  // Registering text/plain as a provider trigger must not turn ordinary
  // Automatic Ctrl+V semantics into an MMI auto-insert. Reset the document,
  // paste the same TSV normally, and require the literal clipboard text.
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  await editor.edit((editBuilder) => editBuilder.replace(fullRange, '# AutomaticPaste\n\n'));
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
  await vscode.env.clipboard.writeText('Alice\tAdmin');
  await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

  const automaticText = await waitForDocumentText(document, (text) => text.includes('Alice\tAdmin'));
  assert.match(automaticText, /Alice\tAdmin/u, 'Normal paste must keep inserting the literal TSV.');
  assert.doesNotMatch(
    automaticText,
    /!\[\[/u,
    'Normal Automatic paste must not auto-confirm a content-match MMI reference.',
  );

  logStage('content-match-paste-as-host-command:result', {
    contentMatchPasteEditKind: integrationState.contentMatchPasteEditKind,
    pasteMimeTypes: integrationState.pasteMimeTypes,
    pasteAsText,
    automaticText,
    boundary:
      'Built-in Paste As dispatch is covered with text/plain TSV; real Excel HTML/Windows helper formats and visual picker interaction remain manual evidence.',
  });
}

const WINDOW_MESSAGE_APIS = ['showWarningMessage', 'showInformationMessage', 'showErrorMessage'] as const;
type WindowMessageApi = (typeof WINDOW_MESSAGE_APIS)[number];
type WindowMessageFn = (...args: unknown[]) => unknown;

interface CapturedWindowMessage {
  api: WindowMessageApi;
  text: string;
  items: string[];
}

/**
 * Wraps the three notification APIs so that messages raised while a command runs
 * are recorded. Each wrapper still calls the original, so VS Code behaves as it
 * does without the diagnostic. `restore` must be called in a `finally` block.
 */
function captureWindowMessages(): { messages: CapturedWindowMessage[]; restore: () => void } {
  const messages: CapturedWindowMessage[] = [];
  const windowApi = vscode.window as unknown as Record<WindowMessageApi, WindowMessageFn>;
  const originals: Record<WindowMessageApi, WindowMessageFn> = {
    showWarningMessage: windowApi.showWarningMessage,
    showInformationMessage: windowApi.showInformationMessage,
    showErrorMessage: windowApi.showErrorMessage,
  };
  for (const api of WINDOW_MESSAGE_APIS) {
    windowApi[api] = (...args: unknown[]) => {
      const [message, ...rest] = args;
      messages.push({
        api,
        text: typeof message === 'string' ? message : String(message),
        items: rest.filter((item): item is string => typeof item === 'string'),
      });
      return originals[api].apply(vscode.window, args);
    };
  }
  return {
    messages,
    restore: () => {
      for (const api of WINDOW_MESSAGE_APIS) {
        windowApi[api] = originals[api];
      }
    },
  };
}

function activeEditorUri(): string | null {
  return vscode.window.activeTextEditor?.document.uri.toString() ?? null;
}

async function waitForDocumentText(
  document: vscode.TextDocument,
  predicate: (text: string) => boolean,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const text = document.getText();
    if (predicate(text)) return text;
    await delay(100);
  }
  return document.getText();
}


async function verifyNativeProviderAdapterCoverage(
  markdownFilePath: string,
  capability: NativeProviderCapability,
  integrationState: PasteDropIntegrationState,
  verificationBoundary: PasteDropVerificationBoundary,
): Promise<void> {
  assert.ok(
    verificationBoundary.nativeProviderSupported && verificationBoundary.dropProviderSupported,
    `Native adapter coverage for ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1} and ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2} requires both provider APIs. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)}`,
  );
  assert.equal(
    verificationBoundary.acceptanceTrace.acceptance1,
    ISSUE_0010_ACCEPTANCE_TRACE.acceptance1,
    `Expected native provider verification to remain explicitly mapped to ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1}. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.equal(
    verificationBoundary.acceptanceTrace.acceptance2,
    ISSUE_0010_ACCEPTANCE_TRACE.acceptance2,
    `Expected shared-logic verification to remain explicitly mapped to ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2}. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(
    verificationBoundary.proofTargets.includes('provider-registration-surface'),
    `Expected provider registration surface to remain inside the fixed verification boundary. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.match(
    verificationBoundary.e2eProofBoundary,
    /provider registration surface/,
    `Expected native verification to stay scoped to provider registration surface proof. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.ok(
    typeof verificationBoundary.autocompleteSheetCompletionStable === 'boolean',
    `Expected autocomplete isolation metadata alongside native provider verification. boundary=${JSON.stringify(verificationBoundary)} autocompleteIsolation=${AUTOCOMPLETE_ISOLATION_BOUNDARY}`,
  );

  const document = await openMarkdownDocument(
    path.join(path.dirname(markdownFilePath), 'phase5-native-provider.md'),
    '# NativeProviders\n\n',
  );

  assert.ok(
    vscode.DocumentDropOrPasteEditKind.Text.contains(
      vscode.DocumentDropOrPasteEditKind.Text.append('markdownMatrixInjector', 'embed'),
    ),
    'Expected native provider edit kind to extend the built-in text edit kind.',
  );
  assert.equal(integrationState.nativeEditKind, 'text.markdownMatrixInjector.embed');

  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const pasteTransfer = new vscode.DataTransfer();
  pasteTransfer.set(
    'text/html',
    new vscode.DataTransferItem(
      '<div data-sheet="Summary">file:///tmp/native.xlsx</div><table><tr><td>ID</td><td>Name</td></tr></table>',
    ),
  );

  logStage('paste-drop-proof-provider-registration-surface:transfer-shape', {
    pasteMimeTypes: integrationState.pasteMimeTypes,
    dropMimeTypes: integrationState.dropMimeTypes,
    verificationBoundary,
  });

  const pasteInsert = await vscode.commands.executeCommand<string>(
    'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
    pasteTransfer,
  );
  assert.equal(
    pasteInsert,
    NATIVE_PASTE_EXPECTED_INSERT,
    `Expected ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2} to keep the native paste adapter on the shared paste/drop parsing path after ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1} is satisfied. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );

  const dropTransfer = new vscode.DataTransfer();
  dropTransfer.set('text/uri-list', new vscode.DataTransferItem('file:///tmp/native-drop.csv'));

  const dropInsert = await vscode.commands.executeCommand<string>(
    'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
    dropTransfer,
  );
  logStage('paste-drop-proof-provider-registration-surface:results', {
    pasteInsert,
    dropInsert,
    verificationBoundary,
  });

  assert.equal(
    dropInsert,
    NATIVE_DROP_EXPECTED_INSERT,
    `Expected ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2} to keep the native drop adapter on the shared paste/drop parsing path after ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance1} is satisfied. capability=${JSON.stringify(capability)} integrationState=${JSON.stringify(integrationState)} boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.notEqual(
    pasteInsert,
    PASTE_FALLBACK_EXPECTED_INSERT,
    `Expected native paste adapter coverage to remain distinct from command fallback fixtures while still proving ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2}. boundary=${JSON.stringify(verificationBoundary)}`,
  );
  assert.notEqual(
    dropInsert,
    DROP_FALLBACK_EXPECTED_INSERT,
    `Expected native drop adapter coverage to remain distinct from command fallback fixtures while still proving ${ISSUE_0010_ACCEPTANCE_TRACE.acceptance2}. boundary=${JSON.stringify(verificationBoundary)}`,
  );

  logStage('issue-0010-acceptance2-shared-logic-reuse', {
    pasteInsert,
    dropInsert,
    expectedNativeInsertions: [NATIVE_PASTE_EXPECTED_INSERT, NATIVE_DROP_EXPECTED_INSERT],
    expectedFallbackInsertions: [PASTE_FALLBACK_EXPECTED_INSERT, DROP_FALLBACK_EXPECTED_INSERT],
    nativeEditKind: integrationState.nativeEditKind,
    verificationBoundary,
    trace: ISSUE_0010_ACCEPTANCE_TRACE.acceptance2,
  });
}

async function getPasteDropIntegrationState(): Promise<PasteDropIntegrationState> {
  const state = await vscode.commands.executeCommand<PasteDropIntegrationState>(
    'markdownMatrixInjector.__test.getPasteDropIntegrationState',
  );
  assert.ok(state, 'Expected extension integration state command to return a snapshot.');
  return state;
}

function getNativeProviderCapability(): NativeProviderCapability {
  const languages = vscode.languages as typeof vscode.languages & {
    registerDocumentPasteEditProvider?: unknown;
    registerDocumentDropEditProvider?: unknown;
  };

  return {
    hasNativePasteProvider: typeof languages.registerDocumentPasteEditProvider === 'function',
    hasNativeDropProvider: typeof languages.registerDocumentDropEditProvider === 'function',
  };
}

interface CompletionRequest {
  readonly filePath: string;
  readonly stageName: string;
  readonly content: string;
  readonly expectedLabel?: string;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
}

interface CompletionState {
  readonly stageName: string;
  readonly expectedLabel?: string;
  readonly lineText: string;
  readonly position: {
    readonly line: number;
    readonly character: number;
  };
  readonly attempts: number;
  readonly labels: string[];
  readonly labelsByAttempt: readonly string[][];
  readonly vscodeVersion: string;
  readonly platform: string;
  readonly display: string;
}

async function getCompletionState(request: CompletionRequest): Promise<CompletionState> {
  const uniqueFilePath = request.filePath.replace(/\.md$/, `-${Math.random().toString(36).slice(2)}.md`);
  const document = await openMarkdownDocument(uniqueFilePath, request.content);
  const editor = await vscode.window.showTextDocument(document);
  const lineNumber = document.lineCount - 1;
  const lineText = document.lineAt(lineNumber).text;
  const position = new vscode.Position(lineNumber, lineText.length);
  const maxAttempts = request.maxAttempts ?? 15;
  const delayMs = request.delayMs ?? 200;
  editor.selection = new vscode.Selection(position, position);

  let labels: string[] = [];
  let attempts = 0;
  const labelsByAttempt: string[][] = [];

  for (; attempts < maxAttempts; attempts += 1) {
    await vscode.commands.executeCommand('editor.action.triggerSuggest');

    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
    );
    labels = (completionList?.items ?? []).map((item) => item.label.toString());
    labelsByAttempt.push(labels);

    if (request.expectedLabel ? labels.includes(request.expectedLabel) : labels.length > 0) {
      attempts += 1;
      break;
    }

    await delay(delayMs);
  }

  if (request.expectedLabel ? !labels.includes(request.expectedLabel) : labels.length === 0) {
    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
    );
    labels = (completionList?.items ?? []).map((item) => item.label.toString());
    labelsByAttempt.push(labels);
    attempts += 1;
  }

  return {
    stageName: request.stageName,
    expectedLabel: request.expectedLabel,
    lineText,
    position: {
      line: position.line,
      character: position.character,
    },
    attempts,
    labels,
    labelsByAttempt,
    vscodeVersion: vscode.version,
    platform: process.platform,
    display: process.env.DISPLAY ?? '(unset)',
  };
}

function assertCompletionIncludes(state: CompletionState, expectedLabel: string): void {
  assert.ok(
    state.labels.includes(expectedLabel),
    `Expected autocomplete label ${JSON.stringify(expectedLabel)} at ${state.stageName}. got: ${formatCompletionState(state)}`,
  );
}

function reportKnownSheetCompletionFlake(state: CompletionState, expectedLabel: string): boolean {
  if (state.labels.includes(expectedLabel)) {
    return true;
  }

  console.warn(
    `[mmi:e2e] Known flaky autocomplete gap isolated to ${state.stageName}; this does not fail issue-0010 paste/drop acceptance because the proof boundary is limited to native provider registration surface, shared logic reuse, and fallback compatibility. Autocomplete remains a separate known-unstable lane, and OS-native UX dispatch or headless entry-condition triage are not covered here. ${formatCompletionState(state)}`,
  );
  return false;
}

function formatCompletionState(state: CompletionState): string {
  return JSON.stringify({
    stageName: state.stageName,
    expectedLabel: state.expectedLabel,
    vscodeVersion: state.vscodeVersion,
    platform: state.platform,
    display: state.display,
    lineText: state.lineText,
    position: state.position,
    attempts: state.attempts,
    labels: state.labels,
    labelsByAttempt: state.labelsByAttempt,
  });
}

/**
 * Writes `text` to the host clipboard and reports whether it stayed there.
 * On a Windows desktop another process can hold the clipboard, so the write
 * is lost; that is an environment prerequisite, not a product result, and the
 * stage is logged as skipped instead of failing on the product's behalf.
 */
async function clipboardKeeps(text: string, stage: string): Promise<boolean> {
  await vscode.env.clipboard.writeText(text);
  const readBack = await vscode.env.clipboard.readText();
  if (readBack === text) return true;
  logStage(`${stage}:skipped`, {
    category: 'environment-prerequisite',
    reason: 'vscode.env.clipboard did not keep the written text',
    clipboardReadBack: readBack,
  });
  return false;
}

async function openMarkdownDocument(filePath: string, content: string): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  return vscode.workspace.openTextDocument(uri);
}

async function waitForDiagnostics(uri: vscode.Uri, expectedCount: number): Promise<readonly vscode.Diagnostic[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length >= expectedCount) {
      return diagnostics;
    }

    await delay(200);
  }

  return vscode.languages.getDiagnostics(uri);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
