import { TextDecoder } from 'node:util';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
  type Evidence,
} from '../core/candidate.js';

export const FLAT_TEXT_TREE_STRUCTURALIZER_VERSION = '1';

export type FlatTextTreeMethod =
  | 'indent'
  | 'heading-number'
  | 'prefix-code';

export interface FlatTextTreeOptions {
  methods: readonly FlatTextTreeMethod[];
  /** Deterministic indentation width used only when a line starts with tabs. */
  tabWidth?: number;
}

export interface FlatTextTreeNode {
  line: number;
  text: string;
  label: string;
  depth: number;
  parentLine?: number;
  childLines: readonly number[];
  structuralPath: string;
  candidate: Candidate;
}

export interface FlatTextTreeHypothesis {
  method: FlatTextTreeMethod;
  status: 'inferred' | 'abstained';
  reasonCode: string;
  nodes: readonly FlatTextTreeNode[];
  candidates: readonly Candidate[];
  edgeSignature: string;
}

export interface FlatTextTreeDocument {
  hypotheses: readonly FlatTextTreeHypothesis[];
  candidates: readonly Candidate[];
  /** True when two successful deterministic rules imply different parent-child edges. */
  ambiguous: boolean;
}

interface SourceLine {
  line: number;
  raw: string;
  text: string;
  leading: string;
}

interface ParsedNode {
  line: number;
  text: string;
  label: string;
  depth: number;
  parentLine?: number;
  marker?: string;
  evidence: Evidence[];
}

interface MethodResult {
  nodes?: ParsedNode[];
  abstain?: {
    reasonCode: string;
    evidence: Evidence[];
  };
}

export const DEFAULT_FLAT_TEXT_TREE_METHODS: readonly FlatTextTreeMethod[] = [
  'indent',
  'heading-number',
  'prefix-code',
];

const METHOD_ORDER = DEFAULT_FLAT_TEXT_TREE_METHODS;

export function decodeFlatTextUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('flat-text Tree sources must be valid UTF-8');
  }
}

export function readFlatTextTree(
  text: string,
  source: string,
  sourceDigest: string,
  options: FlatTextTreeOptions,
): FlatTextTreeDocument {
  const tabWidth = options.tabWidth ?? 4;
  if (!Number.isInteger(tabWidth) || tabWidth <= 0 || tabWidth > 16) {
    throw new Error('flat-text tabWidth must be an integer from 1 to 16');
  }
  const enabled = new Set(options.methods);
  if (enabled.size === 0) {
    throw new Error('flat-text structuralizer needs at least one enabled method');
  }
  for (const method of enabled) {
    if (!METHOD_ORDER.includes(method)) {
      throw new Error(`unsupported flat-text tree method: ${String(method)}`);
    }
  }

  const lines = sourceLines(text);
  const hypotheses: FlatTextTreeHypothesis[] = [];
  for (const method of METHOD_ORDER) {
    if (!enabled.has(method)) continue;
    const result = method === 'indent'
      ? inferIndent(lines, tabWidth)
      : method === 'heading-number'
        ? inferHeadingNumber(lines)
        : inferPrefixCode(lines);
    if (!result.nodes && !result.abstain) continue;
    hypotheses.push(
      result.nodes
        ? inferredHypothesis(method, result.nodes, source, sourceDigest, {
            tabWidth,
          })
        : abstainedHypothesis(
            method,
            result.abstain!,
            source,
            sourceDigest,
            text,
            { tabWidth },
          ),
    );
  }

  const successful = hypotheses.filter(
    (item) => item.status === 'inferred',
  );
  const edgeSignatures = new Set(successful.map((item) => item.edgeSignature));

  return {
    hypotheses,
    candidates: hypotheses.flatMap((item) => item.candidates),
    ambiguous: edgeSignatures.size > 1,
  };
}

function sourceLines(text: string): SourceLine[] {
  return text
    .replace(/^\uFEFF/u, '')
    .split(/\r\n?|\n/u)
    .map((raw, index) => {
      const leading = raw.match(/^[\t ]*/u)?.[0] ?? '';
      return {
        line: index + 1,
        raw,
        leading,
        text: raw.trim(),
      };
    })
    .filter((line) => line.text.length > 0);
}

