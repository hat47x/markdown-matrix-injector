/**
 * Request -> candidate MMI references (input-assistance-cpu-search.md §3.1):
 *
 *   parse -> semantic check (data independent) -> retrieve regions
 *   -> name resolution (book / sheet / columns) -> emit existing notation
 *   -> re-parse with the existing embed parser -> explain.
 *
 * Invariants (design §3.3 / §5.6):
 * - Unsupported aggregation, comparison, negation, sort, exact match and
 *   column-scoped conditions are rejected with a reason. They are never
 *   rewritten into `grep`, which is a row-wide, case-insensitive partial match.
 * - Nothing is confirmed automatically. The result is at most `maxCandidates`
 *   candidates for the user to choose from, each with an explanation.
 * - The output is existing MMI notation only; the IR is never emitted.
 */
import { parseEmbedSyntax } from '../../parser/embedSyntax.js';
import { indexToColumn, parseRangeToCellRange } from '../../core/tableGeometry.js';
import type { RegionRecord } from '../regionCatalog.js';
import type { RegionHit, RegionSearchIndex, RetrievalMethod } from '../searchIndex.js';
import { addTextFeatures, bigramDice, normalizeText, segments, textFeatureList, type FeatureBag } from '../textFeatures.js';
import { parseQuery, type Hint, type QueryIR, type UnsupportedConstruct } from './parser.js';

export interface QueryAliasRule {
  /**
   * Every cue must occur in the normalized request. Keep rules narrow: they
   * are directional descriptions, not general-purpose synonyms.
   */
  cues: readonly string[];
  /**
   * Canonical name/header terms expected together in one region. Alias-only
   * acceptance requires at least two terms and full name coverage.
   */
  terms: readonly string[];
}

export interface CompileOptions {
  index: RegionSearchIndex;
  method: RetrievalMethod;
  /** Book path -> the path written into the notation (relative to the document). */
  relativePath(bookPath: string): string;
  maxCandidates?: number;
  /** Regions pulled from retrieval before resolution filters. */
  pool?: number;
  /** Share of the request's name features a region must contain (rejects 該当なし). */
  minCoverage?: number;
  /** Column-name fuzzy threshold (bigram Dice). */
  minColumnSimilarity?: number;
  /**
   * Business dictionary (design §3.2 / §4.2): groups of interchangeable terms.
   * A hint containing one term is also tried with each other term of its
   * group. Hashing cannot invent synonyms absent from the features; this can.
   */
  synonyms?: readonly (readonly string[])[];
  /**
   * Directional description -> indexed-name rules used only for region
   * retrieval/coverage. They never rewrite columns or emitted MMI notation.
   */
  queryAliases?: readonly QueryAliasRule[];
}

export type CompileStatus = 'candidates' | 'unsupported' | 'no-match' | 'needs-more-input';

export interface ResolvedColumn {
  requested: string;
  header: string;
  /** Letter relative to the emitted range (spec §6: columns apply after slice). */
  letter: string;
  match: 'exact' | 'synonym' | 'fuzzy';
}

export interface Candidate {
  region: RegionRecord;
  markdown: string;
  explanation: string;
  retrievalScore: number;
  coverage: number;
  columns: ResolvedColumn[];
  /** Some requested column names were not found; the notes say which. */
  partial: boolean;
  notes: string[];
}

export interface CompileResult {
  status: CompileStatus;
  ir: QueryIR;
  candidates: Candidate[];
  reasons: string[];
  /** Always true: a person must choose; nothing is inserted automatically. */
  requiresSelection: true;
  /**
   * With `no-match` only: up to 3 tables whose names partly match, for the UI
   * to offer separately as "近いかもしれない表". They do not change the status:
   * the request is still reported as unmatched.
   */
  nearMisses?: Candidate[];
}

