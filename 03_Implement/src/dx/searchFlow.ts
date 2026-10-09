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

import type { Candidate, CompileResult } from '../search/nlQuery/compiler.js';
import { buildSearchObservation } from '../search/observation/record.js';
import type {
  SearchObservationAlias,
  SearchObservationRecord,
} from '../search/observation/types.js';
import { QUERY_EXAMPLES } from '../search/workspaceRegionIndex.js';
import { withFit } from '../search/fitLabel.js';
import { formatAlias, parseAliasSetting, suggestAlias, type UserAlias } from '../search/userAliases.js';
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
  const artifactDigest = (
    config.get<string>('search.semantic.artifactDigest', '') ?? ''
  ).trim();
  return {
    api: config.get<'ollama' | 'openai-compatible'>('search.semantic.api', 'ollama'),
    endpoint: config.get<string>('search.semantic.endpoint', 'http://127.0.0.1:11434'),
    model,
    ...(artifactDigest ? { expectedArtifactDigest: artifactDigest } : {}),
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
  /** An abbreviation the user may want remembered if they pick this table (ADR-0023). */
  learn?: UserAlias;
  observation?: {
    candidate: Candidate;
    rank: number;
    nearMiss: boolean;
  };
}

export interface SearchObservationHost {
  enabled: boolean;
  includeText: boolean;
  record(record: SearchObservationRecord): void | Promise<void>;
}

const ALIAS_SETTING = 'search.aliases';

function readUserAliases(): UserAlias[] {
  return parseAliasSetting(vscode.workspace.getConfiguration('markdownMatrixInjector').get<unknown[]>(ALIAS_SETTING, []));
}

/** Offers to remember `alias` after the user picked a table the typed name did not match. Saved only on consent. */
async function offerToRemember(alias: UserAlias): Promise<SearchObservationAlias> {
  const remember = '覚える';
  const answer = await vscode.window.showInformationMessage(
    `MMI: 「${alias.short}」を、この表（${alias.long}）の略語として覚えますか？ 次回から「${alias.short}」でも探せます。設定 ${ALIAS_SETTING} に保存します。`,
    remember,
    '今回だけ',
  );
  if (answer !== remember) return 'offered-declined';
  const edited = await vscode.window.showInputBox({
    title: `MMI: 「${alias.short}」の正式名称`,
    prompt: '表の名前に含まれている語で登録します（確認・修正できます）',
    value: alias.long,
  });
  if (edited === undefined) return 'offered-declined';
  const entry = formatAlias({ short: alias.short, long: edited });
  if (parseAliasSetting([entry]).length === 0) {
    void vscode.window.showWarningMessage('MMI: 正式名称は2〜40文字で入力してください。登録しませんでした。');
    return 'offered-declined';
  }
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  const existing = config.get<string[]>(ALIAS_SETTING, []);
  if (existing.includes(entry)) return 'offered-accepted';
  await config.update(ALIAS_SETTING, [...existing, entry], vscode.ConfigurationTarget.Workspace);
  return 'offered-accepted';
}

/**
 * Opens the search box and resolves to the chosen embed's parts, or
 * `undefined` when cancelled. Does not edit anything.
 */
