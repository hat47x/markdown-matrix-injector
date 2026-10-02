/**
 * `mmi tree` and the tree part of `mmi inspect` (issue-0199).
 *
 * Read-only: reads one source, writes Markdown only with `-o`. When the
 * rules allow more than one structure the command lists them and exits 1;
 * it never picks one silently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonTree, jsonTreeCandidate } from '../adapters/jsonTreeAdapter.js';
import { isXmlSpreadsheet2003, readXmlTree, xmlTreeCandidate } from '../adapters/xmlTreeAdapter.js';
import {
  structuralizeText,
  TEXT_TREE_METHODS,
  textTreeCandidates,
  textTreeChoices,
  type TextOutcomeStatus,
  type TextTreeMethod,
} from '../adapters/textTreeStructuralizer.js';
import type { TreeDiagnostic } from '../adapters/treeCandidates.js';
import type { Candidate } from '../core/candidate.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import { DEFAULT_TREE_LIMITS, type Tree, type TreeLimits } from '../core/tree.js';
import { projectNestedList } from '../core/treeProjection.js';

export type TreeSourceFormat = 'json' | 'xml' | 'text';
export type TreeMethodOption = 'auto' | TextTreeMethod;

export const MAX_DEPTH_CEILING = 1000;

/** Which tree adapter reads a file, or undefined when it is a table source (XML Spreadsheet 2003 included) or unknown. */
export function treeSourceFormat(absolutePath: string, bytes?: Buffer): TreeSourceFormat | undefined {
  const extension = path.extname(absolutePath).toLowerCase();
  if (extension === '.json') return 'json';
  if (extension === '.txt' || extension === '.md') return 'text';
  if (extension === '.xml') {
    const text = (bytes ?? fs.readFileSync(absolutePath)).toString('utf8');
    return isXmlSpreadsheet2003(text) ? undefined : 'xml';
  }
  return undefined;
}

export interface TreeReadOptions {
  method?: TreeMethodOption;
  prefix?: string;
  limits?: TreeLimits;
  /** Write the source path relative to this document. */
  fromDocument?: string;
}

export interface TreeChoice {
  /** 1-based; matches `candidates[index - 1]`. */
  index: number;
  method: string;
  variant: string;
  tree: Tree;
}

export interface TreeReport {
  source: string;
  format: TreeSourceFormat;
  status: TextOutcomeStatus | 'error';
  choices: TreeChoice[];
  candidates: Candidate[];
  diagnostics: TreeDiagnostic[];
  /** Text sources: what each enabled method concluded (trees are in `choices`). */
  outcomes?: { method: TextTreeMethod; status: TextOutcomeStatus; reasonCode: string; alternatives: number; evidence: { code: string; detail?: string }[] }[];
}

function relativeSource(absolutePath: string, fromDocument?: string): string {
  const base = fromDocument ? path.dirname(path.resolve(fromDocument)) : process.cwd();
  let relative = path.relative(base, absolutePath).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

export function readTreeSource(absolutePath: string, options: TreeReadOptions = {}): TreeReport {
  const bytes = fs.readFileSync(absolutePath);
  const source = relativeSource(absolutePath, options.fromDocument);
  const sourceDigest = createSourceIdentityFromBytes(bytes).digest;
  const limits = options.limits ?? DEFAULT_TREE_LIMITS;
  const extension = path.extname(absolutePath).toLowerCase();
  const text = bytes.toString('utf8');

  if (extension === '.json' || extension === '.xml') {
    const format: TreeSourceFormat = extension === '.json' ? 'json' : 'xml';
    const read = format === 'json' ? readJsonTree(text, limits) : readXmlTree(text, limits);
    if (!read.tree) return { source, format, status: 'error', choices: [], candidates: [], diagnostics: read.diagnostics };
    const candidate = format === 'json'
      ? jsonTreeCandidate({ source, sourceDigest, tree: read.tree, limits })
      : xmlTreeCandidate({ source, sourceDigest, tree: read.tree, limits });
    return {
      source,
      format,
      status: 'structured',
      choices: [{ index: 1, method: format, variant: 'explicit', tree: read.tree }],
      candidates: [candidate],
      diagnostics: read.diagnostics,
    };
  }

  const method = options.method ?? 'auto';
  const methods: TextTreeMethod[] = method === 'auto' ? TEXT_TREE_METHODS.filter((m) => m !== 'prefix' || options.prefix !== undefined) : [method];
  const textOptions = { methods, ...(options.prefix !== undefined ? { prefix: options.prefix } : {}), skipFencedCode: extension === '.md', limits };
  const result = structuralizeText(text, textOptions);
  // A method that hit a limit or had a bad pattern produced nothing; deciding among the rest would hide it.
  const failed = result.diagnostics.some((d) => d.severity === 'error');
  const choices = textTreeChoices(result).map(({ method: m, alternative }, i) => ({ index: i + 1, method: m, variant: alternative.variant, tree: alternative.tree }));
  return {
    source,
    format: 'text',
    status: failed ? 'error' : result.status,
    choices,
    candidates: result.outcomes.length === 0 ? [] : textTreeCandidates({ source, sourceDigest, options: textOptions, result }),
    diagnostics: result.diagnostics,
    outcomes: result.outcomes.map((o) => ({ method: o.method, status: o.status, reasonCode: o.reasonCode, alternatives: o.alternatives.length, evidence: o.evidence })),
  };
}

/** Summary lines for `mmi inspect` text output. */
export function formatTreeInspect(report: Omit<TreeReport, 'choices'> & { choices: readonly Omit<TreeChoice, 'tree'>[] }): string[] {
  const lines: string[] = [];
  const claim = (candidate: Candidate, aspect: string) => candidate.claims.find((c) => c.aspect === aspect);
  report.candidates.forEach((candidate, i) => {
    const hierarchy = claim(candidate, 'hierarchy');
    const alternative = claim(candidate, 'alternative');
    const choice = report.choices[i];
    const label = alternative ? `tree ${alternative.value}` : 'tree';
    if (candidate.status === 'abstained') {
      lines.push(`${label}: no structure found (${(hierarchy?.evidence ?? []).map((e) => e.code).join(', ') || hierarchy?.reasonCode})`);
      return;
    }
    lines.push(`${label}: ${choice?.method ?? report.format}${choice && choice.variant !== 'explicit' ? ` (${choice.variant})` : ''}  ${candidate.status} ${candidate.method}  ${hierarchy?.value ?? ''}${alternative ? `  [not decided: ${alternative.reasonCode}]` : ''}`);
  });
  if (report.diagnostics.length > 0) lines.push('tree problems:', ...report.diagnostics.map((d) => `  ${d.severity} ${d.code}${d.line ? ` line ${d.line}` : ''}: ${d.message}`));
  return lines;
}

function header(report: TreeReport, choice: TreeChoice): string {
  const candidate = report.candidates[choice.index - 1];
  return `<!-- mmi:tree source="${report.source}" method="${choice.method}" status="${candidate.status}" fingerprint="${candidate.fingerprint.digest}" -->`;
}

export interface TreeCommandIo {
  out: (text: string) => void;
  err: (text: string) => void;
  usage: (message: string) => number;
}

export interface TreeCommandValues {
  json?: boolean;
  method?: string;
  prefix?: string;
  'max-depth'?: string;
  'max-nodes'?: string;
  from?: string;
}

function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return /^\d+$/u.test(value) && Number(value) > 0 ? Number(value) : Number.NaN;
}

