/**
 * Guided creation / editing of one embed, and quick fixes for broken ones
 * (issue-0111).
 *
 * Flow: file -> sheet -> range -> options -> preview & confirm -> insert.
 * Every step is keyboard-only (QuickPick), has a Back button, and Escape
 * cancels without touching the document. On an existing embed the flow
 * starts from its current values and rewrites only what changed
 * (`embedEditor`), so unknown and repeated keys survive. The insert is a
 * single edit (one Undo), and it is re-validated first: if the document or
 * the source workbook changed since the preview, the preview is rebuilt and
 * confirmed again. Nothing is inserted without that confirmation (R1).
 */
import fs from 'node:fs';
import * as vscode from 'vscode';

import type { WorkbookData } from '../core/workbookLoader.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';
import { analyzeCompletionContext } from './completionContext.js';
import { rangeCandidates } from './completionCandidates.js';
import { getParams, parseEmbedParts, serializeEmbedParts, setParam, type EmbedParts } from './embedEditor.js';
import { fileFixCandidates, sheetFixCandidates } from './embedFixes.js';
import { describePreview, summarizeRenderedEmbed, type PreviewSummary } from './embedPreview.js';
import { resolveWorkbookPath, toRelativeSuggestion } from './vscodeAdapters.js';

export const AUTHOR_EMBED_COMMAND_ID = 'markdownMatrixInjector.authorEmbed';

export interface AuthoringDependencies {
  workbookGlob: string;
  render(markdown: string, markdownFilePath: string, workspaceRoot?: string): Promise<string>;
  /** "Find by description" entry on the first step; returns the chosen embed's parts. */
  searchByDescription?(document: vscode.TextDocument): Promise<EmbedParts | undefined>;
}

export interface AuthoringStart {
  parts: EmbedParts;
  /** Step to open on; earlier steps stay reachable with Back. */
  step: 'options' | 'confirm';
}

const SEARCH_SENTINEL = '__mmi_search__';

type Step = 'file' | 'sheet' | 'range' | 'options' | 'confirm';
const STEPS: Step[] = ['file', 'sheet', 'range', 'options', 'confirm'];


interface Located {
  range: vscode.Range;
  parts: EmbedParts;
}

/** The embed under the cursor, if the cursor is inside a complete `![[...]]`. */
export function embedAt(document: vscode.TextDocument, position: vscode.Position): Located | undefined {
  const line = document.lineAt(position.line).text;
  for (const match of line.matchAll(/!\[\[[^\]\n]*\]\]/gu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (position.character < start || position.character > end) continue;
    const parts = parseEmbedParts(match[0]);
    if (parts) return { range: new vscode.Range(position.line, start, position.line, end), parts };
  }
  return undefined;
}

