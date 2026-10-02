/**
 * Structuralizer: flat text -> Tree candidates (issue-0199).
 *
 * Flat text does not state its hierarchy; fixed rules infer one. Results are
 * `inferred` (M1) and deterministic, and every structure carries the rule,
 * the lines it rests on (evidence), the algorithm version and a reason code.
 *
 * Three methods, each enabled on its own:
 *   indent     leading spaces / tabs
 *   numbering  section numbers: `1.`, `1.1`, `1.1.1`, `(1)`, `1)`
 *              (full-width digits and `．` are read as ASCII)
 *   prefix     codes matching a caller-given pattern (`REQ-001`, `REQ-001-01`);
 *              a code's parent is the longest other code that is its prefix
 *              up to a separator (a character that is not a letter or digit)
 *
 * "Deterministic" is not "true". When the rules admit more than one
 * structure -- tabs and spaces mixed so the tab width matters, a dedent that
 * lands between two levels, numbers that skip, repeat or lack a parent,
 * duplicate codes -- the method returns every distinct structure (or none)
 * and marks the outcome `ambiguous`; it never picks one silently.
 *
 * Lines that a method does not recognise (body text under a numbered
 * heading, lines without a code) are left out of that method's tree and
 * counted in its evidence.
 */
import type { Candidate, Evidence } from '../core/candidate.js';
import { canonicalTree, DEFAULT_TREE_LIMITS, treeDepth, type Tree, type TreeLimits, type TreeNode } from '../core/tree.js';
import { abstainedTreeCandidate, limitDiagnostic, TreeLimitError, treeCandidate, type TreeDiagnostic } from './treeCandidates.js';

export const TEXT_TREE_ALGORITHM = 'mmi.text-tree-structuralizer';
/** Bump when any rule changes in a way that can change output. */
export const TEXT_TREE_VERSION = '1';

export type TextTreeMethod = 'indent' | 'numbering' | 'prefix';
export const TEXT_TREE_METHODS: readonly TextTreeMethod[] = ['indent', 'numbering', 'prefix'];

export interface TextStructuralizeOptions {
  /** Methods to run, each independently. */
  methods: readonly TextTreeMethod[];
  /** Regular expression (source text) for a code at the start of a line; required by `prefix`. */
  prefix?: string;
  /** Ignore fenced code blocks (``` / ~~~), for Markdown. */
  skipFencedCode?: boolean;
  limits?: TreeLimits;
}

export interface TextTreeAlternative {
  /** Which reading of the rules produced this tree, e.g. `tab-width-4`, `by-number`. */
  variant: string;
  tree: Tree;
  evidence: Evidence[];
}

export type TextOutcomeStatus = 'structured' | 'ambiguous' | 'no-structure';

export interface TextMethodOutcome {
  method: TextTreeMethod;
  status: TextOutcomeStatus;
  reasonCode: string;
  evidence: Evidence[];
  /** One when structured; one or more distinct trees when ambiguous; none when no structure. */
  alternatives: TextTreeAlternative[];
}

export interface TextStructuralizeResult {
  outcomes: TextMethodOutcome[];
  diagnostics: TreeDiagnostic[];
  /**
   * Over all enabled methods: `structured` only when exactly one distinct
   * tree came out and no method was ambiguous.
   */
  status: TextOutcomeStatus;
}

interface SourceLine {
  line: number;
  /** Leading whitespace. */
  lead: string;
  /** Line without indentation, heading marker or bullet. */
  label: string;
}

interface Item {
  line: number;
  label: string;
  level: number;
}

const EVIDENCE_LIST_MAX = 10;
const listed = (lines: readonly number[]): string =>
  lines.slice(0, EVIDENCE_LIST_MAX).map((l) => `L${l}`).join(',') + (lines.length > EVIDENCE_LIST_MAX ? `,...(+${lines.length - EVIDENCE_LIST_MAX})` : '');