const UNSUPPORTED_REASON: Record<UnsupportedConstruct, string> = {
  aggregation: '集計（合計・件数・〜別など）はMMI記法にありません。',
  comparison: '大小・日付の比較はMMI記法にありません。',
  negation: '否定（〜以外・〜を含まないなど）はMMI記法にありません。grepは「含む」だけを表せます。',
  sort: '並べ替えや最新・上位の抽出はMMI記法にありません。',
  exactMatch: '完全一致はMMI記法にありません。grepは行全体の部分一致で、意味が違います。',
  columnCondition:
    '列を指定した条件はMMI記法にありません。grepは行のどこかに含むかだけを見ます。「「…」を含む行」と言えば行全体の部分一致として候補を出せます。',
  columnScopedContains:
    '列を限定した「含む」はMMI記法にありません。grepは行全体を対象にします。列を限定せず「「…」を含む行」と言えば候補を出せます。',
};

/** Tables at least this well named are offered as near misses when nothing matches. */
const NEAR_MISS_COVERAGE = 0.25;

/** Characters that would break `![[path#sheet|range?k=v]]` or URLSearchParams. */
const NOTATION_UNSAFE = /[|#[\]?\n\r]/u;
const PARAM_ESCAPE = /[%&+=#|[\]?\s]/gu;

export function compileQuery(input: string, options: CompileOptions): CompileResult {
  const ir = parseQuery(input);
  const result = (status: CompileStatus, reasons: string[], candidates: Candidate[] = []): CompileResult => ({
    status,
    ir,
    candidates,
    reasons,
    requiresSelection: true,
  });

  // --- semantic check ------------------------------------------------------
  // 「平均応答時間」「件数」 are aggregation words only if no such name exists.
  const liftedNotes = liftVerifiedNames(ir, options.index);
  const unsupported = new Set(ir.unsupported.map((item) => item.kind));
  const reasons = [...unsupported].map((kind) => UNSUPPORTED_REASON[kind]);
  if (ir.contains.length > 1) reasons.push('grepは1語だけです。複数語の条件は表せません。');
  if (reasons.length > 0) return result('unsupported', reasons);
  if (ir.diagnostics.some((diagnostic) => diagnostic.code === 'empty-request')) {
    return result('needs-more-input', ['ブック・シート・表の名前を含めてください（例: 「状態遷移表のIDと操作を見せて」）。']);
  }

  // --- retrieval ---------------------------------------------------------
  const maxCandidates = options.maxCandidates ?? 5;
  const minCoverage = options.minCoverage ?? 0.5;
  const nameHints = [ir.source, ir.sheet, ir.table, ...ir.target].filter((hint): hint is Hint => hint !== undefined);
  const synonyms = options.synonyms ?? [];
  const queryAliases = options.queryAliases ?? [];
  const aliasGroups = triggeredAliasGroups(ir.input, queryAliases);
  const queryBag = requestFeatureBag(ir, synonyms, queryAliases);
  // Columns are checked by resolution, not coverage; a grep-only request is
  // judged by its term.
  const parts = (nameHints.length > 0 ? nameHints : ir.contains.map((c) => c.term)).flatMap((hint) =>
    (nameHints.length > 0 && !hint.quoted ? coverageParts(stripExtension(hint.text)) : [{ text: stripExtension(hint.text), qualifier: false }]).map(
      (part) => ({ variants: variantsOf(part.text, hint.quoted ? [] : synonyms), qualifier: part.qualifier }),
    ),
  );
  const discriminated =
    nameHints.length > 0
      ? discriminatingHints(parts.filter((part) => !part.qualifier).map((part) => part.variants), options.index)
      : { kept: parts.map((part) => part.variants), dropped: [] as string[] };
  // Qualifiers are never dropped: an unknown 「（会計）」 must still exclude the 受注 table.
  const coverageHints = [...discriminated.kept, ...parts.filter((part) => part.qualifier).map((part) => part.variants)];
  const aliasFallbackAllowed =
    aliasGroups.length > 0
    && !nameHints.some((hint) => hint.quoted)
    && !parts.some((part) => part.qualifier);
  const dropped = discriminated.dropped;
  const droppedNotes = [...liftedNotes, ...dropped.map((text) => `「${text}」はどの表の名前にも無いため、絞り込みに使っていません。`)];

  let hits: RegionHit[];
  const fileHint = ir.source && /\.(?:xlsx|xlsm|xls|csv|xml)$/iu.test(ir.source.text) ? ir.source : undefined;
  if (fileHint) {
    // An explicit file name is a hard filter: score that book's regions directly.
    const wanted = normalizeText(fileHint.text);
    const books = options.index.bookPaths().filter((path) => normalizeText(baseName(path)) === wanted);
    if (books.length === 0) return result('no-match', [`ファイル「${fileHint.raw}」は索引にありません。`]);
    hits = options.index.scoreDocs(queryBag, books.flatMap((path) => options.index.docsOfBook(path)));
  } else {
    hits = options.index.search(options.method, queryBag, options.pool ?? 30);
  }

  // --- name resolution ---------------------------------------------------
  const sheetWanted = ir.sheet ? normalizeText(ir.sheet.text) : undefined;
  if (sheetWanted && hits.some((hit) => normalizeText(hit.region.sheet) === sheetWanted)) {
    hits = hits.filter((hit) => normalizeText(hit.region.sheet) === sheetWanted);
  }

  const rejections = new Set<string>();
  const candidates: Candidate[] = [];
  const near: { hit: RegionHit; coverage: number; columnSignature: boolean }[] = [];
  for (const hit of hits) {
    if (candidates.length >= maxCandidates) break;
    // Names must match names (book / sheet / title / headers); sampled cell
    // values only count when the request names nothing but a grep term.
    const regionBag = nameHints.length > 0 ? options.index.namesBagOf(hit.doc) : options.index.bagOf(hit.doc);
    const coverage = regionBag ? coverageOf(coverageHints, regionBag) : 0;
    const aliasMatch = regionBag && aliasFallbackAllowed
      ? bestAliasMatch(aliasGroups, regionBag)
      : undefined;
    const aliasAccepted = aliasMatch?.coverage === 1;
    const resolved = resolveColumns(hit.region, ir.columns, options.minColumnSimilarity ?? 0.6, synonyms);
    const columnSignature = hasStrongColumnSignature(resolved, ir.columns);
    if (coverage < minCoverage && !aliasAccepted) {
      // A paraphrased table description may share no lexical feature with the
      // workbook, while the user still names a distinctive set of columns.
      // Treat >=2 exact/synonym column matches only as *near-miss evidence*:
      // status remains no-match and explicit user selection + preview are
      // still required. One fuzzy/partial column is never enough to rescue a
      // mismatching table name.
      if ((coverage >= NEAR_MISS_COVERAGE || columnSignature) && near.length < 3) {
        near.push({ hit, coverage, columnSignature });
      }
      continue;
    }

    if (!resolved.ok) {
      rejections.add(resolved.reason);
      continue;
    }
    resolved.notes.push(...droppedNotes);
    if (coverage < minCoverage && aliasMatch) {
      resolved.notes.push(
        `表名そのものではなく、説明句の対応（${aliasMatch.cues.join('・')} → ${aliasMatch.terms.join('・')}）を検索補助に使いました。`,
      );
    }
    const emitted = emit(hit.region, ir, resolved.columns, options.relativePath(hit.region.bookPath));
    if (!emitted.ok) {
      rejections.add(emitted.reason);
      continue;
    }
    candidates.push({
      region: hit.region,
      markdown: emitted.markdown,
      explanation: explain(hit.region, emitted.range, resolved.columns, ir, [...resolved.notes, ...emitted.notes]),
      retrievalScore: hit.score,
      coverage,
      columns: resolved.columns,
      partial: resolved.unresolved.length > 0,
      notes: [...resolved.notes, ...emitted.notes],
    });
  }

  if (candidates.length === 0) {
    const nearMisses = near.flatMap(({ hit, coverage, columnSignature }) => {
      const resolved = resolveColumns(hit.region, ir.columns, options.minColumnSimilarity ?? 0.6, synonyms);
      const columns = resolved.ok ? resolved.columns : [];
      const emitted = emit(hit.region, ir, columns, options.relativePath(hit.region.bookPath));
      if (!emitted.ok) return [];
      const evidenceNote = columnSignature
        ? '表名の説明は索引上の名前と一致しませんが、指定された列名がすべて一致します。確認してから選んでください。'
        : '名前が一致しないため、確かめてから選んでください。';
      const notes = [evidenceNote, ...(resolved.ok ? resolved.notes : ['列の指定は反映していません。']), ...emitted.notes];
      return [{
        region: hit.region,
        markdown: emitted.markdown,
        explanation: explain(hit.region, emitted.range, columns, ir, notes),
        retrievalScore: hit.score,
        coverage,
        columns,
        partial: true,
        notes,
      }];
    });
    return {
      ...result('no-match', rejections.size > 0 ? [...rejections] : ['条件に合う表が見つかりません。']),
      ...(nearMisses.length > 0 ? { nearMisses } : {}),
    };
  }
  // Candidates that honour every requested column come before partial ones.
  candidates.sort((a, b) => Number(a.partial) - Number(b.partial));
  return result('candidates', [], candidates);
}

// ---------------------------------------------------------------------------

/**
 * The retrieval query for a parsed request: name hints weigh 2, columns 1,
 * the grep term 0.5 (it may appear among sampled values); dictionary
 * variants get half their hint's weight.
 */
export function requestFeatureBag(
  ir: QueryIR,
  synonyms: readonly (readonly string[])[] = [],
  queryAliases: readonly QueryAliasRule[] = [],
): FeatureBag {
  const bag: FeatureBag = new Map();
  const addVariants = (hint: Hint, weight: number): void => {
    const [original, ...others] = variantsOf(stripExtension(hint.text), hint.quoted ? [] : synonyms);
    addTextFeatures(bag, original, weight);
    for (const variant of others) addTextFeatures(bag, variant, weight / 2);
  };
  for (const hint of [ir.source, ir.sheet, ir.table, ...ir.target]) if (hint) addVariants(hint, 2);
  for (const column of ir.columns) addVariants(column, 1);
  for (const condition of ir.contains) addTextFeatures(bag, condition.term.text, 0.5);
  // Directional aliases are deliberately weaker than a name hint. They can
  // retrieve the right region, but acceptance below still requires an exact
  // match of every canonical term in one triggered rule.
  for (const group of triggeredAliasGroups(ir.input, queryAliases)) {
    for (const term of group.terms) addTextFeatures(bag, term, 0.75);
  }
  return bag;
}

/**
 * An aggregation/sort word that is really part of a name the index holds
 * (header 「平均応答時間」, header 「件数」) is a name, not an operation. Only an
 * exact, existing name lifts the marker -- a guess never does.
 */
function liftVerifiedNames(ir: QueryIR, index: RegionSearchIndex): string[] {
  const notes: string[] = [];
  ir.unsupported = ir.unsupported.filter((item) => {
    const compound = item.compound;
    if (!compound || index.namesFrequency(`w:${normalizeText(compound.text)}`) === 0) return true;
    const gluedStart = item.span.end;
    const replaceIn = (list: Hint[]): boolean => {
      const at = list.findIndex((hint) => hint.span.start === gluedStart);
      if (at < 0) return false;
      list[at] = compound;
      return true;
    };
    if (!replaceIn(ir.columns) && !replaceIn(ir.target)) {
      (ir.table || ir.sheet || ir.source || ir.target.length > 0 ? ir.columns : ir.target).push(compound);
    }
    notes.push(`「${compound.raw}」は集計・並べ替えではなく、既存の見出し名として扱いました。`);
    return false;
  });
  // Keep the order the user wrote the names in.
  ir.columns.sort((a, b) => a.span.start - b.span.start);
  ir.target.sort((a, b) => a.span.start - b.span.start);
  return notes;
}

const STRUCTURAL_SUFFIX = /(?:一覧表|一覧|テーブル|リスト|表)$/u;

/**
 * A name hint split into the parts that must each match: the structural
 * suffix is dropped (「指摘一覧」 -> 指摘: 一覧 only says it is a table), and a
 * parenthesised qualifier is its own required part (「結合テストケース（会計）」
 * must match 会計 too, so the 受注 table is not accepted).
 */
function coverageParts(text: string): { text: string; qualifier: boolean }[] {
  const qualifiers = [...text.matchAll(/[（(]([^）)]+)[）)]/gu)].map((match) => match[1].trim()).filter(Boolean);
  const base = text.replace(/[（(][^）)]*[）)]/gu, '').trim();
  const stripped = base.replace(STRUCTURAL_SUFFIX, '');
  const main = [...stripped].length >= 2 ? stripped : base;
  return [
    ...(main ? [{ text: main, qualifier: false }] : []),
    ...qualifiers.map((qualifier) => ({ text: qualifier, qualifier: true })),
  ];
}