export async function runAuthoringFlow(deps: AuthoringDependencies, start?: AuthoringStart): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') return;
  const document = editor.document;
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  const existing = embedAt(document, editor.selection.active);
  // Inside an unfinished embed or inside code: do not guess a target.
  if (!existing && analyzeCompletionContext(document.getText(), document.offsetAt(editor.selection.active))) {
    void vscode.window.showInformationMessage('MMI: 書きかけの参照の中では使えません。補完（Ctrl+Space）を使うか、参照の外で実行してください。');
    return;
  }
  const target = existing?.range ?? editor.selection;
  const startVersion = document.version;
  let parts: EmbedParts = start?.parts ?? existing?.parts ?? { filepath: '', segments: [] };
  let step = start ? STEPS.indexOf(start.step) : 0;
  let movingBack = false;

  const workbookOf = (filepath: string): { absolute: string; data?: WorkbookData } => {
    const absolute = resolveWorkbookPath(filepath, document.uri.fsPath, workspaceRoot);
    try {
      return { absolute, data: readWorkbookCached(absolute) };
    } catch {
      return { absolute };
    }
  };

  for (;;) {
    const current = STEPS[step];
    const title = `${existing ? 'MMI: 参照を編集' : 'MMI: 参照を作成'} (${step + 1}/${STEPS.length})`;
    let result: StepResult;
    if (current === 'file') {
      const files = workspaceRoot
        ? (await vscode.workspace.findFiles(deps.workbookGlob, '**/{node_modules,dist}/**'))
            .filter((uri) => uri.fsPath.startsWith(workspaceRoot))
            .map((uri) => toRelativeSuggestion(document.uri.fsPath, uri.fsPath))
            .sort((a, b) => a.localeCompare(b))
        : [];
      const searchItem = deps.searchByDescription
        ? [{ label: '$(search) 説明から探す…', description: '例: 状態遷移表のIDと操作を見せて', value: SEARCH_SENTINEL }]
        : [];
      result = await pick(
        title,
        'ブックを選ぶ（説明から探すこともできます）',
        [...searchItem, ...files.map((file) => ({ label: file, value: file, picked: file === parts.filepath }))],
        step > 0,
      );
      if (result.kind === 'value' && result.value === SEARCH_SENTINEL) {
        const found = await deps.searchByDescription!(document);
        if (!found) continue; // back to the file step
        parts = found;
        step = STEPS.indexOf('confirm');
        continue;
      }
      if (result.kind === 'value') parts = { ...parts, filepath: result.value, ...(result.value !== parts.filepath ? { sheet: undefined, range: undefined } : {}) };
    } else if (current === 'sheet') {
      const sheets = Object.keys(workbookOf(parts.filepath).data?.sheets ?? {});
      if (sheets.length <= 1 && /\.csv$/iu.test(parts.filepath)) {
        // Nothing to choose: skip in the direction the user is moving, so Back
        // from the range step reaches the file step instead of bouncing.
        result = movingBack ? { kind: 'back' } : { kind: 'value', value: sheets[0] ?? 'Sheet1' };
      } else {
        result = await pick(title, 'シートを選ぶ', sheets.map((sheet) => ({ label: sheet, value: sheet, picked: sheet === parts.sheet })), true);
      }
      if (result.kind === 'value') parts = { ...parts, sheet: result.value, ...(result.value !== parts.sheet ? { range: undefined } : {}) };
    } else if (current === 'range') {
      const sheet = parts.sheet ? workbookOf(parts.filepath).data?.sheets[parts.sheet] : undefined;
      const context = { stage: 'range' as const, replaceStart: 0, replaceEnd: 0, typed: '', filepath: parts.filepath, usedParams: [] };
      const items = [
        ...(sheet && parts.sheet ? rangeCandidates(context, parts.sheet, sheet) : []).map((candidate) => ({
          label: candidate.label,
          description: candidate.detail,
          value: candidate.label,
          picked: candidate.label === parts.range,
        })),
        { label: '範囲を指定しない', description: 'シート全体（大きい場合はカード表示）', value: '' },
      ];
      result = await pick(title, '範囲を選ぶ（表題・見出しでも絞り込めます）', items, true);
      if (result.kind === 'value') parts = { ...parts, range: result.value || undefined };
    } else if (current === 'options') {
      result = await pickOptions(title, parts);
      if (result.kind === 'options') parts = result.parts;
    } else {
      const markdown = serializeEmbedParts(parts);
      const summary = await preview(deps, markdown, document.uri.fsPath, workspaceRoot);
      const sourceStamp = stamp(workbookOf(parts.filepath).absolute);
      result = await pick(
        title,
        describePreview(summary),
        [
          { label: existing ? '$(check) 置き換える' : '$(check) 挿入する', description: markdown, value: 'insert' },
          { label: '$(arrow-left) 戻る', value: 'back' },
        ],
        true,
      );
      if (result.kind === 'value' && result.value === 'back') result = { kind: 'back' };
      if (result.kind === 'value') {
        // Re-validate: the document or the source may have changed while the pick was open.
        const live = vscode.window.activeTextEditor;
        if (!live || live.document !== document || document.version !== startVersion) {
          // The target position may no longer be valid: stop without editing.
          void vscode.window.showWarningMessage('MMI: 操作中に文書が変わったため、挿入を中止しました（文書は変更していません）。');
          return;
        }
        if (stamp(workbookOf(parts.filepath).absolute) !== sourceStamp) {
          void vscode.window.showWarningMessage('MMI: 原本が変わったため、プレビューを作り直します。');
          continue;
        }
        await live.edit((edit) => edit.replace(target, markdown)); // one edit = one Undo
        return;
      }
    }
    if (result.kind === 'cancel') return; // nothing changed
    movingBack = result.kind === 'back';
    step = movingBack ? Math.max(0, step - 1) : step + 1;
  }
}

type StepResult = { kind: 'value'; value: string } | { kind: 'options'; parts: EmbedParts } | { kind: 'back' } | { kind: 'cancel' };

interface PickItem extends vscode.QuickPickItem {
  value: string;
}

/**
 * Scripted answers for the Extension Host e2e (registered only as a test
 * command). Each step consumes one answer: an item value or label, `keep`
 * (the preselected item), `back`, `cancel`, or the option labels to select.
 * The same code path as the real QuickPick runs; only the choice is scripted.
 */
export type ScriptedAnswer = string | { keep: true } | { back: true } | { cancel: true } | { options: string[] };