function inferIndent(
  lines: readonly SourceLine[],
  tabWidth: number,
): MethodResult {
  if (lines.length < 2) return {};

  const mixed = lines.find((line) =>
    line.leading.includes(' ') && line.leading.includes('\t'));
  if (mixed) {
    return {
      abstain: {
        reasonCode: 'flat-text-indent-mixed-whitespace',
        evidence: [{
          code: 'mixed-leading-whitespace',
          detail: `line ${mixed.line} mixes tabs and spaces`,
        }],
      },
    };
  }

  const absolute = lines.map((line) => ({
    line,
    columns: indentationColumns(line.leading, tabWidth),
  }));
  const baseline = Math.min(...absolute.map((item) => item.columns));
  const normalized = absolute.map((item) => ({
    ...item,
    columns: item.columns - baseline,
  }));
  if (!normalized.some((item) => item.columns > 0)) return {};

  const parsed: ParsedNode[] = [];
  const stack: Array<{ node: ParsedNode; columns: number }> = [];
  for (const item of normalized) {
    while (
      stack.length > 0
      && stack[stack.length - 1].columns >= item.columns
    ) {
      stack.pop();
    }

    const parent = stack.at(-1)?.node;
    if (item.columns > 0 && !parent) {
      return {
        abstain: {
          reasonCode: 'flat-text-indent-parent-missing',
          evidence: [{
            code: 'indent-parent-missing',
            detail: `line ${item.line.line} is indented without a preceding shallower line`,
          }],
        },
      };
    }
    const node: ParsedNode = {
      line: item.line.line,
      text: item.line.raw,
      label: item.line.text,
      depth: parent ? parent.depth + 1 : 0,
      ...(parent ? { parentLine: parent.line } : {}),
      evidence: [{
        code: 'leading-indentation',
        detail: `line ${item.line.line}: ${item.columns} normalized indentation columns`,
      }],
    };
    parsed.push(node);
    stack.push({ node, columns: item.columns });
  }

  return hasHierarchy(parsed) ? { nodes: parsed } : {};
}

function indentationColumns(leading: string, tabWidth: number): number {
  let columns = 0;
  for (const char of leading) {
    if (char === '\t') {
      columns += tabWidth - (columns % tabWidth);
    } else {
      columns += 1;
    }
  }
  return columns;
}

function inferHeadingNumber(lines: readonly SourceLine[]): MethodResult {
  const matched = lines.flatMap((line) => {
    const match = line.raw.match(
      /^\s*(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/u,
    );
    if (!match) return [];
    const parts = match[1].split('.');
    return [{
      source: line,
      key: parts.join('.'),
      parentKey: parts.length > 1 ? parts.slice(0, -1).join('.') : undefined,
      depth: parts.length - 1,
      label: match[2].trim(),
      marker: match[1],
    }];
  });
  if (matched.length < 2 || !matched.some((item) => item.depth > 0)) {
    return {};
  }

  const seen = new Map<string, number>();
  const parsed: ParsedNode[] = [];
  for (const item of matched) {
    if (seen.has(item.key)) {
      return {
        abstain: {
          reasonCode: 'flat-text-heading-number-duplicate',
          evidence: [{
            code: 'duplicate-heading-number',
            detail: `heading number ${item.key} appears on lines ${seen.get(item.key)} and ${item.source.line}`,
          }],
        },
      };
    }

    let parentLine: number | undefined;
    if (item.parentKey) {
      parentLine = seen.get(item.parentKey);
      if (parentLine === undefined) {
        return {
          abstain: {
            reasonCode: 'flat-text-heading-number-parent-missing',
            evidence: [{
              code: 'heading-number-parent-missing',
              detail: `line ${item.source.line} uses ${item.key} but parent ${item.parentKey} was not seen earlier`,
            }],
          },
        };
      }
    }

    seen.set(item.key, item.source.line);
    parsed.push({
      line: item.source.line,
      text: item.source.raw,
      label: item.label,
      depth: item.depth,
      ...(parentLine !== undefined ? { parentLine } : {}),
      marker: item.marker,
      evidence: [{
        code: 'heading-number',
        detail: `line ${item.source.line}: ${item.key}`,
      }],
    });
  }
  return { nodes: parsed };
}

function inferPrefixCode(lines: readonly SourceLine[]): MethodResult {
  const matched = lines.flatMap((line) => {
    const match = line.raw.match(
      /^\s*([A-Za-z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)+)[.:)]?\s+(.+)$/u,
    );
    if (!match) return [];
    const parts = match[1].split(/[-/]/u);
    return [{
      source: line,
      key: parts.join('\u001f'),
      parentKey: parts.length > 2
        ? parts.slice(0, -1).join('\u001f')
        : undefined,
      depth: parts.length - 2,
      label: match[2].trim(),
      marker: match[1],
    }];
  });
  if (matched.length < 2 || !matched.some((item) => item.depth > 0)) {
    return {};
  }

  const seen = new Map<string, number>();
  const parsed: ParsedNode[] = [];
  for (const item of matched) {
    if (seen.has(item.key)) {
      return {
        abstain: {
          reasonCode: 'flat-text-prefix-code-duplicate',
          evidence: [{
            code: 'duplicate-prefix-code',
            detail: `code ${item.marker} is duplicated`,
          }],
        },
      };
    }
    let parentLine: number | undefined;
    if (item.parentKey) {
      parentLine = seen.get(item.parentKey);
      if (parentLine === undefined) {
        return {
          abstain: {
            reasonCode: 'flat-text-prefix-code-parent-missing',
            evidence: [{
              code: 'prefix-code-parent-missing',
              detail: `line ${item.source.line} has no preceding parent code`,
            }],
          },
        };
      }
    }
    seen.set(item.key, item.source.line);
    parsed.push({
      line: item.source.line,
      text: item.source.raw,
      label: item.label,
      depth: item.depth,
      ...(parentLine !== undefined ? { parentLine } : {}),
      marker: item.marker,
      evidence: [{
        code: 'prefix-code',
        detail: `line ${item.source.line}: ${item.marker}`,
      }],
    });
  }
  return { nodes: parsed };
}