function sourceLines(text: string, skipFencedCode: boolean): { lines: SourceLine[]; skippedFenced: number } {
  const lines: SourceLine[] = [];
  let fence: string | undefined;
  let skippedFenced = 0;
  text.replace(/^﻿/u, '').split(/\r\n?|\n/u).forEach((raw, index) => {
    if (skipFencedCode) {
      const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(raw)?.[1];
      if (fence !== undefined) {
        skippedFenced += 1;
        if (marker && marker[0] === fence[0] && marker.length >= fence.length && raw.trim() === marker) fence = undefined;
        return;
      }
      if (marker) {
        fence = marker;
        skippedFenced += 1;
        return;
      }
    }
    if (raw.trim() === '') return;
    const lead = /^[ \t]*/u.exec(raw)![0];
    const label = raw
      .slice(lead.length)
      .replace(/^#{1,6}\s+/u, '')
      .replace(/^(?:[-*+](?:\s+|$)|[・•]\s*)/u, '')
      .trimEnd();
    lines.push({ line: index + 1, lead, label });
  });
  return { lines, skippedFenced };
}

/** Nests items by level: a node's parent is the nearest earlier item with a smaller level. */
function nestByLevel(items: readonly Item[], limits: TreeLimits, parentOf?: (index: number) => number | undefined): Tree {
  if (items.length > limits.maxNodes) throw new TreeLimitError('MMI_TREE_LIMIT_NODES', limits.maxNodes, items[limits.maxNodes].line);
  const nodes: (TreeNode & { children: TreeNode[] })[] = items.map((item) => ({ kind: 'line', label: item.label, children: [], locator: { line: item.line } }));
  const depth: number[] = [];
  const roots: TreeNode[] = [];
  const stack: number[] = [];
  items.forEach((item, index) => {
    let parent: number | undefined;
    if (parentOf) parent = parentOf(index);
    else {
      while (stack.length > 0 && items[stack[stack.length - 1]].level >= item.level) stack.pop();
      parent = stack[stack.length - 1];
      stack.push(index);
    }
    depth[index] = parent === undefined ? 1 : depth[parent] + 1;
    if (depth[index] > limits.maxDepth) throw new TreeLimitError('MMI_TREE_LIMIT_DEPTH', limits.maxDepth, item.line);
    if (parent === undefined) roots.push(nodes[index]);
    else nodes[parent].children.push(nodes[index]);
  });
  return { roots };
}

/** Distinct trees only, in first-seen order. */
function distinct(alternatives: TextTreeAlternative[]): TextTreeAlternative[] {
  const seen = new Map<string, TextTreeAlternative>();
  for (const alternative of alternatives) {
    const key = canonicalTree(alternative.tree);
    const earlier = seen.get(key);
    if (earlier) earlier.variant = `${earlier.variant}+${alternative.variant}`;
    else seen.set(key, alternative);
  }
  return [...seen.values()];
}

const nested = (tree: Tree): boolean => treeDepth(tree) >= 2;

// --- indent ------------------------------------------------------------------------------

function widthOf(lead: string, tabWidth: number): number {
  let width = 0;
  for (const ch of lead) width = ch === '\t' ? width + tabWidth - (width % tabWidth) : width + 1;
  return width;
}

function indentOutcome(lines: readonly SourceLine[], limits: TreeLimits): TextMethodOutcome {
  const tabLines = lines.filter((l) => l.lead.includes('\t')).map((l) => l.line);
  const spaceLines = lines.filter((l) => l.lead.includes(' ')).map((l) => l.line);
  const mixed = tabLines.length > 0 && spaceLines.length > 0;
  const variants: { name: string; tabWidth: number }[] = mixed
    ? [{ name: 'tab-width-4', tabWidth: 4 }, { name: 'tab-width-8', tabWidth: 8 }]
    : [{ name: tabLines.length > 0 ? 'tabs' : 'spaces', tabWidth: 1 }];
  const base: Evidence[] = [];
  if (mixed) base.push({ code: 'mixed-tab-space', detail: `tabs ${listed(tabLines)}; spaces ${listed(spaceLines)}` });

  const alternatives: TextTreeAlternative[] = [];
  for (const variant of variants) {
    const widths = lines.map((l) => widthOf(l.lead, variant.tabWidth));
    if (new Set(widths).size < 2) continue;
    for (const snap of [false, true]) {
      // Levels after resolving dedents that land between two open levels.
      const uneven: number[] = [];
      const levels: number[] = [];
      const open: number[] = [];
      widths.forEach((width, index) => {
        let level = width;
        const popped: number[] = [];
        while (open.length > 0 && open[open.length - 1] >= width) popped.push(open.pop()!);
        if (popped.length > 0 && !popped.includes(width) && popped[popped.length - 1] > width) {
          uneven.push(lines[index].line);
          // Read as a sibling of the closest closed level instead of a new, shallower one.
          if (snap) level = popped[popped.length - 1];
        }
        open.push(level);
        levels.push(level);
      });
      if (snap && uneven.length === 0) continue;
      const items = lines.map((l, index) => ({ line: l.line, label: l.label, level: levels[index] }));
      const tree = nestByLevel(items, limits);
      const evidence: Evidence[] = [
        { code: 'indent-unit', detail: variant.name },
        { code: 'indent-columns', detail: [...new Set(levels)].sort((a, b) => a - b).join(',') },
        { code: 'lines', detail: `${lines.length} non-blank lines` },
      ];
      if (uneven.length > 0) evidence.push({ code: snap ? 'uneven-dedent-as-sibling' : 'uneven-dedent-as-new-level', detail: listed(uneven) });
      alternatives.push({ variant: `${variant.name}${uneven.length > 0 ? (snap ? '/as-sibling' : '/as-new-level') : ''}`, tree, evidence });
    }
  }
  const found = distinct(alternatives).filter((a) => nested(a.tree));
  if (found.length === 0) return { method: 'indent', status: 'no-structure', reasonCode: 'no-indentation-levels', evidence: base, alternatives: [] };
  if (found.length === 1) {
    return { method: 'indent', status: 'structured', reasonCode: mixed ? 'indent-levels-tab-width-independent' : 'indent-levels', evidence: base, alternatives: found };
  }
  const reasonCode = alternatives.some((a) => a.variant.includes('/as-')) && !mixed ? 'indent-uneven-dedent' : 'indent-mixed-tab-space';
  return { method: 'indent', status: 'ambiguous', reasonCode, evidence: base, alternatives: found };
}

// --- numbering ---------------------------------------------------------------------------

type NumberStyle = 'dotted' | 'paren' | 'close-paren';

interface Numbered {
  line: number;
  label: string;
  style: NumberStyle;
  /** Dotted components, or the single number of a paren style. */
  parts: number[];
}

const toAscii = (text: string): string =>
  text.replace(/[０-９]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/．/gu, '.').replace(/（/gu, '(').replace(/）/gu, ')');

const AFTER_NUMBER = String.raw`(?=\s|$|[^\x00-\x7F])`;
const DOTTED = new RegExp(String.raw`^(\d+(?:\.\d+)+)\.?${AFTER_NUMBER}|^(\d+)\.${AFTER_NUMBER}`, 'u');
const PAREN = /^\((\d+)\)/u;
const CLOSE_PAREN = new RegExp(String.raw`^(\d+)\)${AFTER_NUMBER}`, 'u');

function numberedOf(line: SourceLine): Numbered | undefined {
  const head = toAscii(line.label.slice(0, 24));
  const dotted = DOTTED.exec(head);
  if (dotted) return { line: line.line, label: line.label, style: 'dotted', parts: (dotted[1] ?? dotted[2]).split('.').map(Number) };
  const paren = PAREN.exec(head);
  if (paren) return { line: line.line, label: line.label, style: 'paren', parts: [Number(paren[1])] };
  const close = CLOSE_PAREN.exec(head);
  if (close) return { line: line.line, label: line.label, style: 'close-paren', parts: [Number(close[1])] };
  return undefined;
}

function numberingOutcome(lines: readonly SourceLine[], limits: TreeLimits): TextMethodOutcome {
  const numbered = lines.map(numberedOf).filter((n): n is Numbered => n !== undefined);
  const base: Evidence[] = [{ code: 'numbered-lines', detail: `${numbered.length} of ${lines.length} non-blank lines` }];
  if (numbered.length < 2) return { method: 'numbering', status: 'no-structure', reasonCode: 'too-few-numbered-lines', evidence: base, alternatives: [] };

  // Levels: dotted depth; other styles nest under the current dotted item, in order of first appearance.
  const styleOrder: NumberStyle[] = [];
  let dottedDepth = 0;
  const items: Item[] = numbered.map((n) => {
    if (n.style === 'dotted') {
      dottedDepth = n.parts.length;
      return { line: n.line, label: n.label, level: n.parts.length };
    }
    if (!styleOrder.includes(n.style)) styleOrder.push(n.style);
    return { line: n.line, label: n.label, level: dottedDepth + 1 + styleOrder.indexOf(n.style) };
  });
  base.push({ code: 'number-styles', detail: [...new Set(numbered.map((n) => n.style))].join(',') });

  const byPosition = nestByLevel(items, limits);
  // By number: a dotted item's parent is the latest item whose number is its prefix (1.2 for 1.2.3).
  const latest = new Map<string, number>();
  const positionalParent: (number | undefined)[] = [];
  {
    const stack: number[] = [];
    items.forEach((item, index) => {
      while (stack.length > 0 && items[stack[stack.length - 1]].level >= item.level) stack.pop();
      positionalParent[index] = stack[stack.length - 1];
      stack.push(index);
    });
  }
  const issues: { code: string; line: number; detail: string }[] = [];
  const numberParent: (number | undefined)[] = [];
  numbered.forEach((n, index) => {
    if (n.style === 'dotted') {
      const key = n.parts.join('.');
      const parentKey = n.parts.slice(0, -1).join('.');
      const parent = parentKey ? latest.get(parentKey) : undefined;
      if (parentKey && parent === undefined) issues.push({ code: 'numbering-missing-parent', line: n.line, detail: `${key} has no ${parentKey}` });
      if (latest.has(key)) issues.push({ code: 'numbering-duplicate', line: n.line, detail: `${key} repeats` });
      numberParent[index] = parent;
      latest.set(key, index);
    } else numberParent[index] = positionalParent[index];
  });
  // Sibling sequence: each number follows its previous sibling by one, starting at 1.
  const lastChild = new Map<string, number>();
  numbered.forEach((n, index) => {
    const scope = `${numberParent[index] ?? 'root'}\u0000${n.style}`;
    const value = n.parts[n.parts.length - 1];
    const previous = lastChild.get(scope);
    const expected = previous === undefined ? 1 : previous + 1;
    if (value !== expected && !(n.style === 'dotted' && previous === value)) {
      issues.push({ code: 'numbering-gap', line: n.line, detail: `${n.parts.join('.')} where ${expected} was expected` });
    } else if (n.style !== 'dotted' && previous === value) {
      issues.push({ code: 'numbering-duplicate', line: n.line, detail: `(${value}) repeats` });
    }
    lastChild.set(scope, value);
  });
  const byNumber = nestByLevel(items, limits, (index) => numberParent[index]);

  const issueEvidence: Evidence[] = issues
    .sort((a, b) => a.line - b.line)
    .slice(0, EVIDENCE_LIST_MAX)
    .map((issue) => ({ code: issue.code, detail: `L${issue.line}: ${issue.detail}` }));
  const evidence = [...base, ...issueEvidence];
  const found = distinct([
    { variant: 'by-position', tree: byPosition, evidence: [{ code: 'parent-rule', detail: 'nearest earlier shallower number' }] },
    { variant: 'by-number', tree: byNumber, evidence: [{ code: 'parent-rule', detail: 'number prefix (1.2 is the parent of 1.2.1)' }] },
  ]).filter((a) => nested(a.tree));
  if (found.length === 0) return { method: 'numbering', status: 'no-structure', reasonCode: issues.length > 0 ? issues[0].code : 'no-nesting', evidence, alternatives: [] };
  if (found.length === 1 && issues.length === 0) return { method: 'numbering', status: 'structured', reasonCode: 'numbering-levels', evidence, alternatives: found };
  const reasonCode = issues.length > 0 ? issues[0].code : 'numbering-position-number-disagree';
  return { method: 'numbering', status: 'ambiguous', reasonCode, evidence, alternatives: found };
}

// --- prefix ------------------------------------------------------------------------------

function prefixOutcome(lines: readonly SourceLine[], pattern: RegExp, whole: RegExp, limits: TreeLimits): TextMethodOutcome {
  const coded: { line: number; label: string; code: string }[] = [];
  for (const line of lines) {
    const match = pattern.exec(line.label);
    if (!match || !match[0]) continue;
    const next = line.label[match[0].length];
    if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) continue;
    coded.push({ line: line.line, label: line.label, code: match[0] });
  }
  const base: Evidence[] = [
    { code: 'coded-lines', detail: `${coded.length} of ${lines.length} non-blank lines` },
    { code: 'parent-rule', detail: 'longest other code that is a prefix up to a separator' },
  ];
  if (coded.length < 2) return { method: 'prefix', status: 'no-structure', reasonCode: 'too-few-coded-lines', evidence: base, alternatives: [] };

  const isBoundary = (code: string, prefix: string): boolean =>
    code.length > prefix.length && code.startsWith(prefix) && !/[\p{L}\p{N}]/u.test(code[prefix.length]);
  const codes = new Set(coded.map((c) => c.code));
  const issues: { code: string; line: number; detail: string }[] = [];
  const firstAt = new Map<string, number>();
  coded.forEach((c, index) => {
    if (firstAt.has(c.code)) issues.push({ code: 'prefix-duplicate', line: c.line, detail: `${c.code} repeats` });
    else firstAt.set(c.code, index);
  });
  // Missing ancestors: a truncation at a separator that is itself a well-formed code but never appears.
  for (const c of coded) {
    for (let cut = c.code.length - 1; cut > 0; cut -= 1) {
      const prefix = c.code.slice(0, cut);
      if (!isBoundary(c.code, prefix) || codes.has(prefix)) continue;
      const trimmed = prefix.replace(/[^\p{L}\p{N}]+$/u, '');
      if (trimmed === prefix && whole.test(prefix)) {
        issues.push({ code: 'prefix-parent-missing', line: c.line, detail: `${c.code} has no ${prefix}` });
        break;
      }
    }
  }
  // Longest present code that is a prefix of `code` up to a separator.
  const parentCode = (code: string): string | undefined => {
    for (let cut = code.length - 1; cut > 0; cut -= 1) {
      const prefix = code.slice(0, cut);
      if (isBoundary(code, prefix) && codes.has(prefix)) return prefix;
    }
    return undefined;
  };
  const nearestParent: (number | undefined)[] = [];
  const firstParent: (number | undefined)[] = [];
  {
    const latest = new Map<string, number>();
    coded.forEach((c, index) => {
      const parent = parentCode(c.code);
      nearestParent[index] = parent ? latest.get(parent) : undefined;
      const first = parent ? firstAt.get(parent) : undefined;
      firstParent[index] = first !== undefined && first < index ? first : undefined;
      latest.set(c.code, index);
    });
  }
  const resolve = (choose: 'nearest' | 'first') => (index: number): number | undefined =>
    choose === 'first' ? firstParent[index] : nearestParent[index];
  coded.forEach((c, index) => {
    const parent = parentCode(c.code);
    if (parent && (firstAt.get(parent) ?? Infinity) > index) issues.push({ code: 'prefix-parent-later', line: c.line, detail: `${parent} appears after ${c.code}` });
  });
  const items = coded.map((c) => ({ line: c.line, label: c.label, level: 0 }));
  const found = distinct([
    { variant: 'nearest-earlier-parent', tree: nestByLevel(items, limits, resolve('nearest')), evidence: [{ code: 'duplicate-parent', detail: 'nearest earlier occurrence' }] },
    { variant: 'first-parent', tree: nestByLevel(items, limits, resolve('first')), evidence: [{ code: 'duplicate-parent', detail: 'first occurrence' }] },
  ]).filter((a) => nested(a.tree));
  const evidence = [
    ...base,
    ...issues
      .sort((a, b) => a.line - b.line)
      .slice(0, EVIDENCE_LIST_MAX)
      .map((issue) => ({ code: issue.code, detail: `L${issue.line}: ${issue.detail}` })),
  ];
  if (found.length === 0) return { method: 'prefix', status: 'no-structure', reasonCode: issues.length > 0 ? issues[0].code : 'no-nesting', evidence, alternatives: [] };
  if (found.length === 1 && issues.length === 0) return { method: 'prefix', status: 'structured', reasonCode: 'prefix-code-hierarchy', evidence, alternatives: found };
  return { method: 'prefix', status: 'ambiguous', reasonCode: issues[0]?.code ?? 'prefix-duplicate', evidence, alternatives: found };
}