/**
 * Drops hints that share no feature with any indexed name (「監視の設定」's
 * 設定): they cannot discriminate between regions, so they are reported, not
 * matched. A hint that is partly known (「給与テーブル」) is kept whole, and if
 * every hint is unknown nothing is left to match -- the request is rejected.
 */
function discriminatingHints(hints: string[][], index: RegionSearchIndex): { kept: string[][]; dropped: string[] } {
  const kept: string[][] = [];
  const dropped: string[] = [];
  for (const variants of hints) {
    const known = variants.some((variant) => coverageFeatures(variant).some((feature) => index.namesFrequency(feature) > 0));
    if (known) kept.push(variants);
    else dropped.push(variants[0]);
  }
  return { kept, dropped };
}

/**
 * How well the region contains *every* named thing: for each hint, the share
 * of its features present in the region (best dictionary variant), and the
 * minimum over hints. A table matching one name but not the other
 * (「会計システムの帳票一覧」 vs 会計's 画面一覧) is not a match.
 */
function coverageOf(hints: string[][], region: FeatureBag): number {
  if (hints.length === 0) return 0;
  let worst = 1;
  for (const variants of hints) {
    let best = 0;
    for (const variant of variants) {
      const features = coverageFeatures(variant);
      if (features.length === 0) continue;
      const hit = features.filter((feature) => region.has(feature)).length;
      best = Math.max(best, hit / features.length);
    }
    worst = Math.min(worst, best);
  }
  return worst;
}

