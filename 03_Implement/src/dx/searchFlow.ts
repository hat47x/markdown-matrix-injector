/**
 * "Find a table by description" (issue-0115 in the product).
 *
 * The user types a short Japanese request; candidates update as they type,
 * each with the explanation of what the notation will mean (target, columns,
 * the row-wide partial-match condition). Requests the notation cannot
 * express are answered with the reason, never approximated. Choosing a
 * candidate never inserts it directly: it goes to the preview & confirm
 * step of the guided flow (R1).
 *
 * The workspace's own workbooks are indexed in memory on first use (with
 * progress and cancel) and refreshed by mtime on every later use.
 */
import fs from 'node:fs';
import * as vscode from 'vscode';

import type { CompileResult } from '../search/nlQuery/compiler.js';
import { QUERY_EXAMPLES, WorkspaceRegionIndex } from '../search/workspaceRegionIndex.js';
import { parseEmbedParts, type EmbedParts } from './embedEditor.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';
import { toRelativeSuggestion } from './vscodeAdapters.js';

export const FIND_EMBED_COMMAND_ID = 'markdownMatrixInjector.findEmbedByDescription';

/** Same cap as the content-match search: bounds the pathological workspace. */
const MAX_INDEXED_FILES = 500;

const indexes = new Map<string, WorkspaceRegionIndex>();

function indexFor(workspaceRoot: string): WorkspaceRegionIndex {
  let index = indexes.get(workspaceRoot);
  if (!index) {
    index = new WorkspaceRegionIndex({
      loadWorkbook: (path) => readWorkbookCached(path),
      statFile: (path) => {
        const stat = fs.statSync(path);
        return { mtimeMs: stat.mtimeMs, size: stat.size };
      },
    });
    indexes.set(workspaceRoot, index);
  }
  return index;
}

/** Drops every in-memory index (the index holds content-derived data). */
export function clearSearchIndexes(): void {
  for (const index of indexes.values()) index.clear();
  indexes.clear();
}

async function ensureIndexed(workspaceRoot: string, workbookGlob: string): Promise<WorkspaceRegionIndex | undefined> {
  const index = indexFor(workspaceRoot);
  const files = (await vscode.workspace.findFiles(workbookGlob, '**/{node_modules,dist}/**'))
    .map((uri) => uri.fsPath)
    .filter((path) => path.startsWith(workspaceRoot))
    .slice(0, MAX_INDEXED_FILES);
  const first = index.regionCount === 0;
  const run = async (token?: vscode.CancellationToken, report?: (done: number, total: number) => void) => {
    const controller = new AbortController();
    token?.onCancellationRequested(() => controller.abort());
    return index.refresh(files, { signal: controller.signal, onProgress: report });
  };
  const result = first
    ? await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'MMI: ワークスペースの表を索引しています', cancellable: true },
        (progress, token) => {
          let last = 0;
          return run(token, (done, total) => {
            progress.report({ message: `${done}/${total}`, increment: ((done - last) / Math.max(1, total)) * 100 });
            last = done;
          });
        },
      )
    : await run();
  if (result.cancelled && index.regionCount === 0) return undefined;
  if (result.capped) {
    void vscode.window.showWarningMessage(`MMI: 表の数が上限に達したため、一部のブックは索引していません（${result.regions}表）。`);
  }
  return index;
}

interface ResultItem extends vscode.QuickPickItem {
  parts?: EmbedParts;
  example?: string;
}

/**
 * Opens the search box and resolves to the chosen embed's parts, or
 * `undefined` when cancelled. Does not edit anything.
 */