export function runTree(args: readonly string[], values: TreeCommandValues, io: TreeCommandIo): number {
  if (args.length !== 1) return io.usage('tree takes one source file');
  const method = (values.method ?? 'auto') as TreeMethodOption;
  if (!['auto', ...TEXT_TREE_METHODS].includes(method)) return io.usage('--method must be auto, indent, numbering or prefix');
  if (method === 'prefix' && !values.prefix) return io.usage('--method prefix needs --prefix <regex>');
  const maxDepth = positiveInt(values['max-depth']);
  const maxNodes = positiveInt(values['max-nodes']);
  if (Number.isNaN(maxDepth) || (maxDepth ?? 0) > MAX_DEPTH_CEILING) return io.usage(`--max-depth must be an integer from 1 to ${MAX_DEPTH_CEILING}`);
  if (Number.isNaN(maxNodes)) return io.usage('--max-nodes must be a positive integer');
  const absolute = path.resolve(args[0]);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    io.err(`mmi: MMI_TREE_SOURCE_NOT_FOUND: ${args[0]}`);
    return 1;
  }
  const extension = path.extname(absolute).toLowerCase();
  if (!['.json', '.xml', '.txt', '.md'].includes(extension)) return io.usage('tree reads .json, .xml, .txt or .md');
  if ((extension === '.json' || extension === '.xml') && (method !== 'auto' || values.prefix)) {
    return io.usage('--method and --prefix apply to text sources (.txt, .md) only');
  }

  const report = readTreeSource(absolute, {
    method,
    ...(values.prefix !== undefined ? { prefix: values.prefix } : {}),
    limits: { maxDepth: maxDepth ?? DEFAULT_TREE_LIMITS.maxDepth, maxNodes: maxNodes ?? DEFAULT_TREE_LIMITS.maxNodes },
    ...(values.from ? { fromDocument: values.from } : {}),
  });
  for (const d of report.diagnostics) io.err(`mmi: ${d.code}${d.line ? ` (line ${d.line}${d.column ? `:${d.column}` : ''})` : ''}: ${d.message}`);

  if (values.json) {
    io.out(JSON.stringify(report, null, 2));
    return report.status === 'structured' ? 0 : 1;
  }
  if (report.status === 'structured') {
    const choice = report.choices[0];
    io.out(`${header(report, choice)}\n\n${projectNestedList(choice.tree)}`);
    return 0;
  }
  if (report.status === 'ambiguous') {
    io.err(`mmi: ${report.choices.length} possible structure(s); not choosing one. Pick a method with --method, or fix the source:`);
    report.choices.forEach((choice, i) => {
      const candidate = report.candidates[i];
      const hierarchy = candidate.claims.find((c) => c.aspect === 'hierarchy');
      const alternative = candidate.claims.find((c) => c.aspect === 'alternative');
      io.err(`  [${choice.index}] ${choice.method} (${choice.variant})  ${hierarchy?.value ?? ''}  reason: ${alternative?.reasonCode ?? ''}`);
      for (const e of hierarchy?.evidence ?? []) io.err(`      ${e.code}${e.detail ? `: ${e.detail}` : ''}`);
      const preview = projectNestedList(choice.tree).split('\n').filter(Boolean);
      for (const line of preview.slice(0, 8)) io.err(`      ${line}`);
      if (preview.length > 8) io.err(`      ... (${preview.length - 8} more lines)`);
    });
    return 1;
  }
  if (report.status === 'no-structure') {
    io.err(`mmi: no structure found (${(report.outcomes ?? []).map((o) => `${o.method}: ${o.reasonCode}`).join(', ')})`);
  }
  return 1;
}