/**
 * Features used for coverage: the whole-segment `w:` feature of a non-ASCII
 * segment duplicates its bigrams and would make one wrong character cost
 * twice, so it is left out; pure ASCII words keep theirs.
 */
function coverageFeatures(text: string): string[] {
  const wholes = new Set(segments(text).filter((segment) => /[^a-z0-9]/u.test(segment)).map((segment) => `w:${segment}`));
  const features = [...new Set(textFeatureList(text))];
  const pruned = features.filter((feature) => !wholes.has(feature));
  return pruned.length > 0 ? pruned : features;
}


interface TriggeredAliasGroup {
  cues: string[];
  terms: string[];
}

/**
 * Directional aliases are intentionally stricter than synonym groups:
 * - at least two cues must jointly occur in the request;
 * - at least two canonical terms must be supplied;
 * - malformed/broad one-term rules are ignored.
 *
 * This keeps a phrase such as 「夜間...ジョブ」 able to point toward
 * 「バッチ」「実行時刻」 without claiming that 夜間 == 実行時刻 everywhere.
 */
function triggeredAliasGroups(
  input: string,
  rules: readonly QueryAliasRule[],
): TriggeredAliasGroup[] {
  const normalized = normalizeText(input);
  const groups: TriggeredAliasGroup[] = [];
  for (const rule of rules) {
    const cues = [...new Set(rule.cues.map(normalizeText).filter(Boolean))];
    const terms = [...new Set(rule.terms.map(normalizeText).filter(Boolean))];
    if (cues.length < 2 || terms.length < 2) continue;
    if (!cues.every((cue) => normalized.includes(cue))) continue;
    groups.push({ cues, terms });
    if (groups.length >= 8) break;
  }
  return groups;
}

