import path from 'node:path';
import * as vscode from 'vscode';

import {
  buildCandidateReviewInventory,
  type CandidateReviewInventoryItem,
  type CandidateReviewInventoryOptions,
} from '../application/candidateReviewInventory.js';
import {
  availableCandidateReviewFacets,
  candidateReviewFacetFilter,
  type CandidateReviewFacetSelection,
} from '../application/candidateReviewFilter.js';
import {
  addCandidateReviewAdjustment,
  appendCandidateReviewObservation,
  candidateReviewObservationSnapshot,
  createCandidateReviewObservation,
  DEFAULT_CANDIDATE_REVIEW_OBSERVATION_FILE,
  emptyCandidateReviewAdjustmentSummary,
} from '../application/candidateReviewObservation.js';
import {
  candidateReviewSessionKey,
  remainingCandidateReviewItems,
} from '../application/candidateReviewSession.js';
import {
  discardUnrecordedImageExtraction,
  discardUnrecordedTableExtraction,
  extractImages,
  extractTable,
  finalizeReviewedImageExtraction,
  finalizeReviewedTableExtraction,
} from '../cli/extract.js';
import {
  extractFlatTextTree,
  extractJsonTree,
  extractTabularHierarchyTree,
  extractXmlTree,
} from '../cli/extractTree.js';
import type {
  TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate, ReviewState } from '../core/candidate.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import type { CandidateLedgerFilter } from '../core/candidateLedgerView.js';
import {
  clearReviewDecisionForCandidate,
  DEFAULT_REVIEW_DECISIONS_FILE,
  readReviewDecisions,
  recordDeferredDecision,
  recordRejectedDecision,
} from '../core/candidateReviewDecisions.js';
import { candidateReviewView } from '../core/candidateReviewView.js';
import { placeOf, readLedger } from '../core/importLedger.js';

export const REVIEW_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewCandidates';
export const REVIEW_HIERARCHY_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewHierarchyCandidates';

const FILTERS: readonly {
  value: CandidateLedgerFilter;
  label: string;
  description: string;
}[] = [
  {
    value: 'unimported',
    label: '未取込のみ',
    description: '未取込と、別の場所に同じ内容がある候補',
  },
  {
    value: 'exclude-imported',
    label: '確認が必要',
    description: '取込済み以外（変更・再確認・重複・未取込）',
  },
  {
    value: 'all',
    label: 'すべて',
    description: '取込済みを含む全Candidate',
  },
];

interface CandidateFacetQuickPickItem extends vscode.QuickPickItem {
  facet: CandidateReviewFacetSelection;
}

function facetLabel(facet: CandidateReviewFacetSelection): string {
  if (facet.axis === 'kind') {
    switch (facet.value) {
      case 'table-range':
        return '$(table) 種別: 表';
      case 'image':
        return '$(file-media) 種別: 画像';
      case 'tree':
        return '$(list-tree) 種別: ツリー';
      default:
        return `種別: ${facet.value}`;
    }
  }
  if (facet.axis === 'status') {
    switch (facet.value) {
      case 'observed':
        return '由来: observed（原本に明示）';
      case 'inferred':
        return '由来: inferred（推定）';
      case 'abstained':
        return '由来: abstained（主張せず）';
    }
  }
  return facet.value === 'deterministic'
    ? '実行: deterministic（決定論）'
    : '実行: provider-dependent（provider依存）';
}

function facetDescription(
  facet: CandidateReviewFacetSelection,
): string {
  switch (facet.axis) {
    case 'kind':
      return 'Candidate type';
    case 'status':
      return 'origin / epistemic state';
    case 'execution':
      return 'execution characteristic';
  }
}

function facetQuickPickItem(
  facet: CandidateReviewFacetSelection,
): CandidateFacetQuickPickItem {
  return {
    label: facetLabel(facet),
    description: facetDescription(facet),
    facet,
  };
}

function workspaceRoot(sourcePath: string): string {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourcePath))
    ?.uri.fsPath ?? path.dirname(sourcePath);
}