// --- entry points ------------------------------------------------------------------------

export function structuralizeText(text: string, options: TextStructuralizeOptions): TextStructuralizeResult {
  const limits = options.limits ?? DEFAULT_TREE_LIMITS;
  const diagnostics: TreeDiagnostic[] = [];
  const { lines, skippedFenced } = sourceLines(text, options.skipFencedCode ?? false);
  const outcomes: TextMethodOutcome[] = [];
  for (const method of TEXT_TREE_METHODS.filter((m) => options.methods.includes(m))) {
    try {
      if (method === 'indent') outcomes.push(indentOutcome(lines, limits));
      else if (method === 'numbering') outcomes.push(numberingOutcome(lines, limits));
      else {
        let pattern: RegExp;
        let whole: RegExp;
        try {
          if (!options.prefix) throw new Error('no pattern given');
          pattern = new RegExp(`^(?:${options.prefix})`, 'u');
          whole = new RegExp(`^(?:${options.prefix})$`, 'u');
        } catch (error) {
          diagnostics.push({ code: 'MMI_TREE_TEXT_BAD_PREFIX', severity: 'error', message: `prefix pattern: ${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
        outcomes.push(prefixOutcome(lines, pattern, whole, limits));
      }
    } catch (error) {
      if (!(error instanceof TreeLimitError)) throw error;
      diagnostics.push(limitDiagnostic(error));
    }
  }
  if (skippedFenced > 0) for (const outcome of outcomes) outcome.evidence.push({ code: 'skipped-fenced-code-lines', detail: String(skippedFenced) });

  const trees = distinct(outcomes.flatMap((o) => o.alternatives.map((a) => ({ ...a, variant: `${o.method}:${a.variant}` }))));
  const status: TextOutcomeStatus =
    trees.length === 0 ? 'no-structure' : trees.length === 1 && outcomes.every((o) => o.status !== 'ambiguous') ? 'structured' : 'ambiguous';
  return { outcomes, diagnostics, status };
}

export interface TextTreeCandidateInput {
  source: string;
  sourceDigest: string;
  options: TextStructuralizeOptions;
  result: TextStructuralizeResult;
}

/** A flattened, ordered view of all alternatives with the method that produced each. */
export function textTreeChoices(result: TextStructuralizeResult): { method: TextTreeMethod; outcome: TextMethodOutcome; alternative: TextTreeAlternative }[] {
  const seen = new Set<string>();
  const choices: { method: TextTreeMethod; outcome: TextMethodOutcome; alternative: TextTreeAlternative }[] = [];
  for (const outcome of result.outcomes) {
    for (const alternative of outcome.alternatives) {
      const key = canonicalTree(alternative.tree);
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push({ method: outcome.method, outcome, alternative });
    }
  }
  return choices;
}

/**
 * Candidates for a text source: one per distinct structure. When several
 * exist (or a method found the rules contradicted), each carries an
 * `alternative` claim and an abstained `selection` claim. When none exists,
 * one Candidate with every claim abstained.
 */
export function textTreeCandidates(input: TextTreeCandidateInput): Candidate[] {
  const limits = input.options.limits ?? DEFAULT_TREE_LIMITS;
  const config = (method: string, variant: string): Record<string, string | number | boolean> => ({
    method,
    variant,
    enabledMethods: TEXT_TREE_METHODS.filter((m) => input.options.methods.includes(m)).join(','),
    ...(input.options.prefix !== undefined ? { prefix: input.options.prefix } : {}),
    skipFencedCode: input.options.skipFencedCode ?? false,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
  });
  const choices = textTreeChoices(input.result);
  if (choices.length === 0) {
    return [
      abstainedTreeCandidate({
        source: input.source,
        sourceDigest: input.sourceDigest,
        algorithm: TEXT_TREE_ALGORITHM,
        implementationVersion: TEXT_TREE_VERSION,
        config: config('none', 'none'),
        reasonCode: 'no-structure-found',
        evidence: input.result.outcomes.map((o) => ({ code: `${o.method}:${o.reasonCode}` })),
      }),
    ];
  }
  const ambiguous = input.result.status === 'ambiguous';
  return choices.map(({ method, outcome, alternative }, index) =>
    treeCandidate({
      source: input.source,
      sourceDigest: input.sourceDigest,
      algorithm: TEXT_TREE_ALGORITHM,
      implementationVersion: TEXT_TREE_VERSION,
      config: config(method, alternative.variant),
      status: 'inferred',
      method: 'M1',
      reasonCode: outcome.status === 'ambiguous' ? `${method}-rules` : outcome.reasonCode,
      evidence: [...outcome.evidence, ...alternative.evidence],
      tree: alternative.tree,
      ...(ambiguous
        ? {
            alternative: {
              index: index + 1,
              of: choices.length,
              reasonCode: outcome.status === 'ambiguous' ? outcome.reasonCode : 'methods-disagree',
            },
          }
        : {}),
    }),
  );
}
