import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

import { imageCandidates, readExcelImages } from '../adapters/excelImageAdapter.js';
import { extractImages } from '../cli/extract.js';
import { candidateLedgerView, type CandidateLedgerFilter } from '../core/candidateLedgerView.js';
import { readLedger } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';

export const REVIEW_CANDIDATES_COMMAND_ID = 'markdownMatrixInjector.reviewCandidates';

const FILTERS: readonly { value: CandidateLedgerFilter; label: string; description: string }[] = [
  { value: 'unimported', label: '未取込のみ', description: '未取込と、別の場所に同じ内容がある候補' },
  { value: 'exclude-imported', label: '確認が必要', description: '取込済み以外（変更・再確認・重複・未取込）' },
  { value: 'all', label: 'すべて', description: '取込済みを含む全Candidate' },
];

function workspaceRoot(sourcePath: string): string {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourcePath))?.uri.fsPath ?? path.dirname(sourcePath);
}

async function chooseSource(target?: vscode.Uri): Promise<string | undefined> {
  if (target?.scheme === 'file' && /\.(xlsx|xlsm)$/iu.test(target.fsPath)) return target.fsPath;
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    filters: { 'Excel workbook': ['xlsx', 'xlsm'] },
    title: 'MMI: Candidateを確認するExcelを選択',
  });
  return picked?.[0]?.fsPath;
}

function stateLabel(state: string): string {
  switch (state) {
    case 'imported': return '取込済み';
    case 'changed': return '変更あり';
    case 'stale': return '再確認';
    case 'duplicate': return '同内容あり';
    default: return '未取込';
  }
}

export async function reviewCandidates(target?: vscode.Uri): Promise<void> {
  const sourcePath = await chooseSource(target);
  if (!sourcePath) return;
  const root = workspaceRoot(sourcePath);
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const read = readExcelImages(fs.readFileSync(sourcePath));
  const errors = read.diagnostics.filter((item) => item.severity === 'error');
  if (errors.length > 0) {
    await vscode.window.showErrorMessage(`MMI: Candidateを読み取れません: ${errors.map((item) => item.message).join(' / ')}`);
    return;
  }
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const sourceLabel = path.relative(root, sourcePath).split(path.sep).join('/') || path.basename(sourcePath);
  const candidates = imageCandidates({ source: sourceLabel, sourceDigest, images: read.images });
  const ledger = readLedger(ledgerPath);

  const filterChoice = await vscode.window.showQuickPick(FILTERS, {
    title: 'MMI: Candidateレビュー', placeHolder: '表示するCandidateを選択',
  });
  if (!filterChoice) return;
  const view = candidateLedgerView(candidates, ledger, ledgerPath, sourcePath, filterChoice.value);
  if (view.length === 0) {
    await vscode.window.showInformationMessage('MMI: 条件に合う画像Candidateはありません。');
    return;
  }

  const picked = await vscode.window.showQuickPick(view.map((item) => {
    const image = read.images[candidates.indexOf(item.candidate)];
    const inferred = item.candidate.claims.filter((claim) => claim.status === 'inferred');
    return {
      label: `$(file-media) ${image.description ?? image.name ?? `画像 ${image.ordinal}`}`,
      description: `${stateLabel(item.ledgerState)} · ${image.sheet}${image.range ? ` ${image.range}` : ''}`,
      detail: [
        `observed + deterministic · ${image.format.toUpperCase()} · ${image.bytes} bytes`,
        inferred.length > 0 ? `推定: ${inferred.map((claim) => `${claim.aspect}=${String(claim.value)}`).join(', ')}` : '推定なし',
        item.researchScores.length > 0
          ? `provider evidence: ${item.researchScores.map((score) => `${score.provider}/${score.scale}=${score.value}`).join(', ')}`
          : 'provider scoreなし',
      ].join(' · '),
      image,
    };
  }), {
    title: 'MMI: Candidateレビュー',
    placeHolder: '取り込む画像Candidateを選択（閉じても編集は継続できます）',
    matchOnDescription: true, matchOnDetail: true,
  });
  if (!picked) return;
  if (!picked.image.extractable) {
    await vscode.window.showWarningMessage(`MMI: ${picked.image.format} はMarkdownへ取り込めません。Candidateは確認のみです。`);
    return;
  }

  const action = await vscode.window.showQuickPick([
    { label: '取り込む', value: 'extract' as const, description: '既存のextract経路でassetsと台帳へ記録' },
    { label: '保留', value: 'defer' as const, description: '何も変更せずレビューを閉じる' },
  ], { title: 'MMI: Candidateの扱い', placeHolder: '原本は変更しません' });
  if (!action || action.value === 'defer') return;

  const active = vscode.window.activeTextEditor;
  const markdownDocument = active?.document.languageId === 'markdown' ? active.document.uri.fsPath : undefined;
  const result = extractImages({
    sourcePath, selection: String(picked.image.ordinal), outDir: path.join(root, 'assets'),
    ...(markdownDocument ? { fromDocument: markdownDocument } : {}),
    sourceLabel, ledgerPath,
  });
  if (result.problems.length > 0 || result.extracted.length !== 1) {
    await vscode.window.showErrorMessage(`MMI: 取り込みに失敗しました: ${result.problems.map((problem) => problem.message).join(' / ')}`);
    return;
  }

  const extracted = result.extracted[0];
  if (active?.document.languageId === 'markdown') {
    const insert = await vscode.window.showQuickPick([
      { label: 'Markdownにも挿入', value: true, description: '現在のカーソル位置へ画像参照とprovenanceを挿入' },
      { label: 'assetsへの取り込みだけ', value: false, description: '本文は変更しない' },
    ], { title: 'MMI: 取り込み完了' });
    if (insert?.value) await active.edit((edit) => edit.insert(active.selection.active, `${extracted.markdown}\n`));
  }
  await vscode.window.showInformationMessage(`MMI: ${path.relative(root, extracted.file)} に取り込み、mmi-ledger.jsonへ記録しました。`);
}