function hasHierarchy(nodes: readonly ParsedNode[]): boolean {
  return nodes.some((node) => node.parentLine !== undefined);
}

function inferredHypothesis(
  method: FlatTextTreeMethod,
  nodes: readonly ParsedNode[],
  source: string,
  sourceDigest: string,
  config: { tabWidth: number },
): FlatTextTreeHypothesis {
  const childLines = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentLine === undefined) continue;
    const children = childLines.get(node.parentLine) ?? [];
    children.push(node.line);
    childLines.set(node.parentLine, children);
  }

  const byLine = new Map(nodes.map((node) => [node.line, node]));
  const subtree = (line: number): unknown => {
    const node = byLine.get(line)!;
    return {
      text: node.text.trim(),
      children: (childLines.get(line) ?? []).map(subtree),
    };
  };

  const materialized: FlatTextTreeNode[] = nodes.map((node) => {
    const children = childLines.get(node.line) ?? [];
    const structuralPath = `text:${method}:line:${node.line}`;
    const claims: Candidate['claims'] = [
      {
        aspect: 'source-line',
        value: node.text,
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'flat-text-source-line',
      },
      {
        aspect: 'line-number',
        value: String(node.line),
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'flat-text-line-number',
      },
      ...(node.marker
        ? [{
            aspect: 'marker',
            value: node.marker,
            status: 'observed' as const,
            execution: 'deterministic' as const,
            method: 'M0' as const,
            reasonCode: 'flat-text-structural-marker',
          }]
        : []),
      {
        aspect: 'structural-path',
        value: structuralPath,
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `flat-text-${method}-path`,
        evidence: node.evidence,
      },
      {
        aspect: 'hierarchy-depth',
        value: String(node.depth),
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `flat-text-${method}-depth`,
        evidence: node.evidence,
      },
      {
        aspect: 'parent-line',
        value: node.parentLine === undefined
          ? '(root)'
          : String(node.parentLine),
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `flat-text-${method}-parent`,
        evidence: node.evidence,
      },
      {
        aspect: 'children',
        value: children.map(String),
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `flat-text-${method}-children`,
        evidence: node.evidence,
      },
    ];

    const candidate: Candidate = {
      kind: 'tree',
      locator: {
        source,
        sourceDigest,
        structuralPath,
      },
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      claims,
      provenance: {
        algorithm: `mmi.flat-text-tree.${method}`,
        run: {
          execution: 'deterministic',
          inputDigest: sourceDigest,
          config: {
            method,
            ...(method === 'indent' ? { tabWidth: config.tabWidth } : {}),
          },
          implementationVersion: FLAT_TEXT_TREE_STRUCTURALIZER_VERSION,
        },
      },
      fingerprint: fingerprintOf(
        'flat-text-subtree-v1',
        JSON.stringify(subtree(node.line)),
      ),
      scores: [],
    };
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `invalid flat-text Tree Candidate at line ${node.line}: ${problem}`,
      );
    }

    return {
      line: node.line,
      text: node.text,
      label: node.label,
      depth: node.depth,
      ...(node.parentLine !== undefined
        ? { parentLine: node.parentLine }
        : {}),
      childLines: children,
      structuralPath,
      candidate,
    };
  });

  return {
    method,
    status: 'inferred',
    reasonCode: `flat-text-${method}-hierarchy`,
    nodes: materialized,
    candidates: materialized.map((node) => node.candidate),
    edgeSignature: edgeSignature(nodes),
  };
}

function abstainedHypothesis(
  method: FlatTextTreeMethod,
  abstain: { reasonCode: string; evidence: Evidence[] },
  source: string,
  sourceDigest: string,
  text: string,
  config: { tabWidth: number },
): FlatTextTreeHypothesis {
  const structuralPath = `text:${method}`;
  const candidate: Candidate = {
    kind: 'tree',
    locator: {
      source,
      sourceDigest,
      structuralPath,
    },
    status: 'abstained',
    execution: 'deterministic',
    method: 'M1',
    claims: [{
      aspect: 'hierarchy',
      status: 'abstained',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: abstain.reasonCode,
      evidence: abstain.evidence,
    }],
    provenance: {
      algorithm: `mmi.flat-text-tree.${method}`,
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          method,
          ...(method === 'indent' ? { tabWidth: config.tabWidth } : {}),
        },
        implementationVersion: FLAT_TEXT_TREE_STRUCTURALIZER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'flat-text-source-v1',
      text.replace(/\r\n/gu, '\n'),
    ),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(
      `invalid abstained flat-text Tree Candidate for ${method}: ${problem}`,
    );
  }
  return {
    method,
    status: 'abstained',
    reasonCode: abstain.reasonCode,
    nodes: [],
    candidates: [candidate],
    edgeSignature: '',
  };
}

function edgeSignature(nodes: readonly ParsedNode[]): string {
  return nodes
    .filter((node) => node.parentLine !== undefined)
    .map((node) => `${node.parentLine}>${node.line}`)
    .sort()
    .join(',');
}