function reviewObservationFile(sourcePath: string): string | undefined {
  const uri = vscode.Uri.file(sourcePath);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;

  const enabled = vscode.workspace
    .getConfiguration('markdownMatrixInjector', uri)
    .get<boolean>('reviewObservation.enabled', false);
  return enabled
    ? path.join(
        folder.uri.fsPath,
        DEFAULT_CANDIDATE_REVIEW_OBSERVATION_FILE,
      )
    : undefined;
}

function supportedReviewSource(sourcePath: string): boolean {
  return /\.(xlsx|xlsm|csv|xml|json|txt|text|log)$/iu.test(sourcePath);
}

async function chooseSource(target?: vscode.Uri): Promise<string | undefined> {
  if (
    target?.scheme === 'file'
    && supportedReviewSource(target.fsPath)
  ) {
    return target.fsPath;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MMI source': [
        'xlsx',
        'xlsm',
        'csv',
        'xml',
        'json',
        'txt',
        'text',
        'log',
      ],
    },
    title: 'MMI: Candidateを確認するsourceを選択',
  });
  return picked?.[0]?.fsPath;
}

function supportedHierarchyReviewSource(sourcePath: string): boolean {
  return /\.(xlsx|xlsm|csv|xml)$/iu.test(sourcePath);
}

async function chooseHierarchySource(
  target?: vscode.Uri,
): Promise<string | undefined> {
  if (
    target?.scheme === 'file'
    && supportedHierarchyReviewSource(target.fsPath)
  ) {
    return target.fsPath;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MMI hierarchy source': ['xlsx', 'xlsm', 'csv', 'xml'],
    },
    title: 'MMI: 階層Candidateを確認するsourceを選択',
  });
  return picked?.[0]?.fsPath;
}

interface HeaderChoice extends vscode.QuickPickItem {
  header: string;
}

function uniqueHeaderChoices(
  sheet: ReturnType<typeof loadWorkbook>['sheets'][string],
): HeaderChoice[] {
  const range = sheet.usedRange;
  if (!range) return [];
  const values: Array<{ header: string; column: number }> = [];
  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const header = sheet.cellAt(range.startRow, column)?.text.trim() ?? '';
    if (header) values.push({ header, column });
  }
  const counts = new Map<string, number>();
  for (const item of values) {
    counts.set(item.header, (counts.get(item.header) ?? 0) + 1);
  }
  return values
    .filter((item) => counts.get(item.header) === 1)
    .map((item) => ({
      label: item.header,
      description: `列 ${columnName(item.column)}`,
      header: item.header,
    }));
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

async function chooseHierarchyConfig(
  sourcePath: string,
): Promise<
  | {
      sheet: string;
      config: TabularHierarchyConfig;
    }
  | undefined
