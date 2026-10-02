/**
 * Shared pieces of the Tree / Hierarchy Source Adapters (issue-0199):
 * diagnostics, limits, line positions and the Tree -> `tree` Candidate
 * mapping. The adapters themselves are `jsonTreeAdapter.ts`,
 * `xmlTreeAdapter.ts` and `textTreeStructuralizer.ts`.
 *
 * Candidate claims for a tree:
 *   hierarchy   observed (M0) for JSON/XML nesting, inferred (M1) for text rules
 *   root(s)     the top-level labels, same footing as `hierarchy`
 *   lines       observed (M0): the physical source lines the tree covers
 *   selection   abstained (M1) when the rules allow more than one structure:
 *               the method lists alternatives and declines to pick one
 * A Candidate whose every claim is abstained says "no structure found".
 */
import type { Candidate, Claim, EpistemicStatus, Evidence, MethodClass } from '../core/candidate.js';
import { fingerprintOf } from '../core/candidate.js';
import { canonicalTree, countNodes, treeDepth, type Tree, type TreeLimits } from '../core/tree.js';

export type TreeDiagnosticCode =
  | 'MMI_TREE_LIMIT_DEPTH'
  | 'MMI_TREE_LIMIT_NODES'
  | 'MMI_TREE_JSON_SYNTAX'
  | 'MMI_TREE_JSON_DUPLICATE_KEY'
  | 'MMI_TREE_XML_MALFORMED'
  | 'MMI_TREE_XML_SPREADSHEET'
  | 'MMI_TREE_XML_EXTERNAL_DTD'
  | 'MMI_TREE_XML_DTD_UNSUPPORTED'
  | 'MMI_TREE_XML_DTD_IGNORED'
  | 'MMI_TREE_XML_ENCODING_UNSUPPORTED'
  | 'MMI_TREE_TEXT_BAD_PREFIX'
  | 'MMI_TREE_UNSUPPORTED_SOURCE';

export interface TreeDiagnostic {
  code: TreeDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  /** 1-based. */
  line?: number;
  column?: number;
}

/** Result of an explicit-structure adapter: a tree, or diagnostics that say why there is none. */
export interface ExplicitTreeResult {
  tree?: Tree;
  diagnostics: TreeDiagnostic[];
}

/** Thrown inside a parser when a limit is crossed; adapters turn it into a diagnostic. */
export class TreeLimitError extends Error {
  constructor(
    readonly code: 'MMI_TREE_LIMIT_DEPTH' | 'MMI_TREE_LIMIT_NODES',
    readonly limit: number,
    readonly line: number,
  ) {
    super(
      code === 'MMI_TREE_LIMIT_DEPTH'
        ? `nesting deeper than ${limit} levels at line ${line}; nothing was truncated -- raise --max-depth to read it`
        : `more than ${limit} nodes (reached at line ${line}); nothing was truncated -- raise --max-nodes to read it`,
    );
  }
}

export function limitDiagnostic(error: TreeLimitError): TreeDiagnostic {
  return { code: error.code, severity: 'error', message: error.message, line: error.line };
}

/** 1-based line/column of string offsets, by binary search over line starts. */
export function lineIndex(text: string): (offset: number) => { line: number; column: number } {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function lineSpan(tree: Tree): { first: number; last: number } | undefined {
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  const stack = [...tree.roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    first = Math.min(first, node.locator.line);
    last = Math.max(last, node.locator.line);
    stack.push(...node.children);
  }
  return last > 0 ? { first, last } : undefined;
}

export interface TreeCandidateInput {
  source: string;
  sourceDigest: string;
  algorithm: string;
  implementationVersion: string;
  config: Readonly<Record<string, string | number | boolean>>;
  /** `observed` for explicit structure (JSON/XML), `inferred` for rules over flat text. */
  status: Extract<EpistemicStatus, 'observed' | 'inferred'>;
  method: Extract<MethodClass, 'M0' | 'M1'>;
  /** Stable reason for the hierarchy claim, e.g. `json-object-array-nesting`, `indent-levels`. */
  reasonCode: string;
  evidence?: readonly Evidence[];
  tree: Tree;
  /** When the rules allow several structures: this one's position and the reason the method declines to pick. */
  alternative?: { index: number; of: number; reasonCode: string; evidence?: readonly Evidence[] };
}

export const TREE_FINGERPRINT_REPRESENTATION = 'tree-shape-labels-v1';

export function treeCandidate(input: TreeCandidateInput): Candidate {
  const nodes = countNodes(input.tree);
  const depth = treeDepth(input.tree);
  const span = lineSpan(input.tree);
  const claims: Claim[] = [
    {
      aspect: 'hierarchy',
      value: `nodes=${nodes} depth=${depth} roots=${input.tree.roots.length}`,
      status: input.status,
      execution: 'deterministic',
      method: input.method,
      reasonCode: input.reasonCode,
      ...(input.evidence && input.evidence.length > 0 ? { evidence: input.evidence } : {}),
    },
    {
      aspect: 'roots',
      value: input.tree.roots.slice(0, 20).map((root) => root.label),
      status: input.status,
      execution: 'deterministic',
      method: input.method,
      reasonCode: input.tree.roots.length > 20 ? 'top-level-labels-first-20' : 'top-level-labels',
    },
  ];
  if (span) {
    claims.push({
      aspect: 'lines',
      value: `L${span.first}-L${span.last}`,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'source-line-numbers',
    });
  }
  if (input.alternative) {
    claims.push({
      aspect: 'alternative',
      value: `${input.alternative.index}/${input.alternative.of}`,
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: input.alternative.reasonCode,
      ...(input.alternative.evidence && input.alternative.evidence.length > 0 ? { evidence: input.alternative.evidence } : {}),
    });
    claims.push({
      aspect: 'selection',
      status: 'abstained',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: input.alternative.reasonCode,
    });
  }
  return {
    kind: 'tree',
    locator: { source: input.source, sourceDigest: input.sourceDigest },
    status: input.status,
    execution: 'deterministic',
    method: input.method,
    claims,
    provenance: {
      algorithm: input.algorithm,
      run: { execution: 'deterministic', inputDigest: input.sourceDigest, config: input.config, implementationVersion: input.implementationVersion },
    },
    // Content and nesting, locators excluded: a block that moves keeps its fingerprint.
    fingerprint: fingerprintOf(TREE_FINGERPRINT_REPRESENTATION, canonicalTree(input.tree)),
    scores: [],
  };
}

/** A Candidate that says the method found no structure (every claim abstained). */
export function abstainedTreeCandidate(input: {
  source: string;
  sourceDigest: string;
  algorithm: string;
  implementationVersion: string;
  config: Readonly<Record<string, string | number | boolean>>;
  reasonCode: string;
  evidence?: readonly Evidence[];
}): Candidate {
  return {
    kind: 'tree',
    locator: { source: input.source, sourceDigest: input.sourceDigest },
    status: 'abstained',
    execution: 'deterministic',
    method: 'M1',
    claims: [
      {
        aspect: 'hierarchy',
        status: 'abstained',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: input.reasonCode,
        ...(input.evidence && input.evidence.length > 0 ? { evidence: input.evidence } : {}),
      },
    ],
    provenance: {
      algorithm: input.algorithm,
      run: { execution: 'deterministic', inputDigest: input.sourceDigest, config: input.config, implementationVersion: input.implementationVersion },
    },
    fingerprint: fingerprintOf(TREE_FINGERPRINT_REPRESENTATION, ''),
    scores: [],
  };
}

export type { TreeLimits };
