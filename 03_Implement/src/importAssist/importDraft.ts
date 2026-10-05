/**
 * The import draft: a Markdown skeleton of an existing Excel design document
 * (02_Architecture/import-assistance.md §5). Headings become Markdown
 * headings, tables become MMI references that the preview renders from the
 * source, and everything else is listed where it sits with its address, so
 * the person decides what to move into prose and what to leave out. Table
 * values are never copied into the draft.
 */
import type { WorkbookData } from '../core/workbookLoader.js';
import { analyzeSheetForImport, type ImportAnalysisOptions, type ImportCandidate } from './importCandidates.js';
import { describeDifferenceJa, summarizeLayouts, type LayoutSummary, type SheetCandidates, type SheetRef } from './layoutGroups.js';
import { cellRangeToA1 } from '../core/tableGeometry.js';
import type { DefinedName, WorkbookStructure } from './workbookStructure.js';

export interface ImportDraftAsset {
  ordinal: number;
  sheet: string;
  /** Ordinary Markdown image/reference text already carrying provenance. */
  markdown: string;
}

export interface ImportDraftProblem {
  code: string;
  message: string;
  sheet?: string;
  ordinal?: number;
}

export interface ImportDraftReviewSkip {
  ordinal: number;
  sheet: string;
  name?: string;
  decision: 'rejected' | 'deferred';
  code: 'MMI_IMPORT_REVIEW_REJECTED' | 'MMI_IMPORT_REVIEW_DEFERRED';
  message: string;
}

export interface ImportDraftTableReviewSkip {
  sheet: string;
  range: string;
  title?: string;
  decision: 'rejected' | 'deferred';
  code: 'MMI_IMPORT_REVIEW_REJECTED' | 'MMI_IMPORT_REVIEW_DEFERRED';
  message: string;
}

export interface ImportDraftChoiceList {
  ordinal: number;
  sheet: string;
  range: string;
  sourceKind: 'inline' | 'formula' | 'missing';
  formula1?: string;
  choices?: readonly string[];
  allowBlank: boolean;
}

export interface ImportDraftChoiceListProblem {
  code: string;
  message: string;
  sheet?: string;
}

export interface ImportDraftChoiceListReviewSkip {
  sheet: string;
  range: string;
  decision: 'rejected' | 'deferred';
  code: 'MMI_IMPORT_REVIEW_REJECTED' | 'MMI_IMPORT_REVIEW_DEFERRED';
  message: string;
}

export interface WorkbookImportOptions extends Omit<ImportAnalysisOptions, 'referencePath' | 'workbook'> {
  assets?: readonly ImportDraftAsset[];
  assetProblems?: readonly ImportDraftProblem[];
  reviewSkippedAssets?: readonly ImportDraftReviewSkip[];
  reviewSkippedTables?: readonly ImportDraftTableReviewSkip[];
  choiceLists?: readonly ImportDraftChoiceList[];
  choiceListProblems?: readonly ImportDraftChoiceListProblem[];
  reviewSkippedChoiceLists?: readonly ImportDraftChoiceListReviewSkip[];
}

export interface WorkbookImport {
  /** Display name, usually the file name. */
  book: string;
  /** Path written into references, relative to the draft. */
  referencePath: string;
  sheets: SheetCandidates[];
  structure?: WorkbookStructure;
  assets: ImportDraftAsset[];
  assetProblems: ImportDraftProblem[];
  reviewSkippedAssets: ImportDraftReviewSkip[];
  reviewSkippedTables: ImportDraftTableReviewSkip[];
  choiceLists: ImportDraftChoiceList[];
  choiceListProblems: ImportDraftChoiceListProblem[];
  reviewSkippedChoiceLists: ImportDraftChoiceListReviewSkip[];
}

export function analyzeWorkbookForImport(
  book: string,
  referencePath: string,
  workbook: WorkbookData,
  options: WorkbookImportOptions = {},
): WorkbookImport {
  const {
    assets = [],
    assetProblems = [],
    reviewSkippedAssets = [],
    reviewSkippedTables = [],
    choiceLists = [],
    choiceListProblems = [],
    reviewSkippedChoiceLists = [],
    ...analysisOptions
  } = options;
  const sheets = Object.entries(workbook.sheets).map(([sheet, source]) => ({
    book,
    sheet,
    candidates: analyzeSheetForImport(sheet, source, { ...analysisOptions, referencePath, workbook }),
  }));
  return {
    book,
    referencePath,
    sheets,
    ...(analysisOptions.structure ? { structure: analysisOptions.structure } : {}),
    assets: [...assets],
    assetProblems: [...assetProblems],
    reviewSkippedAssets: [...reviewSkippedAssets],
    reviewSkippedTables: [...reviewSkippedTables],
    choiceLists: [...choiceLists],
    choiceListProblems: [...choiceListProblems],
    reviewSkippedChoiceLists: [...reviewSkippedChoiceLists],
  };
}