function bestAliasMatch(
  groups: readonly TriggeredAliasGroup[],
  region: FeatureBag,
): (TriggeredAliasGroup & { coverage: number }) | undefined {
  let best: (TriggeredAliasGroup & { coverage: number }) | undefined;
  for (const group of groups) {
    const coverage = coverageOf(group.terms.map((term) => [term]), region);
    if (!best || coverage > best.coverage) best = { ...group, coverage };
  }
  return best;
}

/** The text plus each single-term substitution from its synonym groups. */
function variantsOf(text: string, synonyms: readonly (readonly string[])[]): string[] {
  const variants = [text];
  const normalized = normalizeText(text);
  for (const group of synonyms) {
    for (const term of group) {
      const at = normalized.indexOf(normalizeText(term));
      if (at < 0 || term.length === 0) continue;
      for (const other of group) {
        if (other === term) continue;
        const variant = normalized.slice(0, at) + normalizeText(other) + normalized.slice(at + normalizeText(term).length);
        if (!variants.includes(variant)) variants.push(variant);
      }
    }
  }
  return variants.slice(0, 16);
}

type ColumnResolution =
  | { ok: true; columns: ResolvedColumn[]; unresolved: string[]; notes: string[] }
  | { ok: false; reason: string };

/**
 * Strong enough to *suggest* a table whose descriptive name did not match.
 * This deliberately does not authorize a normal candidate: at least two
 * requested columns must all resolve without fuzzy matching.
 */