> {
  let workbook: ReturnType<typeof loadWorkbook>;
  try {
    workbook = loadWorkbook({ absolutePath: sourcePath });
  } catch (error) {
    await vscode.window.showErrorMessage(
      `MMI: このsourceは表形式の階層レビューに使えません: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }

  const sheetNames = Object.keys(workbook.sheets);
  if (sheetNames.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: 階層Candidateを作れるシートがありません。',
    );
    return undefined;
  }

  const sheet = sheetNames.length === 1
    ? sheetNames[0]
    : (await vscode.window.showQuickPick(
        sheetNames.map((name) => ({ label: name, sheet: name })),
        {
          placeHolder: '階層として確認するシートを選択',
          title: 'MMI: 階層Candidate',
        },
      ))?.sheet;
  if (!sheet) return undefined;

  const headers = uniqueHeaderChoices(workbook.sheets[sheet]);
  if (headers.length < 2) {
    await vscode.window.showInformationMessage(
      'MMI: 一意に指定できる見出しが2列以上ありません。重複見出しは階層列として推測しません。',
    );
    return undefined;
  }

  const mode = await vscode.window.showQuickPick(
    [
      {
        label: '親ID列で階層を指定',
        description: 'ID列と親ID列を明示して親子関係を作る',
        mode: 'parent-id' as const,
      },
      {
        label: 'Level列で階層を指定',
        description: 'Level列と表示名列を明示して親子関係を作る',
        mode: 'level' as const,
      },
    ],
    {
      placeHolder: '階層の表現方法を選択',
      title: 'MMI: 階層Candidate',
    },
  );
  if (!mode) return undefined;

  if (mode.mode === 'parent-id') {
    const id = await vscode.window.showQuickPick(headers, {
      placeHolder: 'ID列を選択',
      title: 'MMI: 階層Candidate',
    });
    if (!id) return undefined;
    const parent = await vscode.window.showQuickPick(
      headers.filter((item) => item.header !== id.header),
      {
        placeHolder: '親ID列を選択',
        title: 'MMI: 階層Candidate',
      },
    );
    if (!parent) return undefined;

    const label = await vscode.window.showQuickPick(
      [
        {
          label: '(ID列を表示名として使う)',
          description: '表示名列を別に指定しない',
          header: undefined as string | undefined,
        },
        ...headers
          .filter(
            (item) =>
              item.header !== id.header
              && item.header !== parent.header,
          )
          .map((item) => ({
            ...item,
            header: item.header as string | undefined,
          })),
      ],
      {
        placeHolder: '表示名列を選択（省略可）',
        title: 'MMI: 階層Candidate',
      },
    );
    if (!label) return undefined;

    return {
      sheet,
      config: {
        mode: 'parent-id',
        idHeader: id.header,
        parentHeader: parent.header,
        ...(label.header ? { labelHeader: label.header } : {}),
      },
    };
  }

  const level = await vscode.window.showQuickPick(headers, {
    placeHolder: 'Level列を選択',
    title: 'MMI: 階層Candidate',
  });
  if (!level) return undefined;
  const label = await vscode.window.showQuickPick(
    headers.filter((item) => item.header !== level.header),
    {
      placeHolder: '表示名列を選択',
      title: 'MMI: 階層Candidate',
    },
  );
  if (!label) return undefined;

  return {
    sheet,
    config: {
      mode: 'level',
      levelHeader: level.header,
      labelHeader: label.header,
    },
  };
}

function stateLabel(state: string): string {
  switch (state) {
    case 'imported':
      return '取込済み';
    case 'changed':
      return '変更あり';
    case 'stale':
      return '再確認';
    case 'duplicate':
      return '同内容あり';
    default:
      return '未取込';
  }
}

function reviewStateLabel(
  state: Extract<
    ReviewState,
    'unreviewed' | 'accepted' | 'modified' | 'rejected' | 'deferred'
  >,
): string {
  switch (state) {
    case 'accepted':
      return 'accepted（採用済み）';
    case 'modified':
      return 'modified（修正採用）';
    case 'rejected':
      return 'rejected（却下済み）';
    case 'deferred':
      return 'deferred（保留中）';
    case 'unreviewed':
      return 'unreviewed（未採用）';
  }
}

function epistemicDetail(candidate: Candidate): string {
  const inferred = candidate.claims.filter(
    (claim) => claim.status === 'inferred',
  );
  return [
    `由来: ${candidate.status} · 実行: ${candidate.execution} · 方法: ${candidate.method}`,
    inferred.length > 0
      ? `推定: ${inferred
          .map((claim) =>
            `${claim.aspect}=${Array.isArray(claim.value)
              ? claim.value.join(', ')
              : String(claim.value ?? '')}`)
          .join(', ')}`
      : '推定なし',
  ].join(' · ');
}

function quickPickItem(
  source: CandidateReviewInventoryItem,
  ledgerState: string,
  reviewState: Extract<
    ReviewState,
    'unreviewed' | 'accepted' | 'modified' | 'rejected' | 'deferred'
  >,
  rejected: boolean,
  deferred: boolean,
  researchScores: readonly {
    provider: string;
    scale: string;
    value: number;
  }[],
) {
  const providerEvidence = researchScores.length > 0
    ? `provider evidence: ${researchScores
        .map((score) =>
          `${score.provider}/${score.scale}=${score.value}`)
        .join(', ')}`
    : 'provider scoreなし';

  if (source.kind === 'tree') {
    const pointer = source.pointer || '(root)';
    return {
      label: `$(list-tree) ${pointer}`,
      description:
        `${stateLabel(ledgerState)} · 採用: ${reviewStateLabel(reviewState)} · ${source.format.toUpperCase()} Tree${source.method ? ` · ${source.method}` : ''}`,
      detail: [
        epistemicDetail(source.candidate),
        `${source.nodeType} · ${source.childCount} children · ${source.leafCount} scalar children`,
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  if (source.kind === 'image') {
    const image = source.image;
    return {
      label:
        `$(file-media) ${image.description
          ?? image.name
          ?? `画像 ${image.ordinal}`}`,
      description:
        `${stateLabel(ledgerState)} · 採用: ${reviewStateLabel(reviewState)} · ${image.sheet}${image.range
          ? ` ${image.range}`
          : ''}`,
      detail: [
        epistemicDetail(source.candidate),
        `${image.format.toUpperCase()} · ${image.bytes} bytes`,
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  return {
    label:
      `$(table) ${source.title ?? `${source.sheet} ${source.range}`}`,
    description:
      `${stateLabel(ledgerState)} · 採用: ${reviewStateLabel(reviewState)} · ${source.sheet} ${source.range}`,
    detail: [
      epistemicDetail(source.candidate),
      providerEvidence,
    ].join(' · '),
    source,
    rejected,
    deferred,
    reviewState,
    ledgerState,
  };
}

interface ReviewCandidatesOptions {
  inventory?: CandidateReviewInventoryOptions;
}

export async function reviewHierarchyCandidates(
  target?: vscode.Uri,
): Promise<void> {
  const sourcePath = await chooseHierarchySource(target);
  if (!sourcePath) return;
  const hierarchy = await chooseHierarchyConfig(sourcePath);
  if (!hierarchy) return;
  await reviewCandidates(
    vscode.Uri.file(sourcePath),
    {
      inventory: {
        tabularHierarchy: hierarchy,
        hierarchyOnly: true,
      },
    },
  );
}

export async function reviewCandidates(
  target?: vscode.Uri,
  options: ReviewCandidatesOptions = {},
): Promise<void> {
  const sourcePath = await chooseSource(target);
  if (!sourcePath) return;

  const root = workspaceRoot(sourcePath);
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const reviewDecisionsPath = path.join(
    root,
    DEFAULT_REVIEW_DECISIONS_FILE,
  );
  const sourceLabel =
    path.relative(root, sourcePath).split(path.sep).join('/')
    || path.basename(sourcePath);

  let inventory;
  try {
    inventory = buildCandidateReviewInventory(
      sourcePath,
      sourceLabel,
      options.inventory,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      `MMI: Candidateを読み取れません: ${error instanceof Error
        ? error.message
        : String(error)}`,
    );
    return;
  }

  const imageErrors = inventory.imageDiagnostics.filter(
    (item) => item.severity === 'error',
  );
  if (imageErrors.length > 0) {
    await vscode.window.showWarningMessage(
      `MMI: 画像Candidateの一部を読み取れません: ${imageErrors
        .map((item) => item.message)
        .join(' / ')}。利用できる他のCandidateは引き続き確認できます。`,
    );
  }

  if (inventory.items.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: このsourceにはレビュー可能なCandidateがありません。',
    );
    return;
  }

  const byKey = new Map(
    inventory.items.map((item) => [candidateReviewSessionKey(item.candidate), item]),
  );
  let ledger: ReturnType<typeof readLedger>;
  let reviewDecisions: ReturnType<typeof readReviewDecisions>;
  try {
    ledger = readLedger(ledgerPath);
    reviewDecisions = readReviewDecisions(reviewDecisionsPath);
  } catch (error) {
    await vscode.window.showErrorMessage(
      `MMI: レビュー状態を読み取れません: ${error instanceof Error
        ? error.message
        : String(error)}`,
    );
    return;
  }

  const filterChoice = await vscode.window.showQuickPick(FILTERS, {
    title: 'MMI: Candidateレビュー',
    placeHolder: '表示するCandidateを選択',
  });
  if (!filterChoice) return;

  const initialView = candidateReviewView(
    inventory.items.map((item) => item.candidate),
    ledger,
    reviewDecisions,
    ledgerPath,
    reviewDecisionsPath,
    sourcePath,
    filterChoice.value,
  );
  if (initialView.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: 条件に合うCandidateはありません。',
    );
    return;
  }

  const facetOptions = availableCandidateReviewFacets(
    initialView.map((item) => item.candidate),
  ).map(facetQuickPickItem);
  const selectedFacets = await vscode.window.showQuickPick(
    facetOptions,
    {
      canPickMany: true,
      title: 'MMI: Candidateレビュー — 絞り込み',
      placeHolder:
        '必要な条件だけ選択（同じ軸はOR、軸間はAND、未選択の軸はすべて）',
      matchOnDescription: true,
    },
  );
  if (selectedFacets === undefined) return;

  const facetFilter = candidateReviewFacetFilter(
    selectedFacets.map((item) => item.facet),
  );
  const processedKeys = new Set<string>();
  const sessionMarkdownEditor =
    vscode.window.activeTextEditor?.document.languageId === 'markdown'
    && vscode.window.activeTextEditor.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor
      : undefined;
  const observationFile = reviewObservationFile(sourcePath);
  const observationStartedAtUtc = new Date().toISOString();
  const observationInitial = observationFile
    ? candidateReviewObservationSnapshot(
        initialView,
        facetFilter,
      )
    : undefined;
  let selectedCount = 0;
  let reviewAdjustments = emptyCandidateReviewAdjustmentSummary();

  try {
  for (;;) {
    try {
      ledger = readLedger(ledgerPath);
      reviewDecisions = readReviewDecisions(reviewDecisionsPath);
    } catch (error) {
      await vscode.window.showErrorMessage(
        `MMI: レビュー状態を再読み込みできません: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
      return;
    }

    const view = candidateReviewView(
      inventory.items.map((item) => item.candidate),
      ledger,
      reviewDecisions,
      ledgerPath,
      reviewDecisionsPath,
      sourcePath,
      filterChoice.value,
    );
    const filteredView = remainingCandidateReviewItems(
      view,
      facetFilter,
      processedKeys,
    );
    if (filteredView.length === 0) {
      await vscode.window.showInformationMessage(
        processedKeys.size > 0
          ? 'MMI: この条件のCandidateレビューが完了しました。'
          : 'MMI: 絞り込み条件に合うCandidateはありません。',
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      filteredView.flatMap((item) => {
      const source = byKey.get(candidateReviewSessionKey(item.candidate));
      return source
        ? [
            quickPickItem(
              source,
              item.ledgerState,
              item.reviewState,
              item.rejected,
              item.deferred,
              item.researchScores,
            ),
          ]
        : [];
    }),
      {
        title: 'MMI: Candidateレビュー',
        placeHolder:
          `Candidateを選択（残り${filteredView.length}件。Escでレビューを終了）`,
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!picked) return;
    selectedCount += 1;

  if (
    picked.source.kind === 'image'
    && !picked.source.image.extractable
  ) {
    await vscode.window.showWarningMessage(
      `MMI: ${picked.source.image.format} はMarkdownへ取り込めません。Candidateは確認のみです。`,
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  const action = await vscode.window.showQuickPick(
    [
      {
        label: '取り込む',
        value: 'extract' as const,
        description: '既存のextract経路で標準資産と台帳へ記録',
      },
      ...(picked.source.kind === 'tree'
        ? [{
            label: '確認のみで次へ',
            value: 'next' as const,
            description: 'Treeを取り込まず、確認だけして次へ進む',
          }]
        : []),
      ...(picked.source.kind === 'table'
        ? [{
            label: '修正して取り込む',
            value: 'extract-modified' as const,
            description:
              '抽出したMarkdown表を編集し、修正版として台帳へ記録',
          }]
        : picked.source.kind === 'image'
          ? [{
              label: '説明を修正して取り込む',
              value: 'extract-modified-image' as const,
              description:
                '画像bytesは変えず、alt textを人手修正して台帳へ記録',
            }]
          : []),
      ...(picked.ledgerState === 'imported'
        ? []
        : [
            ...(picked.rejected
              ? [{
                  label: '却下を解除',
                  value: 'clear-decision' as const,
                  description: 'このCandidateを再び通常レビューへ戻す',
                }]
              : picked.deferred
                ? [{
                    label: '保留を解除',
                    value: 'clear-decision' as const,
                    description: 'このCandidateを再び通常レビューへ戻す',
                  }]
                : [
                    {
                      label: '却下',
                      value: 'reject' as const,
                      description:
                        '同じ内容・根拠のCandidateは変更されるまで表示しない',
                    },
                    {
                      label: '保留',
                      value: 'defer' as const,
                      description:
                        '同じ内容・根拠のCandidateを通常レビューから一時的に外す',
                    },
                  ]),
          ]),
    ],
    {
      title: 'MMI: Candidateの扱い',
      placeHolder: '原本は変更しません',
    },
  );
  if (!action) continue;

  if (action.value === 'next') {
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  if (action.value === 'reject' || action.value === 'defer') {
    try {
      if (action.value === 'reject') {
        recordRejectedDecision(
          reviewDecisionsPath,
          sourcePath,
          picked.source.candidate,
          'MMI Candidate review UI',
        );
      } else {
        recordDeferredDecision(
          reviewDecisionsPath,
          sourcePath,
          picked.source.candidate,
          'MMI Candidate review UI',
        );
      }
    } catch (error) {
      await vscode.window.showErrorMessage(
        `MMI: ${action.value === 'reject' ? '却下' : '保留'}状態を保存できません: `
          + (error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    await vscode.window.showInformationMessage(
      action.value === 'reject'
        ? 'MMI: Candidateを却下しました。内容または判断根拠が変われば再表示されます。'
        : 'MMI: Candidateを保留しました。通常レビューから外れますが、すべて表示から解除できます。',
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  if (action.value === 'clear-decision') {
    try {
      clearReviewDecisionForCandidate(
        reviewDecisionsPath,
        sourcePath,
        picked.source.candidate,
      );
    } catch (error) {
      await vscode.window.showErrorMessage(
        'MMI: レビュー状態を解除できません: '
          + (error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    await vscode.window.showInformationMessage(
      'MMI: Candidateのレビュー状態を解除しました。',
    );
    continue;
  }

  const active = sessionMarkdownEditor;
  const markdownDocument =
    active?.document.languageId === 'markdown'
      ? active.document.uri.fsPath
      : undefined;
  const outDir = path.join(root, 'assets');

  let extractedMarkdown: string;
  let extractedFile: string;
  if (
    action.value === 'extract-modified-image'
    && picked.source.kind === 'image'
  ) {
    const draft = extractImages({
      sourcePath,
      selection: String(picked.source.image.ordinal),
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
    });
    if (
      draft.problems.length > 0
      || draft.extracted.length !== 1
    ) {
      await vscode.window.showErrorMessage(
        `MMI: 修正用の画像参照を作成できません: ${draft.problems
          .map((problem) => problem.message)
          .join(' / ') || '画像を一意に抽出できませんでした'}`,
      );
      return;
    }

    const draftImage = draft.extracted[0];
    const editedAltText = await vscode.window.showInputBox({
      title: 'MMI: 画像の説明を修正',
      prompt:
        '画像bytesと原本は変更しません。Markdownのalt textだけを編集します。',
      value: draftImage.altText,
      placeHolder: '画像の説明',
    });
    if (editedAltText === undefined) {
      discardUnrecordedImageExtraction(draftImage);
      continue;
    }

    const finalized = finalizeReviewedImageExtraction({
      sourcePath,
      ledgerPath,
      extracted: draftImage,
      candidate: picked.source.candidate,
      altText: editedAltText,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      basis: 'MMI Candidate review UI: reviewed image alt text',
    });
    if (finalized.problems.length > 0 || !finalized.extracted) {
      discardUnrecordedImageExtraction(draftImage);
      await vscode.window.showErrorMessage(
        `MMI: 画像の修正版を採用できません: ${finalized.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }
    if (finalized.extracted.reviewState === 'modified') {
      reviewAdjustments = addCandidateReviewAdjustment(
        reviewAdjustments,
        'imageAlt',
        finalized.extracted.reviewAdjustment,
      );
    }
    extractedMarkdown = finalized.extracted.markdown;
    extractedFile = finalized.extracted.file;
  } else if (
    action.value === 'extract-modified'
    && picked.source.kind === 'table'
  ) {
    const draft = extractTable({
      sourcePath,
      sheet: picked.source.sheet,
      range: picked.source.range,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
    });
    if (draft.problems.length > 0 || !draft.extracted) {
      await vscode.window.showErrorMessage(
        `MMI: 修正用の表を作成できません: ${draft.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }

    const reviewDocument = await vscode.workspace.openTextDocument({
      content: draft.extracted.markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(
      reviewDocument,
      { preview: false },
    );
    const reviewAction = await vscode.window.showInformationMessage(
      'MMI: 表を必要な形へ修正してください。完了後に「修正内容を採用」を選ぶと、原本を変えずに修正版とprovenanceを記録します。',
      '修正内容を採用',
      'キャンセル',
    );
    if (reviewAction !== '修正内容を採用') {
      discardUnrecordedTableExtraction(draft.extracted);
      continue;
    }

    const finalized = finalizeReviewedTableExtraction({
      sourcePath,
      outDir,
      ledgerPath,
      extracted: draft.extracted,
      editedMarkdown: reviewDocument.getText(),
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      basis: 'MMI Candidate review UI: reviewed table output',
    });
    if (finalized.problems.length > 0 || !finalized.extracted) {
      discardUnrecordedTableExtraction(draft.extracted);
      await vscode.window.showErrorMessage(
        `MMI: 修正版を採用できません: ${finalized.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }
    if (finalized.extracted.reviewState === 'modified') {
      reviewAdjustments = addCandidateReviewAdjustment(
        reviewAdjustments,
        'table',
        finalized.extracted.reviewAdjustment,
      );
    }
    extractedMarkdown = finalized.extracted.markdown;
    extractedFile = finalized.extracted.file;
  } else if (picked.source.kind === 'image') {
    const result = extractImages({
      sourcePath,
      selection: String(picked.source.image.ordinal),
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
    });
    if (
      result.problems.length > 0
      || result.extracted.length !== 1
    ) {
      await vscode.window.showErrorMessage(
        `MMI: 取り込みに失敗しました: ${result.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }
    extractedMarkdown = result.extracted[0].markdown;
    extractedFile = result.extracted[0].file;
  } else if (picked.source.kind === 'tree') {
    const commonTreeOptions = {
      sourcePath,
      pointer: picked.source.pointer,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
      expectedCandidateFingerprint:
        picked.source.candidate.fingerprint.digest,
    };
    const result = picked.source.format === 'tabular'
      ? extractTabularHierarchyTree({
          ...commonTreeOptions,
          sheet: picked.source.sheet!,
          config: picked.source.tabularHierarchy!,
        })
      : picked.source.format === 'xml'
        ? extractXmlTree(commonTreeOptions)
        : picked.source.format === 'text'
          ? extractFlatTextTree(commonTreeOptions)
          : extractJsonTree(commonTreeOptions);
    if (result.problems.length > 0 || !result.extracted) {
      await vscode.window.showErrorMessage(
        `MMI: 取り込みに失敗しました: ${result.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }
    extractedMarkdown = result.extracted.markdown;
    extractedFile = result.extracted.file;
  } else {
    const result = extractTable({
      sourcePath,
      sheet: picked.source.sheet,
      range: picked.source.range,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
    });
    if (result.problems.length > 0 || !result.extracted) {
      await vscode.window.showErrorMessage(
        `MMI: 取り込みに失敗しました: ${result.problems
          .map((problem) => problem.message)
          .join(' / ')}`,
      );
      return;
    }
    extractedMarkdown = result.extracted.markdown;
    extractedFile = result.extracted.file;
  }

  try {
    clearReviewDecisionForCandidate(
      reviewDecisionsPath,
      sourcePath,
      picked.source.candidate,
    );
  } catch (error) {
    await vscode.window.showWarningMessage(
      'MMI: 取り込みは完了しましたが、旧いレビュー状態を消去できません: '
        + (error instanceof Error ? error.message : String(error)),
    );
  }

  if (active?.document.languageId === 'markdown') {
    const kindLabel =
      picked.source.kind === 'image'
        ? '画像参照'
        : picked.source.kind === 'tree'
          ? 'Markdownツリー'
          : 'Markdown表';
    const insert = await vscode.window.showQuickPick(
      [
        {
          label: 'Markdownにも挿入',
          value: true,
          description:
            `現在のカーソル位置へ${kindLabel}とprovenanceを挿入`,
        },
        {
          label: '標準資産への取り込みだけ',
          value: false,
          description: '本文は変更しない',
        },
      ],
      {
        title: 'MMI: 取り込み完了',
      },
    );
    if (insert?.value) {
      const targetEditor = await vscode.window.showTextDocument(
        active.document,
        active.viewColumn,
      );
      const insertAt = targetEditor.selection.active;
      const insertedText = `${extractedMarkdown}\n`;
      const edited = await targetEditor.edit((edit) =>
        edit.insert(insertAt, insertedText));
      if (edited) {
        const endOffset =
          targetEditor.document.offsetAt(insertAt) + insertedText.length;
        const end = targetEditor.document.positionAt(endOffset);
        targetEditor.selection = new vscode.Selection(end, end);
        targetEditor.revealRange(new vscode.Range(end, end));
      }
    }
  }

  await vscode.window.showInformationMessage(
    `MMI: ${path.relative(root, extractedFile)} に取り込み、mmi-ledger.jsonへ記録しました。`,
  );
  processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
  }
  } finally {
    if (observationFile && observationInitial) {
      try {
        const finalLedger = readLedger(ledgerPath);
        const finalReviewDecisions = readReviewDecisions(
          reviewDecisionsPath,
        );
        const finalView = candidateReviewView(
          inventory.items.map((item) => item.candidate),
          finalLedger,
          finalReviewDecisions,
          ledgerPath,
          reviewDecisionsPath,
          sourcePath,
          'all',
        );
        const observation = createCandidateReviewObservation({
          sourceLabel,
          sourceDigest:
            inventory.items[0].candidate.locator.sourceDigest,
          startedAtUtc: observationStartedAtUtc,
          endedAtUtc: new Date().toISOString(),
          interruptedMarkdownEditing: Boolean(sessionMarkdownEditor),
          ledgerFilter: filterChoice.value,
          facetFilter,
          selectedCount,
          initial: observationInitial,
          final: candidateReviewObservationSnapshot(
            finalView,
            facetFilter,
          ),
          adjustments: reviewAdjustments,
        });
        appendCandidateReviewObservation(
          observationFile,
          observation,
        );
      } catch (error) {
        void vscode.window.showWarningMessage(
          'MMI: Candidateレビューの観測記録を保存できません: '
            + (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  }
}