export async function searchEmbedByDescription(document: vscode.TextDocument, workbookGlob: string): Promise<EmbedParts | undefined> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showInformationMessage('MMI: 説明から探すには、文書をワークスペースのフォルダ内に置いてください。');
    return undefined;
  }
  const index = await ensureIndexed(workspaceRoot, workbookGlob);
  if (!index) return undefined;
  const relative = (bookPath: string): string => toRelativeSuggestion(document.uri.fsPath, bookPath);

  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<ResultItem>();
    quickPick.title = `MMI: 説明から表を探す（${index.regionCount}表を索引済み）`;
    quickPick.placeholder = `例: ${QUERY_EXAMPLES.join(' ／ ')}`;
    quickPick.matchOnDescription = false;
    const examples = (): ResultItem[] =>
      QUERY_EXAMPLES.map((example) => ({ label: `$(lightbulb) ${example}`, description: '入力例（選ぶと入力欄に入ります）', example, alwaysShow: true }));
    quickPick.items = examples();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (value: EmbedParts | undefined): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
      quickPick.dispose();
    };
    const update = (text: string): void => {
      if (!text.trim()) {
        quickPick.items = examples();
        return;
      }
      quickPick.busy = true;
      try {
        quickPick.items = toItems(index.query(text, relative));
      } finally {
        quickPick.busy = false;
      }
    };
    quickPick.onDidChangeValue((text) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => update(text), 120);
    });
    quickPick.onDidAccept(() => {
      const chosen = quickPick.activeItems[0];
      if (chosen?.example) {
        quickPick.value = chosen.example;
        update(chosen.example);
        return;
      }
      if (chosen?.parts) finish(chosen.parts);
    });
    quickPick.onDidHide(() => finish(undefined));
    quickPick.show();
  });
}

/**
 * Test-command entry (Extension Host e2e): the same index and compile path
 * as the search box, with the typed text and the chosen row given directly.
 */
export async function scriptedSearch(
  document: vscode.TextDocument,
  workbookGlob: string,
  text: string,
  pickIndex: number,
): Promise<{ items: string[]; parts?: EmbedParts }> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!workspaceRoot) return { items: [] };
  const index = await ensureIndexed(workspaceRoot, workbookGlob);
  if (!index) return { items: [] };
  const items = toItems(index.query(text, (bookPath) => toRelativeSuggestion(document.uri.fsPath, bookPath)));
  return { items: items.map((item) => `${item.label} | ${item.detail ?? ''}`), parts: items[pickIndex]?.parts };
}

/** Candidates, or a reason the request cannot be expressed / matched. Always shown regardless of label filtering. */
export function toItems(result: CompileResult): ResultItem[] {
  if (result.status === 'candidates') {
    return result.candidates.map((candidate) => ({
      label: `$(table) ${candidate.region.title ?? candidate.region.sheet}`,
      description: `${candidate.region.bookStem} / ${candidate.region.sheet} ${candidate.region.a1}`,
      detail: [
        candidate.explanation,
        candidate.region.headers?.length ? `見出し: ${candidate.region.headers.slice(0, 6).join('・')}` : '',
      ]
        .filter(Boolean)
        .join(' ｜ '),
      parts: parseEmbedParts(candidate.markdown),
      alwaysShow: true,
    }));
  }
  const icon = result.status === 'unsupported' ? '$(warning)' : '$(info)';
  const head =
    result.status === 'unsupported'
      ? 'この依頼はMMI記法で表せません'
      : result.status === 'needs-more-input'
        ? '表の名前をもう少し具体的に'
        : '該当する表が見つかりません';
  const near: ResultItem[] = (result.nearMisses ?? []).length > 0
    ? [
        { label: '近いかもしれない表（名前は一致しません）', kind: vscode.QuickPickItemKind.Separator },
        ...(result.nearMisses ?? []).map((candidate) => ({
          label: `$(question) ${candidate.region.title ?? candidate.region.sheet}`,
          description: `${candidate.region.bookStem} / ${candidate.region.sheet} ${candidate.region.a1}`,
          detail: candidate.explanation,
          parts: parseEmbedParts(candidate.markdown),
          alwaysShow: true,
        })),
      ]
    : [];
  return [
    { label: `${icon} ${head}`, detail: result.reasons.join(' '), alwaysShow: true },
    ...near,
    ...QUERY_EXAMPLES.map((example) => ({ label: `$(lightbulb) ${example}`, description: '入力例', example, alwaysShow: true })),
  ];
}