function hasStrongColumnSignature(resolved: ColumnResolution, requested: Hint[]): boolean {
  return (
    requested.length >= 2 &&
    resolved.ok &&
    resolved.unresolved.length === 0 &&
    resolved.columns.length >= 2 &&
    resolved.columns.every((column) => column.match === 'exact' || column.match === 'synonym')
  );
}

/**
 * Exact normalized header match first (the compound reading 「確認項目」
 * before 「確認」), then bigram Dice >= threshold. Two equally good headers
 * -> ambiguous, never a silent pick. A requested name that is not a header
 * but names the region itself (「障害切り分けの手順」) is read as part of the
 * target. A name that matches nothing is listed in the notes and the
 * candidate is marked partial -- allowed only while at least one requested
 * column did resolve, so an unknown word can never stand in for the request.
 */
function resolveColumns(
  region: RegionRecord,
  requested: Hint[],
  threshold: number,
  synonyms: readonly (readonly string[])[],
): ColumnResolution {
  if (requested.length === 0) return { ok: true, columns: [], unresolved: [], notes: [] };
  const headers = region.headerConfidence === 'none' ? [] : (region.headers ?? []);
  const normalized = headers.map((header) => normalizeText(header));
  const columns: ResolvedColumn[] = [];
  const unresolved: string[] = [];
  const notes: string[] = [];
  const regionNames = [region.title, region.sheet, region.bookStem].filter(Boolean).map((name) => normalizeText(name ?? ''));

  for (const hint of requested) {
    const exactOf = (text: string): number[] => normalized.flatMap((header, i) => (header === text ? [i] : []));
    const alt = hint.alt ? normalizeText(hint.alt) : undefined;
    const want = alt && exactOf(alt).length > 0 ? alt : normalizeText(hint.text);
    const variants = hint.quoted ? [want] : variantsOf(want, synonyms);
    let exact = exactOf(want);
    let match: ResolvedColumn['match'] = 'exact';
    if (exact.length === 0 && variants.length > 1) {
      exact = [...new Set(variants.slice(1).flatMap(exactOf))];
      match = 'synonym';
    }
    let index: number | undefined;
    if (exact.length > 1) return { ok: false, reason: `列「${hint.raw}」が同じ表に複数あります。範囲を直接指定してください。` };
    if (exact.length === 1) {
      index = exact[0];
    } else {
      const scored = headers
        .map((header, i) => ({ i, score: Math.max(...variants.map((variant) => bigramDice(header, variant))) }))
        .filter((entry) => entry.score >= threshold)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 1 && scored[0].score === scored[1].score) {
        return { ok: false, reason: `列「${hint.raw}」に当たる見出しが複数あります（${scored.map((s) => headers[s.i]).join('、')}）。` };
      }
      if (scored.length > 0) {
        index = scored[0].i;
        match = 'fuzzy';
      }
    }
    if (index === undefined) {
      if (regionNames.some((name) => name.includes(want))) {
        notes.push(`「${hint.raw}」は列名ではなく表の名前の一部として扱いました。`);
        continue;
      }
      unresolved.push(hint.raw);
      continue;
    }
    if (!columns.some((column) => column.letter === indexToColumn(index))) {
      columns.push({ requested: hint.raw, header: headers[index], letter: indexToColumn(index), match });
    }
  }
  if (unresolved.length > 0) {
    if (columns.length === 0) return { ok: false, reason: `列「${unresolved.join('」「')}」が見出しに見つかりません。` };
    notes.push(`「${unresolved.join('」「')}」は見出しに無いため反映していません。`);
  }
  return { ok: true, columns, unresolved, notes };
}