const NAME_KIND_JA: Record<DefinedName['kind'], string> = {
  range: '範囲',
  cell: 'セル',
  rows: '行',
  columns: '列',
  formula: '数式（位置が計算で決まるため参照にできません）',
  constant: '定数（表ではありません）',
  broken: '参照先が失われています（#REF!）',
};

const ROLE_JA: Record<ImportCandidate['role'], string> = {
  table: '表',
  'key-value': '項目と値の組',
  prose: '文章',
  heading: '見出し',
  form: '記入欄',
  diagram: '図',
  unknown: '判定できない領域',
};

const ROLE_ADVICE: Partial<Record<ImportCandidate['role'], string>> = {
  'key-value': '文書の枠や属性であれば、通常は取り込みません。必要な項目だけ本文へ移してください。',
  prose: '本文へ移す場合は、原本の文章を確かめてから書いてください。',
  form: '押印欄などの記入欄です。通常は取り込みません。',
  diagram: 'セルで描いた図です。画像や図の記法で別に扱ってください。',
  unknown: '表として読めませんでした。原本を開いて確かめてください。',
};

export function renderImportDraft(workbookImport: WorkbookImport, layout: LayoutSummary = summarizeLayouts(workbookImport.sheets)): string {
  const lines: string[] = [];
  const all = workbookImport.sheets.flatMap((sheet) => sheet.candidates);
  const tables = all.filter((candidate) => candidate.role === 'table');
  const withCautions = tables.filter((candidate) => candidate.cautions.length > 0);
  const others = all.filter((candidate) => candidate.role !== 'table' && candidate.role !== 'heading');

  lines.push(`# 取り込み候補: ${escapeText(workbookImport.book)}`, '');
  lines.push(
    '> MMIが原本の構造から推定した候補です。確定ではありません。',
    '> 表は値を写さず、参照として置いています。プレビューで表示を確かめ、残す参照を選んでください。',
    '> 表ではない領域は、本文へ移すか取り込まないかを判断してください。この文書を編集しても原本は変わりません。',
    '',
  );
  lines.push(`- 表の候補: ${tables.length}件（注意あり: ${withCautions.length}件）`);
  if (workbookImport.assets.length > 0) {
    lines.push(`- 抽出した画像: ${workbookImport.assets.length}件（元のシート位置と出典を保持）`);
  }
  if (workbookImport.assetProblems.length > 0) {
    lines.push(`- 画像・図形の注意: ${workbookImport.assetProblems.length}件`);
  }
  if (workbookImport.choiceLists.length > 0) {
    lines.push(`- Excelの選択肢: ${workbookImport.choiceLists.length}件`);
  }
  if (workbookImport.choiceListProblems.length > 0) {
    lines.push(`- 選択肢の注意: ${workbookImport.choiceListProblems.length}件`);
  }
  if (workbookImport.reviewSkippedTables.length > 0) {
    lines.push(
      `- 既存のレビュー判断により通常候補から外した表: ${workbookImport.reviewSkippedTables.length}件`,
    );
  }
  if (workbookImport.reviewSkippedAssets.length > 0) {
    lines.push(
      `- 既存のレビュー判断により取り込まなかった画像: ${workbookImport.reviewSkippedAssets.length}件`,
    );
  }
  if (workbookImport.reviewSkippedChoiceLists.length > 0) {
    lines.push(
      `- 既存のレビュー判断により通常表示から外した選択肢: ${workbookImport.reviewSkippedChoiceLists.length}件`,
    );
  }
  const counts = countBy(others.map((candidate) => ROLE_JA[candidate.role]));
  if (counts.length > 0) lines.push(`- 表ではない領域: ${counts.map(([role, count]) => `${role} ${count}件`).join('、')}`);
  lines.push('');

  const layoutLines = renderLayout(layout);
  if (layoutLines.length > 0) lines.push('## 書式のまとまり', '', ...layoutLines, '');

  if (
    workbookImport.reviewSkippedTables.length > 0
    || workbookImport.reviewSkippedAssets.length > 0
    || workbookImport.reviewSkippedChoiceLists.length > 0
  ) {
    lines.push(
      '## 既存のレビュー判断',
      '',
      '> 以前に却下または保留した同一Candidateは、通常の候補・取り込み結果として再提示しません。内容や判断根拠が変われば、再びレビュー対象になります。',
      '',
    );
    for (const item of workbookImport.reviewSkippedTables) {
      const decision = item.decision === 'rejected' ? '却下' : '保留';
      const title = item.title ? `「${escapeText(item.title)}」` : '';
      lines.push(
        `- ${decision} [${escapeText(item.sheet)}] 表 ${escapeText(item.range)}${title}: ${escapeText(item.message)}`,
      );
    }
    for (const item of workbookImport.reviewSkippedAssets) {
      const decision = item.decision === 'rejected' ? '却下' : '保留';
      const name = item.name
        ? `「${escapeText(item.name)}」`
        : `画像 #${item.ordinal}`;
      lines.push(
        `- ${decision} [${escapeText(item.sheet)}] ${name}: ${escapeText(item.message)}`,
      );
    }
    for (const item of workbookImport.reviewSkippedChoiceLists) {
      const decision = item.decision === 'rejected' ? '却下' : '保留';
      lines.push(
        `- ${decision} [${escapeText(item.sheet)}] 選択肢 ${escapeText(item.range)}: ${escapeText(item.message)}`,
      );
    }
    lines.push('');
  }

  if (workbookImport.assetProblems.length > 0) {
    lines.push('## 画像・図形の注意', '', '> 取り込めない画像や、まだ抽出に対応していない図形・グラフ等は黙って捨てず、ここに残します。原本を開いて必要性を確認してください。', '');
    for (const problem of workbookImport.assetProblems) {
      const where = problem.sheet ? ` [${escapeText(problem.sheet)}]` : '';
      const ordinal = problem.ordinal ? ` #${problem.ordinal}` : '';
      lines.push(`- ${escapeText(problem.code)}${ordinal}${where}: ${escapeText(problem.message)}`);
    }
    lines.push('');
  }

  if (workbookImport.choiceListProblems.length > 0) {
    lines.push(
      '## 選択肢の注意',
      '',
      '> Excelの入力規則を安全に読み切れなかった箇所です。値を推測せず、原本の入力規則を確認してください。',
      '',
    );
    for (const problem of workbookImport.choiceListProblems) {
      const where = problem.sheet ? ` [${escapeText(problem.sheet)}]` : '';
      lines.push(`- ${escapeText(problem.code)}${where}: ${escapeText(problem.message)}`);
    }
    lines.push('');
  }

  const names = workbookImport.structure?.names ?? [];
  if (names.length > 0) {
    lines.push('## 名前付き範囲', '', '> MMIの参照は名前ではなくA1範囲で書きます。名前の定義が変わっても参照は追従しないため、名前の位置を確かめてから使ってください。', '');
    for (const name of names) {
      const where = name.sheet && name.range ? ` ${escapeText(name.sheet)}!${cellRangeToA1(name.range)}` : '';
      const scope = name.scope ? `（シート「${escapeText(name.scope)}」の中だけで有効）` : '';
      lines.push(`- ${escapeText(name.name)}${scope}: ${NAME_KIND_JA[name.kind]}${where}`);
    }
    lines.push('');
  }

  for (const sheet of workbookImport.sheets) {
    const visibility = workbookImport.structure?.sheets.find((entry) => entry.name === sheet.sheet)?.visibility;
    const hiddenNote = visibility === 'veryHidden' ? '（Excelの画面からは表示できないシート）' : visibility === 'hidden' ? '（非表示のシート）' : '';
    lines.push('---', '', `## ${escapeText(sheet.sheet)}${hiddenNote}`, '');
    const assets = workbookImport.assets.filter((asset) => asset.sheet === sheet.sheet);
    const choiceLists = workbookImport.choiceLists.filter(
      (choice) => choice.sheet === sheet.sheet,
    );
    if (sheet.candidates.length === 0 && assets.length === 0 && choiceLists.length === 0) {
      lines.push('> 内容がありません。', '');
      continue;
    }
    for (const candidate of sheet.candidates) lines.push(...renderCandidate(candidate));

    if (choiceLists.length > 0) {
      lines.push('### Excelの選択肢', '');
      lines.push(
        '> セルの入力規則として原本に明示された選択肢です。MMIはここでは別形式へ変換せず、移行時に失わないための観測情報として示します。',
        '',
      );
      for (const choice of choiceLists) {
        lines.push(renderChoiceList(choice));
      }
      lines.push('');
    }

    if (assets.length > 0) {
      lines.push('### 抽出した画像', '');
      lines.push('> 画像は通常のMarkdownファイルとして取り込み済みです。必要な位置へ移動し、不要ならこの参照を削除してください。原本の画像自体は変更していません。', '');
      for (const asset of assets) lines.push(asset.markdown, '');
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}


function renderChoiceList(choice: ImportDraftChoiceList): string {
  const blank = choice.allowBlank ? '・空欄可' : '・空欄不可';
  if (choice.choices) {
    const shown = choice.choices.slice(0, 20).map(escapeText);
    const more = choice.choices.length > shown.length
      ? `、ほか${choice.choices.length - shown.length}件`
      : '';
    return `- ${escapeText(choice.range)}: ${shown.join('、')}${more}${blank}`;
  }
  if (choice.formula1) {
    return `- ${escapeText(choice.range)}: 参照式 \`${escapeText(choice.formula1)}\`（選択肢の値は未解決）${blank}`;
  }
  return `- ${escapeText(choice.range)}: 選択肢の参照元を読み取れません${blank}`;
}

function renderLayout(layout: LayoutSummary): string[] {
  const name = (ref: SheetRef, books: ReadonlySet<string>): string => (books.size > 1 ? `${ref.sheet}（${ref.book}）` : ref.sheet);
  const books = new Set([...layout.groups.flatMap((group) => group.members), ...layout.deviations.map((d) => d.sheet)].map((ref) => ref.book));
  const out: string[] = [];
  for (const group of layout.groups) {
    out.push(`- 同じ書式（${group.members.length}シート）: ${group.members.map((member) => escapeText(name(member, books))).join('、')}`);
  }
  for (const deviation of layout.deviations) {
    const differences = deviation.differences.slice(0, 4).map(describeDifferenceJa);
    const more = deviation.differences.length > 4 ? `ほか${deviation.differences.length - 4}件` : '';
    out.push(
      `- ${escapeText(name(deviation.sheet, books))}: 「${escapeText(name(deviation.nearest.sheet, books))}」に近い書式です。` +
        `${[...differences, more].filter(Boolean).map(escapeText).join('。')}。`,
    );
  }
  return out;
}

function renderCandidate(candidate: ImportCandidate): string[] {
  if (candidate.role === 'heading') return [`### ${escapeText(candidate.excerpt[0] ?? candidate.a1)}`, ''];
  if (candidate.role !== 'table') {
    // Frames and forms: show their labels only; the values are the document's attributes.
    const shown = candidate.labels ?? candidate.excerpt;
    const excerpt = shown.slice(0, 6).map(escapeText).join(candidate.labels ? '、' : ' / ');
    const advice = ROLE_ADVICE[candidate.role] ?? '';
    return [`> ${ROLE_JA[candidate.role]} ${candidate.a1}: ${excerpt}${shown.length > 6 ? ' …' : ''}  `, `> ${advice}`, ''];
  }

  const out: string[] = [];
  if (!candidate.title) out.push(`表 ${candidate.a1}`, '');
  else if (candidate.excelTable) out.push(`### テーブル「${escapeText(candidate.excelTable)}」`, '');
  if (candidate.names?.length) out.push(`名前付き範囲: ${candidate.names.map(escapeText).join('、')}`, '');
  for (const caution of candidate.cautions) out.push(`> **注意:** ${escapeText(caution.message)}`, '');
  if (candidate.proposal) {
    out.push(candidate.proposal.reference, '');
  } else {
    out.push(`> 表 ${candidate.a1} の参照は提案していません。原本を開いて範囲を確かめてください。`, '');
  }
  return out;
}

function countBy(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()];
}

/** Keeps sheet text inert in Markdown: no emphasis, links, HTML or embeds from source cells. */
function escapeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|#!])/g, '\\$1');
}