export async function searchEmbedByDescription(
  document: vscode.TextDocument,
  workbookGlob: string,
  observation?: SearchObservationHost,
): Promise<EmbedParts | undefined> {
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
    let activeQueryController: AbortController | undefined;
    const startedAtMs = Date.now();
    let visibleQueries = 0;
    let finalText = '';
    let finalResult: CompileResult | undefined;
    const recordObservation = (
      outcome: 'picked-candidate' | 'picked-near-miss' | 'picked-after-edit' | 'cancelled',
      picked?: ResultItem['observation'],
      alias: SearchObservationAlias = 'none',
    ): void => {
      if (!observation?.enabled || !finalResult || visibleQueries < 1) return;
      try {
        const record = buildSearchObservation({
          finalQuery: finalText,
          result: finalResult,
          queries: visibleQueries,
          outcome,
          ...(picked ? { picked } : {}),
          alias,
          startedAtMs,
          endedAtMs: Date.now(),
          localDate: localCalendarDate(new Date()),
          includeText: observation.includeText,
        });
        void Promise.resolve(observation.record(record)).catch(() => undefined);
      } catch {
        // Observation is deliberately outside the search critical path.
      }
    };
    const finish = (value: EmbedParts | undefined): void => {
      if (settled) return;
      settled = true;
      queryRevision += 1;
      pendingText = undefined;
      if (timer) clearTimeout(timer);
      activeQueryController?.abort();
      activeQueryController = undefined;
      resolve(value);
      quickPick.dispose();
    };
    const drainQueries = async (): Promise<void> => {
      try {
        while (!settled && pendingText !== undefined) {
          const text = pendingText;
          const revision = queryRevision;
          pendingText = undefined;
          const controller = new AbortController();
          activeQueryController = controller;
          try {
            index.setAliases(readUserAliases());
            const result = await index.query(
              text,
              document.uri.fsPath,
              5,
              readSemanticSetting(),
              controller.signal,
            );
            // The running request may finish after newer input arrived. Its
            // result is discarded, and the loop immediately runs only the
            // latest pending text rather than every intermediate keystroke.
            if (!settled && revision === queryRevision) {
              finalText = text;
              finalResult = result;
              visibleQueries += 1;
              quickPick.items = toItems(result);
            }
          } catch (error) {
            if (
              !controller.signal.aborted
              && !settled
              && revision === queryRevision
            ) {
              quickPick.items = [{
                label: '$(error) 表の検索に失敗しました',
                detail: error instanceof Error ? error.message : String(error),
                alwaysShow: true,
              }];
            }
          } finally {
            if (activeQueryController === controller) {
              activeQueryController = undefined;
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
      activeQueryController?.abort();
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
      if (chosen?.parts) {
        const picked = chosen.observation;
        const outcome = picked?.nearMiss
          ? 'picked-near-miss'
          : visibleQueries > 1
            ? 'picked-after-edit'
            : 'picked-candidate';
        finish(chosen.parts);
        if (chosen.learn) {
          void offerToRemember(chosen.learn)
            .then((alias) => recordObservation(outcome, picked, alias))
            .catch(() => recordObservation(outcome, picked));
        } else {
          recordObservation(outcome, picked);
        }
      }
    });
    quickPick.onDidHide(() => {
      // If a newer query is still pending/running, the visible result belongs
      // to an older request. Dropping the observation is safer than binding
      // the wrong classification to the user's final text.
      if (
        !settled
        && pendingText === undefined
        && activeQueryController === undefined
      ) {
        recordObservation('cancelled');
      }
      finish(undefined);
    });
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
  observation?: SearchObservationHost,
): Promise<{ items: string[]; parts?: EmbedParts }> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!workspaceRoot) return { items: [] };
  const index = await ensureIndexed(workspaceRoot, workbookGlob);
  if (!index) return { items: [] };
  index.setAliases(readUserAliases());
  const startedAtMs = Date.now();
  const result = await index.query(text, document.uri.fsPath, 5, readSemanticSetting());
  const items = toItems(result);
  const picked = items[pickIndex];
  // The same recording as the search box, so the e2e run exercises what a person's search records.
  if (observation?.enabled) {
    try {
      const record = buildSearchObservation({
        finalQuery: text,
        result,
        queries: 1,
        outcome: picked?.parts
          ? (picked.observation?.nearMiss ? 'picked-near-miss' : 'picked-candidate')
          : 'cancelled',
        ...(picked?.parts && picked.observation ? { picked: picked.observation } : {}),
        alias: 'none',
        startedAtMs,
        endedAtMs: Date.now(),
        localDate: localCalendarDate(new Date()),
        includeText: observation.includeText,
      });
      void Promise.resolve(observation.record(record)).catch(() => undefined);
    } catch {
      // Observation is deliberately outside the search critical path.
    }
  }
  return { items: items.map((item) => `${item.label} | ${item.detail ?? ''}`), parts: picked?.parts };
}

/** Candidates, or a reason the request cannot be expressed / matched. Always shown regardless of label filtering. */
export function toItems(result: CompileResult): ResultItem[] {
  if (result.status === 'candidates') {
    return result.candidates.map((candidate, index) => ({
      label: `$(table) ${candidate.region.title ?? candidate.region.sheet}`,
      description: withFit(`${candidate.region.bookStem} / ${candidate.region.sheet} ${candidate.region.a1}`, candidate.fit),
      detail: [
        candidate.explanation,
        candidate.region.headers?.length ? `見出し: ${candidate.region.headers.slice(0, 6).join('・')}` : '',
      ]
        .filter(Boolean)
        .join(' ｜ '),
      parts: parseEmbedParts(candidate.markdown),
      observation: { candidate, rank: index + 1, nearMiss: false },
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
        ...(result.nearMisses ?? []).map((candidate, index) => ({
          label: `$(question) ${candidate.region.title ?? candidate.region.sheet}`,
          description: withFit(`${candidate.region.bookStem} / ${candidate.region.sheet} ${candidate.region.a1}`, candidate.fit),
          detail: candidate.explanation,
          parts: parseEmbedParts(candidate.markdown),
          observation: { candidate, rank: index + 1, nearMiss: true },
          alwaysShow: true,
          ...(suggestAlias(result.ir.input, candidate.region) ? { learn: suggestAlias(result.ir.input, candidate.region) } : {}),
        })),
      ]
    : [];
  return [
    { label: `${icon} ${head}`, detail: result.reasons.join(' '), alwaysShow: true },
    ...near,
    ...QUERY_EXAMPLES.map((example) => ({ label: `$(lightbulb) ${example}`, description: '入力例', example, alwaysShow: true })),
  ];
}


function localCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