type Emission = { ok: true; markdown: string; range: string; notes: string[] } | { ok: false; reason: string };

function emit(region: RegionRecord, ir: QueryIR, columns: ResolvedColumn[], path: string): Emission {
  if (NOTATION_UNSAFE.test(path) || NOTATION_UNSAFE.test(region.sheet)) {
    return { ok: false, reason: `「${region.sheet}」はMMI記法で書けない文字を含むため候補にできません。` };
  }
  const notes: string[] = [];
  let range = region.a1;
  const useColumns = columns;
  if (ir.range) {
    if (!rangeInside(ir.range.text, region)) {
      return { ok: false, reason: `範囲 ${ir.range.text} は候補の表（${region.a1}）の外です。` };
    }
    range = ir.range.text;
    if (range !== region.a1 && columns.length > 0) {
      return { ok: false, reason: '範囲を直接指定した場合は列名で絞り込めません。' };
    }
  }

  const params: string[] = [];
  if (useColumns.length > 0) params.push(`columns=${useColumns.map((column) => column.letter).join(',')}`);
  const grep = ir.contains[0]?.term.raw;
  const headerLikely = region.headerConfidence === 'likely' && range === region.a1;
  if (headerLikely) params.push('header=first');
  else if (grep !== undefined && region.headerConfidence === 'uncertain') {
    notes.push('見出し行の判定が不確かなため header を指定していません（見出し行もgrepの対象になります）。');
  }
  if (grep !== undefined) params.push(`grep=${grep.replace(PARAM_ESCAPE, (ch) => encodeURIComponent(ch))}`);

  const markdown = `![[${path}#${region.sheet}|${range}${params.length > 0 ? `?${params.join('&')}` : ''}]]`;

  // Re-validate with the existing parser: what we emit must mean exactly this.
  const parsed = parseEmbedSyntax(markdown);
  const valid =
    parsed !== null &&
    parsed.filepath === path.trim() &&
    parsed.target === region.sheet.trim() &&
    parsed.range === range &&
    (grep === undefined || parsed.params.get('grep') === grep) &&
    (useColumns.length === 0 || parsed.params.get('columns') === useColumns.map((column) => column.letter).join(','));
  if (!valid) return { ok: false, reason: `「${region.sheet}」の参照を既存記法として検証できませんでした。` };
  return { ok: true, markdown, range, notes };
}

function rangeInside(a1: string, region: RegionRecord): boolean {
  try {
    const range = parseRangeToCellRange(a1);
    return (
      range.startRow >= region.range.startRow &&
      range.endRow <= region.range.endRow &&
      range.startCol >= region.range.startCol &&
      range.endCol <= region.range.endCol &&
      range.startRow <= range.endRow &&
      range.startCol <= range.endCol
    );
  } catch {
    return false;
  }
}

function explain(region: RegionRecord, range: string, columns: ResolvedColumn[], ir: QueryIR, notes: string[]): string {
  const parts = [`対象: ${baseName(region.bookPath)} / ${region.sheet} ${range}${region.title ? `（${region.title}）` : ''}`];
  if (columns.length > 0) {
    parts.push(
      `列: ${columns.map((column) => `${column.header}${column.match !== 'exact' ?`≒${column.requested}` : ''}`).join('、')}`,
    );
  }
  const grep = ir.contains[0]?.term.raw;
  if (grep !== undefined) parts.push(`条件: 行のどこかに「${grep}」を含む（部分一致・大文字小文字不問）`);
  if (ir.contains[0]?.implicit) {
    parts.push(`「${grep}の…」を列の指定ではなく行全体の部分一致として解釈しました。特定の列の値だけで絞る指定はできません。`);
  }
  return [...parts, ...notes].join(' / ');
}

function baseName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function stripExtension(text: string): string {
  return text.replace(/\.(?:xlsx|xlsm|xls|csv|xml)$/iu, '');
}