export interface ScriptedStep {
  title: string;
  placeholder: string;
  items: string[];
}

let script: { answers: ScriptedAnswer[]; transcript: ScriptedStep[] } | undefined;

export async function runScriptedAuthoringFlow(
  deps: AuthoringDependencies,
  answers: ScriptedAnswer[],
  start?: AuthoringStart,
): Promise<ScriptedStep[]> {
  script = { answers: [...answers], transcript: [] };
  try {
    await runAuthoringFlow(deps, start);
    return script.transcript;
  } finally {
    script = undefined;
  }
}

function scriptedPick(title: string, placeholder: string, items: (PickItem & { picked?: boolean })[]): StepResult {
  script!.transcript.push({ title, placeholder, items: items.map((item) => item.label) });
  const answer = script!.answers.shift();
  if (answer === undefined || (typeof answer === 'object' && 'cancel' in answer)) return { kind: 'cancel' };
  if (typeof answer === 'object' && 'back' in answer) return { kind: 'back' };
  const chosen =
    typeof answer === 'object' && 'keep' in answer
      ? (items.find((item) => item.picked) ?? items[0])
      : items.find((item) => item.value === answer || item.label === answer);
  if (!chosen) throw new Error(`Scripted answer ${JSON.stringify(answer)} matches no item in: ${items.map((item) => item.label).join(', ')}`);
  return { kind: 'value', value: chosen.value };
}

function pick(title: string, placeholder: string, items: (PickItem & { picked?: boolean })[], canGoBack: boolean): Promise<StepResult> {
  if (script) return Promise.resolve(scriptedPick(title, placeholder, items));
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<PickItem>();
    quickPick.title = title;
    quickPick.placeholder = placeholder;
    quickPick.items = items;
    quickPick.matchOnDescription = true;
    const preselected = items.find((item) => item.picked);
    if (preselected) quickPick.activeItems = [preselected];
    quickPick.buttons = canGoBack ? [vscode.QuickInputButtons.Back] : [];
    let settled = false;
    const finish = (value: StepResult): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      quickPick.dispose();
    };
    quickPick.onDidTriggerButton(() => finish({ kind: 'back' }));
    quickPick.onDidAccept(() => {
      const chosen = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
      if (chosen) finish({ kind: 'value', value: chosen.value });
    });
    quickPick.onDidHide(() => finish({ kind: 'cancel' }));
    quickPick.show();
  });
}

const OPTIONS = [
  { label: 'header=first', description: '先頭行を見出しにする', key: 'header', value: 'first' },
  { label: 'mode=table', description: '大きくても表として表示する', key: 'mode', value: 'table' },
  { label: 'mode=card', description: '別紙カードとして表示する', key: 'mode', value: 'card' },
  { label: 'transpose=true', description: '行と列を入れ替える', key: 'transpose', value: 'true' },
];

/** The parts after choosing `chosenLabels`, or a message when the choice is contradictory. */
function applyOptions(parts: EmbedParts, chosenLabels: readonly string[]): EmbedParts | string {
  const chosen = OPTIONS.filter((option) => chosenLabels.includes(option.label));
  if (chosen.some((c) => c.label === 'mode=table') && chosen.some((c) => c.label === 'mode=card')) {
    return 'mode=table と mode=card は同時に選べません';
  }
  let next = parts;
  for (const key of new Set(OPTIONS.map((option) => option.key))) {
    const selected = chosen.find((option) => option.key === key);
    const offered = OPTIONS.filter((option) => option.key === key).map((option) => option.value);
    const currentValues = getParams(parts, key);
    // Only keys whose current value is one we offer are ours to change.
    if (selected) next = setParam(next, key, selected.value);
    else if (currentValues.length > 0 && currentValues.every((value) => offered.includes(value))) next = setParam(next, key, undefined);
  }
  return next;
}

