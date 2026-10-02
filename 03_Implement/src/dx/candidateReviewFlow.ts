import path from 'node:path';
import * as vscode from 'vscode';

import {
  buildCandidateReviewInventory,
  type CandidateReviewInventoryItem,
} from '../application/candidateReviewInventory.js';
import {
  availableCandidateReviewFacets,
  candidateReviewFacetFilter,
  matchesCandidateReviewFacets,
  type CandidateReviewFacetSelection,
} from '../application/candidateReviewFilter.js';
import { extractImages, extractTable } from '../cli/extract.js';
import type { Candidate } from '../core/candidate.js';
import {
  candidateLedgerView,
  type CandidateLedgerFilter,
} from '../core/candidateLedgerView.js';
import { placeOf, readLedger } from '../core/importLedger.js';

export const REVIEW_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewCandidates';

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
      default:
        return `種別: ${facet.value}`;
    }
  }
  if (facet.axis === 'status') {
    switch (facet.value) {
      case 'observed':
        return '状態: observed（観測）';
      case 'inferred':
        return '状態: inferred（推定）';
      case 'confirmed':
        return '状態: confirmed（確認済み）';
      case 'abstained':
        return '状態: abstained（判断保留）';
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
      return 'epistemic state';
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

function supportedReviewSource(sourcePath: string): boolean {
  return /\.(xlsx|xlsm|csv|xml)$/iu.test(sourcePath);
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
      'MMI source': ['xlsx', 'xlsm', 'csv', 'xml'],
    },
    title: 'MMI: Candidateを確認するsourceを選択',
  });
  return picked?.[0]?.fsPath;
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

function reviewKey(candidate: Candidate): string {
  return [
    candidate.kind,
    candidate.locator.source,
    candidate.locator.sheet ?? '',
    placeOf(candidate),
    candidate.fingerprint.representation,
    candidate.fingerprint.digest,
  ].join('\u0000');
}

function epistemicDetail(candidate: Candidate): string {
  const inferred = candidate.claims.filter(
    (claim) => claim.status === 'inferred',
  );
  return [
    `${candidate.status} + ${candidate.execution} + ${candidate.method}`,
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

  if (source.kind === 'image') {
    const image = source.image;
    return {
      label:
        `$(file-media) ${image.description
          ?? image.name
          ?? `画像 ${image.ordinal}`}`,
      description:
        `${stateLabel(ledgerState)} · ${image.sheet}${image.range
          ? ` ${image.range}`
          : ''}`,
      detail: [
        epistemicDetail(source.candidate),
        `${image.format.toUpperCase()} · ${image.bytes} bytes`,
        providerEvidence,
      ].join(' · '),
      source,
    };
  }

  return {
    label:
      `$(table) ${source.title ?? `${source.sheet} ${source.range}`}`,
    description:
      `${stateLabel(ledgerState)} · ${source.sheet} ${source.range}`,
    detail: [
      epistemicDetail(source.candidate),
      providerEvidence,
    ].join(' · '),
    source,
  };
}

export async function reviewCandidates(target?: vscode.Uri): Promise<void> {
  const sourcePath = await chooseSource(target);
  if (!sourcePath) return;

  const root = workspaceRoot(sourcePath);
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const sourceLabel =
    path.relative(root, sourcePath).split(path.sep).join('/')
    || path.basename(sourcePath);

  let inventory;
  try {
    inventory = buildCandidateReviewInventory(sourcePath, sourceLabel);
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
        .join(' / ')}。利用できる表Candidateは引き続き確認できます。`,
    );
  }

  if (inventory.items.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: このsourceにはレビュー可能なCandidateがありません。',
    );
    return;
  }

  const byKey = new Map(
    inventory.items.map((item) => [reviewKey(item.candidate), item]),
  );
  const ledger = readLedger(ledgerPath);

  const filterChoice = await vscode.window.showQuickPick(FILTERS, {
    title: 'MMI: Candidateレビュー',
    placeHolder: '表示するCandidateを選択',
  });
  if (!filterChoice) return;

  const view = candidateLedgerView(
    inventory.items.map((item) => item.candidate),
    ledger,
    ledgerPath,
    sourcePath,
    filterChoice.value,
  );
  if (view.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: 条件に合うCandidateはありません。',
    );
    return;
  }

  const facetOptions = availableCandidateReviewFacets(
    view.map((item) => item.candidate),
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
  const filteredView = view.filter((item) =>
    matchesCandidateReviewFacets(item.candidate, facetFilter),
  );
  if (filteredView.length === 0) {
    await vscode.window.showInformationMessage(
      'MMI: 絞り込み条件に合うCandidateはありません。',
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(
    filteredView.flatMap((item) => {
      const source = byKey.get(reviewKey(item.candidate));
      return source
        ? [quickPickItem(source, item.ledgerState, item.researchScores)]
        : [];
    }),
    {
      title: 'MMI: Candidateレビュー',
      placeHolder:
        `取り込むCandidateを選択（${filteredView.length}/${view.length}件。閉じても編集は継続できます）`,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) return;

  if (
    picked.source.kind === 'image'
    && !picked.source.image.extractable
  ) {
    await vscode.window.showWarningMessage(
      `MMI: ${picked.source.image.format} はMarkdownへ取り込めません。Candidateは確認のみです。`,
    );
    return;
  }

  const action = await vscode.window.showQuickPick(
    [
      {
        label: '取り込む',
        value: 'extract' as const,
        description: '既存のextract経路で標準資産と台帳へ記録',
      },
      {
        label: '保留',
        value: 'defer' as const,
        description: '何も変更せずレビューを閉じる',
      },
    ],
    {
      title: 'MMI: Candidateの扱い',
      placeHolder: '原本は変更しません',
    },
  );
  if (!action || action.value === 'defer') return;

  const active = vscode.window.activeTextEditor;
  const markdownDocument =
    active?.document.languageId === 'markdown'
      ? active.document.uri.fsPath
      : undefined;
  const outDir = path.join(root, 'assets');

  let extractedMarkdown: string;
  let extractedFile: string;
  if (picked.source.kind === 'image') {
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

  if (active?.document.languageId === 'markdown') {
    const kindLabel =
      picked.source.kind === 'image' ? '画像参照' : 'Markdown表';
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
      await active.edit((edit) =>
        edit.insert(
          active.selection.active,
          `${extractedMarkdown}\n`,
        ));
    }
  }

  await vscode.window.showInformationMessage(
    `MMI: ${path.relative(root, extractedFile)} に取り込み、mmi-ledger.jsonへ記録しました。`,
  );
}
