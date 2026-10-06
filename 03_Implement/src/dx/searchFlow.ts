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
import * as vscode from 'vscode';

import type { CompileResult } from '../search/nlQuery/compiler.js';
import { QUERY_EXAMPLES } from '../search/workspaceRegionIndex.js';
import { WorkspaceSearchWorkerClient } from '../search/workspaceSearchWorkerClient.js';
import type { SemanticSetting } from '../search/workspaceRegionIndex.js';
import { parseEmbedParts, type EmbedParts } from './embedEditor.js';

/**
 * Experimental, off by default: a local embedding model for descriptions that share no word with a
 * table's name. Returns undefined unless the person turned it on and named a model.
 */
export function readSemanticSetting(): SemanticSetting | undefined {
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  if (config.get<boolean>('search.semantic.enabled', false) !== true) return undefined;
  const model = (config.get<string>('search.semantic.model', '') ?? '').trim();
  if (model === '') return undefined;
  return {
    api: config.get<'ollama' | 'openai-compatible'>('search.semantic.api', 'ollama'),
    endpoint: config.get<string>('search.semantic.endpoint', 'http://127.0.0.1:11434'),
    model,
    minScore: config.get<number>('search.semantic.minScore', 0.6),
    queryPrefix: config.get<string>('search.semantic.queryPrefix', ''),
    documentPrefix: config.get<string>('search.semantic.documentPrefix', ''),
  };
}

export const FIND_EMBED_COMMAND_ID = 'markdownMatrixInjector.findEmbedByDescription';

/** Same cap as the content-match search: bounds the pathological workspace. */
const MAX_INDEXED_FILES = 500;

const indexes = new Map<string, WorkspaceSearchWorkerClient>();

function indexFor(workspaceRoot: string): WorkspaceSearchWorkerClient {
  let index = indexes.get(workspaceRoot);
  if (!index) {
    index = new WorkspaceSearchWorkerClient();
    indexes.set(workspaceRoot, index);
  }
  return index;
}

/** Terminates every worker, dropping its in-memory index and workbook cache. */
export function clearSearchIndexes(): void {
  for (const index of indexes.values()) index.dispose();
  indexes.clear();
}

async function ensureIndexed(workspaceRoot: string, workbookGlob: string): Promise<WorkspaceSearchWorkerClient | undefined> {
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
    let queryRevision = 0;
    let pendingText: string | undefined;
    let queryPump: Promise<void> | undefined;
    const finish = (value: EmbedParts | undefined): void => {
      if (settled) return;
      settled = true;
      queryRevision += 1;
      pendingText = undefined;
      if (timer) clearTimeout(timer);
      resolve(value);
      quickPick.dispose();
    };
    const drainQueries = async (): Promise<void> => {
      try {
        while (!settled && pendingText !== undefined) {
          const text = pendingText;
          const revision = queryRevision;
          pendingText = undefined;
          try {
            const result = await index.query(text, document.uri.fsPath, 5, readSemanticSetting());
            // The running request may finish after newer input arrived. Its
            // result is discarded, and the loop immediately runs only the
            // latest pending text rather than every intermediate keystroke.
            if (!settled && revision === queryRevision) quickPick.items = toItems(result);
          } catch (error) {
            if (!settled && revision === queryRevision) {
              quickPick.items = [{
                label: '$(error) 表の検索に失敗しました',
                detail: error instanceof Error ? error.message : String(error),
                alwaysShow: true,
              }];
            }
          }
        }
      } finally {
        queryPump = undefined;
        if (!settled && pendingText !== undefined) {
          queryPump = drainQueries();
        } else if (!settled) {
          quickPick.busy = false;
        }
      }
    };
    const update = (text: string): void => {
      queryRevision += 1;
      if (!text.trim()) {
        pendingText = undefined;
        quickPick.items = examples();
        if (!queryPump) quickPick.busy = false;
        return;
      }
      pendingText = text;
      quickPick.busy = true;
      if (!queryPump) queryPump = drainQueries();
    };
    quickPick.onDidChangeValue((text) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => update(text), 120);
    });
    quickPick.onDidAccept(() => {
      const chosen = quickPick.activeItems[0];
      if (chosen?.example) {
        quickPick.value = chosen.example;
        // Setting value fires onDidChangeValue as well; cancel that debounce
        // because this explicit selection is searched immediately.
        if (timer) clearTimeout(timer);
        timer = undefined;
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
  const result = await index.query(text, document.uri.fsPath, 5, readSemanticSetting());
  const items = toItems(result);
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
