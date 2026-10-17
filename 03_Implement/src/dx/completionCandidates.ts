/**
 * Completion candidates for an analysed cursor context (issue-0110).
 *
 * - Keys and enum values come from `MMI_KNOWN_PARAMETER_CONTRACT`, which a
 *   unit test keeps in sync with `04_Documentation/spec/params.schema.json`;
 *   the Japanese descriptions below are checked against the same key set.
 * - Keys already used are not offered again, except repeatable
 *   `formatColumn`. Unknown keys in the text are left untouched (P5).
 * - Ranges come only from the selected sheet: detected table regions (with
 *   their title and headers as the explanation) and the sheet's used range.
 *   Nothing is guessed from other sheets.
 */
import type { SheetSource } from '../core/sheetSource.js';
import { cellRangeToA1 } from '../core/tableGeometry.js';
import { detectTableRegions, gridProjection, logicalColumnLetter } from '../importAssist/tableRegions.js';
import { MMI_KNOWN_PARAMETER_CONTRACT, type KnownEmbedQueryParameter } from '../parser/parameterContract.js';
import type { DetectedRegion } from '../search/regionDetector.js';
import type { CompletionContext } from './completionContext.js';

export type CandidateKind = 'file' | 'sheet' | 'range' | 'param-key' | 'param-value';

export interface CompletionCandidate {
  label: string;
  insertText: string;
  kind: CandidateKind;
  /** Short explanation shown next to the label, in the reader language. */
  detail?: string;
  /** Sort key; lower first. */
  sortText?: string;
}

export type ParameterDocumentation = Readonly<Record<
  KnownEmbedQueryParameter,
  { summary: string; values?: Record<string, string> }
>>;

/** The wording of the completion explanations, per language (issue-0211: the UI must not mix languages). */
export interface CompletionPhrases {
  /** Per parameter: the summary next to the key and the wording of each enum value. */
  paramDocs: ParameterDocumentation;
  mergedColumns(headers: string): string;
  headerName(): string;
  formatColumnPrompt(): string;
  mergedTableHint(needs: string): string;
  regionFallback(): string;
  usedRange(): string;
}

/** The wording a plain (no VS Code host) caller sees: the English reference. */
export const PARAMETER_DOCS_EN: ParameterDocumentation = {
  mode: {
    summary: 'Fixes how the sheet is shown (auto-judged from its size when omitted)',
    values: { table: 'Show it as a table', card: 'Show it as a card sheet' },
  },
  header: {
    summary: 'Header row (no header when omitted)',
    values: {
      first: 'Make the first row the header',
      none: 'No header',
      '1': 'Make converted row n the header (starting from 1)',
    },
  },
  columns: { summary: 'Columns to keep (relative column letters inside the range, e.g. A,C)' },
  transpose: { summary: 'Transpose rows and columns', values: { true: 'transpose' } },
  grep: { summary: 'Keep only rows whose body cell contains it somewhere (partial match, case-insensitive)' },
  highlightColumn: { summary: 'Column whose match is highlighted (header name, or the column letter)' },
  highlightValue: { summary: 'Value to highlight (outer whitespace and case are ignored)' },
  formatColumn: { summary: 'Show a cell as code (column:format, repeatable)' },
  caption: { summary: 'Caption of the figure (delivery profile)' },
  id: { summary: 'Cross-reference ID (delivery profile)' },
  pageBreak: {
    summary: 'Page break (delivery profile)',
    values: { before: 'Break the page before', after: 'Break the page after', both: 'Break the page before and after' },
  },
  orientation: {
    summary: 'Paper orientation (delivery profile)',
    values: { landscape: 'landscape', portrait: 'portrait' },
  },
};

export const enCompletionPhrases: CompletionPhrases = {
  paramDocs: PARAMETER_DOCS_EN,
  mergedColumns: (headers) => `Shows one column of the merged table at a time (${headers})`,
  headerName: () => 'header name',
  formatColumnPrompt: () => 'Continue typing the format (e.g. json)',
  mergedTableHint: (needs) => ` (merged table: to show it as a table, use ${needs})`,
  regionFallback: () => 'table region',
  usedRange: () => 'the whole used range of the sheet',
};

export const PARAMETER_DOCS_JA: ParameterDocumentation = {
  mode: { summary: '表示形式を固定する（未指定なら大きさで自動判定）', values: { table: '表として表示', card: '別紙カードとして表示' } },
  header: {
    summary: '見出し行（未指定は見出しなし）',
    values: { first: '先頭行を見出しにする', none: '見出しなし', '1': '変換後の第n行を見出しにする（1始まり）' },
  },
  columns: { summary: '残す列（範囲内の相対列文字、例: A,C）' },
  transpose: { summary: '行と列を入れ替える', values: { true: '入れ替える' } },
  grep: { summary: '本体行のどこかのセルに含む行だけ残す（部分一致・大文字小文字不問）' },
  highlightColumn: { summary: '強調を判定する列（見出し名、なければ列文字）' },
  highlightValue: { summary: '強調する値（前後空白・大文字小文字を無視）' },
  formatColumn: { summary: 'セルをコード表示にする（列:形式、繰返し可）' },
  caption: { summary: '図表の見出し（納品プロファイル）' },
  id: { summary: '相互参照のID（納品プロファイル）' },
  pageBreak: { summary: '改ページ（納品プロファイル）', values: { before: '前で改ページ', after: '後で改ページ', both: '前後で改ページ' } },
  orientation: { summary: '用紙の向き（納品プロファイル）', values: { landscape: '横向き', portrait: '縦向き' } },
};