function pickOptions(title: string, parts: EmbedParts): Promise<StepResult> {
  const options = OPTIONS;
  if (script) {
    const placeholder = '表示の指定';
    script.transcript.push({ title, placeholder, items: options.map((option) => option.label) });
    const answer = script.answers.shift();
    if (answer === undefined || (typeof answer === 'object' && 'cancel' in answer)) return Promise.resolve({ kind: 'cancel' });
    if (typeof answer === 'object' && 'back' in answer) return Promise.resolve({ kind: 'back' });
    const labels =
      typeof answer === 'object' && 'options' in answer
        ? answer.options
        : options.filter((option) => getParams(parts, option.key).includes(option.value)).map((option) => option.label);
    const next = applyOptions(parts, labels);
    if (typeof next === 'string') throw new Error(next);
    return Promise.resolve({ kind: 'options', parts: next });
  }
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<(typeof options)[number]>();
    quickPick.title = title;
    quickPick.placeholder = '表示の指定（Spaceで選択、Enterで次へ）。ここに無いキーはそのまま残します';
    quickPick.canSelectMany = true;
    quickPick.items = options;
    quickPick.selectedItems = options.filter((option) => getParams(parts, option.key).includes(option.value));
    quickPick.buttons = [vscode.QuickInputButtons.Back];
    let settled = false;
    const finish = (value: StepResult): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      quickPick.dispose();
    };
    quickPick.onDidTriggerButton(() => finish({ kind: 'back' }));
    quickPick.onDidAccept(() => {
      const next = applyOptions(parts, quickPick.selectedItems.map((item) => item.label));
      if (typeof next === 'string') {
        quickPick.placeholder = next;
        return;
      }
      finish({ kind: 'options', parts: next });
    });
    quickPick.onDidHide(() => finish({ kind: 'cancel' }));
    quickPick.show();
  });
}

async function preview(deps: AuthoringDependencies, markdown: string, markdownFilePath: string, workspaceRoot?: string): Promise<PreviewSummary> {
  try {
    return summarizeRenderedEmbed(await deps.render(markdown, markdownFilePath, workspaceRoot));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

function stamp(absolutePath: string): string {
  try {
    const stat = fs.statSync(absolutePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

// --- quick fixes ---------------------------------------------------------------

export function createEmbedFixProvider(workbookGlob: string): vscode.CodeActionProvider {
  return {
    async provideCodeActions(document, range, context) {
      const actions: vscode.CodeAction[] = [];
      const here = embedAt(document, range.start);
      if (here) {
        const edit = new vscode.CodeAction('MMI: この参照を編集…', vscode.CodeActionKind.RefactorRewrite);
        edit.command = {
          command: AUTHOR_EMBED_COMMAND_ID,
          title: 'MMI: この参照を編集…',
          arguments: [{ uri: document.uri.toString(), line: range.start.line, character: range.start.character }],
        };
        actions.push(edit);
      }
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
      for (const diagnostic of context.diagnostics) {
        if (diagnostic.source !== 'markdown-matrix-injector') continue;
        const embed = embedAt(document, diagnostic.range.start);
        if (!embed) continue; // never rewrite text we could not parse
        // Locate the broken part inside the parsed embed itself, not via the
        // diagnostic's span, so the edit replaces exactly that part.
        const embedText = document.getText(embed.range);
        const embedStart = document.offsetAt(embed.range.start);
        let fixes: { replacement: string }[] = [];
        let span: vscode.Range | undefined;
        if (diagnostic.code === 'MMI_SHEET_NOT_FOUND' && embed.parts.sheet) {
          const at = embedText.indexOf(`#${embed.parts.sheet}`);
          if (at >= 0) {
            span = new vscode.Range(
              document.positionAt(embedStart + at + 1),
              document.positionAt(embedStart + at + 1 + embed.parts.sheet.length),
            );
          }
          try {
            const absolute = resolveWorkbookPath(embed.parts.filepath, document.uri.fsPath, workspaceRoot);
            fixes = sheetFixCandidates(embed.parts.sheet, Object.keys(readWorkbookCached(absolute).sheets));
          } catch {
            fixes = [];
          }
        } else if (diagnostic.code === 'MMI_FILE_NOT_FOUND' && workspaceRoot) {
          const at = embedText.indexOf(embed.parts.filepath, 3);
          if (at >= 0) {
            span = new vscode.Range(document.positionAt(embedStart + at), document.positionAt(embedStart + at + embed.parts.filepath.length));
          }
          const files = (await vscode.workspace.findFiles(workbookGlob, '**/{node_modules,dist}/**'))
            .filter((uri) => uri.fsPath.startsWith(workspaceRoot))
            .map((uri) => toRelativeSuggestion(document.uri.fsPath, uri.fsPath));
          fixes = fileFixCandidates(embed.parts.filepath, files);
        }
        if (!span) continue;
        fixes.forEach((fix, index) => {
          const action = new vscode.CodeAction(`「${fix.replacement}」に置き換える`, vscode.CodeActionKind.QuickFix);
          action.diagnostics = [diagnostic];
          action.isPreferred = index === 0 && fixes.length === 1; // a single sure candidate only
          action.edit = new vscode.WorkspaceEdit();
          action.edit.replace(document.uri, span!, fix.replacement);
          actions.push(action);
        });
      }
      return actions;
    },
  };
}