/** The previous Japanese wording, kept verbatim (the reference the completion was checked against). */
export const jaCompletionPhrases: CompletionPhrases = {
  paramDocs: PARAMETER_DOCS_JA,
  mergedColumns: (headers) => `結合した列ごとに1列ずつ表示（${headers}）`,
  headerName: () => '見出し名',
  formatColumnPrompt: () => '形式を続けて入力（例: json）',
  mergedTableHint: (needs) => `（結合した表: 表として見せるには ${needs}）`,
  regionFallback: () => '表領域',
  usedRange: () => 'シートの使用範囲全体',
};

const REPEATABLE = new Set<string>(['formatColumn']);

function matches(value: string, typed: string): boolean {
  return typed.length === 0 || value.toLowerCase().includes(typed.trim().toLowerCase());
}

export function paramKeyCandidates(
  context: CompletionContext,
  phrases: CompletionPhrases = enCompletionPhrases,
): CompletionCandidate[] {
  return (Object.keys(MMI_KNOWN_PARAMETER_CONTRACT) as KnownEmbedQueryParameter[])
    .filter((key) => REPEATABLE.has(key) || !context.usedParams.includes(key))
    .filter((key) => matches(key, context.typed))
    .map((key, index) => ({
      label: key,
      insertText: `${key}=`,
      kind: 'param-key' as const,
      detail: phrases.paramDocs[key].summary,
      sortText: String(index).padStart(2, '0'),
    }));
}

/**
 * Values for `param-value`. Enum-like keys list their vocabulary. Column
 * selectors (`columns`, `highlightColumn`, `formatColumn`) offer the headers
 * of the region the range points at, when that region is known.
 */
export function paramValueCandidates(
  context: CompletionContext,
  region?: DetectedRegion,
  phrases: CompletionPhrases = enCompletionPhrases,
): CompletionCandidate[] {
  const key = context.paramKey as KnownEmbedQueryParameter | undefined;
  if (!key || !(key in MMI_KNOWN_PARAMETER_CONTRACT)) return [];
  const docs = phrases.paramDocs[key];
  const out: CompletionCandidate[] = [];
  const constraint = MMI_KNOWN_PARAMETER_CONTRACT[key].constraint;
  const values = constraint.kind === 'enum' ? constraint.values : key === 'header' ? ['first', 'none'] : [];
  for (const value of values) {
    out.push({ label: value, insertText: value, kind: 'param-value', detail: docs.values?.[value] });
  }
  const headers = region?.headerConfidence !== 'none' ? (region?.headers ?? []) : [];
  if (headers.length > 0) {
    if (key === 'columns') {
      // Append to an existing list: only the last comma-separated item is being typed.
      const done = context.typed.split(',').slice(0, -1).map((item) => item.trim().toUpperCase());
      const prefix = context.typed.includes(',') ? context.typed.slice(0, context.typed.lastIndexOf(',') + 1) : '';
      // A merged-grid (方眼紙) table: offer every anchor column at once, then one by one.
      const all = region ? gridProjection(region).columns : undefined;
      if (all && prefix === '') out.push({ label: all, insertText: all, kind: 'param-value', detail: phrases.mergedColumns(headers.join('・')) });
      headers.forEach((header, index) => {
        const letter = logicalColumnLetter(region!, index);
        if (done.includes(letter)) return;
        out.push({ label: `${prefix}${letter}`, insertText: `${prefix}${letter}`, kind: 'param-value', detail: header });
      });
    } else if (key === 'highlightColumn') {
      headers.forEach((header) => out.push({ label: header, insertText: header, kind: 'param-value', detail: phrases.headerName() }));
    } else if (key === 'formatColumn') {
      headers.forEach((header) =>
        out.push({ label: `${header}:json`, insertText: `${header}:`, kind: 'param-value', detail: phrases.formatColumnPrompt() }),
      );
    }
  }
  return out.filter((candidate) => key === 'columns' || matches(candidate.label, context.typed));
}

/** Detected regions of the selected sheet, then its used range. */
export function rangeCandidates(
  context: CompletionContext,
  sheetName: string,
  sheet: SheetSource,
  phrases: CompletionPhrases = enCompletionPhrases,
): CompletionCandidate[] {
  const out: CompletionCandidate[] = detectTableRegions(sheetName, sheet).map((region, index) => {
    const projection = gridProjection(region);
    const needs = [projection.columns ? `columns=${projection.columns}` : '', projection.mode ? `mode=${projection.mode}` : ''].filter(Boolean).join('&');
    return {
      label: region.a1,
      insertText: region.a1,
      kind: 'range' as const,
      detail:
        [region.title, region.headers?.slice(0, 4).join('・')].filter(Boolean).join(' / ') +
          (needs ? phrases.mergedTableHint(needs) : '') || phrases.regionFallback(),
      sortText: `0${String(index).padStart(4, '0')}`,
    };
  });
  if (sheet.usedRange) {
    const used = cellRangeToA1(sheet.usedRange);
    if (!out.some((candidate) => candidate.label === used)) {
      out.push({ label: used, insertText: used, kind: 'range', detail: phrases.usedRange(), sortText: '1' });
    }
  }
  return out.filter((candidate) => matches(candidate.label, context.typed) || matches(candidate.detail ?? '', context.typed));
}

/** The detected region whose range equals the embed's range, for column suggestions. */
export function regionForRange(sheetName: string, sheet: SheetSource, range: string | undefined): DetectedRegion | undefined {
  if (!range) return undefined;
  return detectTableRegions(sheetName, sheet).find((region) => region.a1 === range.toUpperCase());
}

export function simpleCandidates(values: readonly string[], typed: string, kind: 'file' | 'sheet'): CompletionCandidate[] {
  return values.filter((value) => matches(value, typed)).map((value) => ({ label: value, insertText: value, kind }));
}
