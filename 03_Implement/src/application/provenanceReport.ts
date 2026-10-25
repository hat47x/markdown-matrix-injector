/**
 * Per-document provenance report (issue #525).
 *
 * Read-only: it resolves the Markdown document's Linked references, joins the
 * adopted Extracted assets with the import ledger and detach freshness, and
 * reports unresolved diagnostics. Source cell values are never copied into
 * the report; only paths, ranges, digests and review metadata are exposed.
 *
 * Review-basis records (#522) are not implemented yet. The report says so
 * explicitly instead of presenting an empty list as "no review needed".
 */
import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';
import {
  PROVENANCE_REPORT_SCHEMA,
} from '../core/provenanceReportContract.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import {
  readLedger,
  sourceKey,
  type LedgerEntry,
} from '../core/importLedger.js';
import { FenceTracker, stripInlineCode } from '../core/markdownLinks.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';
import {
  checkExtractedProvenanceFreshness,
  extractedProvenance,
  type DetachFreshnessProblem,
  type ExtractedProvenance,
} from './detachFreshness.js';
import {
  evaluateReviewBasis,
  type ReviewEvaluation,
} from './reviewBasis.js';

export type ProvenanceLinkedStatus = 'resolved' | 'missing' | 'outside-root';
export type ProvenanceFreshness = 'fresh' | 'stale' | 'missing' | 'untracked' | 'unknown';

export interface ProvenanceDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  code: string;
  message: string;
}

export interface ProvenanceLinkedRecord {
  line: number;
  reference: string;
  source: string;
  status: ProvenanceLinkedStatus;
  sourceDigest?: string;
  sheet?: string;
  range?: string;
}

export interface ProvenanceExtractedRecord {
  line: number;
  kind: ExtractedProvenance['kind'];
  source: string;
  place?: string;
  fingerprint: string;
  freshness: ProvenanceFreshness;
  ledger?: {
    output: string;
    outputDigest?: string;
    conversion: Readonly<Record<string, string | number | boolean>>;
    reviewState: string;
    basis: string;
    reviewedAt: string;
  };
  problems?: { code: string; message: string }[];
}

export interface ProvenanceReport {
  schema: typeof PROVENANCE_REPORT_SCHEMA;
  document: { path: string; digest: string };
  summary: {
    linked: number;
    extracted: number;
    diagnostics: number;
    stale: number;
    missingSources: number;
    reviewStale: number;
    reviewUnrecorded: number;
  };
  linked: ProvenanceLinkedRecord[];
  extracted: ProvenanceExtractedRecord[];
  review: ReviewEvaluation & {
    reasonCode?: string;
    message?: string;
    trackingIssue?: string;
  };
  diagnostics: ProvenanceDiagnostic[];
}

export interface BuildProvenanceReportOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  ledgerPath: string;
  /** Defaults to `<workspaceRoot>/mmi-review-basis.json`. */
  reviewBasisPath?: string;
  /** Reuse the caller's `mmi check` result so CLI and report agree. */
  diagnostics?: readonly ProvenanceDiagnostic[];
}

function portableRelative(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target))
    .split(path.sep).join('/');
}

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

interface ResolvedSource {
  absolute: string;
  relative: string;
  status: 'resolved' | 'missing' | 'outside-root';
  digest?: string;
}

function resolveSource(
  markdownFilePath: string,
  workspaceRoot: string,
  sourceReference: string,
): ResolvedSource {
  const absolute = path.resolve(path.dirname(markdownFilePath), sourceReference);
  const realRoot = realpathOrSelf(workspaceRoot);
  if (!isPathWithinBoundary(realpathOrSelf(absolute), realRoot)) {
    return {
      absolute,
      relative: portableRelative(workspaceRoot, absolute),
      status: 'outside-root',
    };
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return {
      absolute,
      relative: portableRelative(workspaceRoot, absolute),
      status: 'missing',
    };
  }
  return {
    absolute,
    relative: portableRelative(workspaceRoot, absolute),
    status: 'resolved',
    digest: readSourceFileIdentity(absolute).digest,
  };
}

function linkedRecords(
  markdown: string,
  markdownFilePath: string,
  workspaceRoot: string,
): ProvenanceLinkedRecord[] {
  const records: ProvenanceLinkedRecord[] = [];
  const fence = new FenceTracker();
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (fence.skips(raw)) continue;
    const line = stripInlineCode(raw);
    for (const embed of extractEmbedQueries(line)) {
      const resolved = resolveSource(markdownFilePath, workspaceRoot, embed.filepath);
      records.push({
        line: index + 1,
        reference: embed.raw,
        source: resolved.relative,
        status: resolved.status,
        ...(resolved.digest ? { sourceDigest: resolved.digest } : {}),
        ...(embed.target ? { sheet: embed.target } : {}),
        ...(embed.range ? { range: embed.range } : {}),
      });
    }
  }
  return records;
}

function matchingLedgerEntry(
  ledger: ReturnType<typeof readLedger>,
  ledgerPath: string,
  sourcePath: string,
  record: ExtractedProvenance,
): LedgerEntry | undefined {
  const source = sourceKey(ledgerPath, sourcePath);
  return ledger.entries.find((entry) =>
    entry.kind === record.kind
    && entry.source === source
    && (record.place
      ? entry.place === record.place
      : entry.fingerprint.digest === record.fingerprintDigest));
}

function freshnessOf(
  record: ExtractedProvenance,
  ledgerExists: boolean,
  entry: LedgerEntry | undefined,
  problems: readonly DetachFreshnessProblem[],
  sourceStatus: ResolvedSource['status'],
): ProvenanceFreshness {
  if (!ledgerExists || !entry) return 'untracked';
  if (sourceStatus !== 'resolved') return 'missing';
  if (problems.some((problem) => problem.code === 'MMI_DETACH_EXTRACTED_STALE')) {
    return 'stale';
  }
  if (problems.some((problem) =>
    problem.code === 'MMI_DETACH_EXTRACTED_CANDIDATE_MISSING'
    || problem.code === 'MMI_DETACH_EXTRACTED_SOURCE_MISSING')) {
    return 'missing';
  }
  return problems.length > 0 ? 'unknown' : 'fresh';
}

function extractedRecords(
  markdown: string,
  markdownFilePath: string,
  workspaceRoot: string,
  ledgerPath: string,
): { records: ProvenanceExtractedRecord[]; stale: number; missing: number } {
  const provenance = extractedProvenance(markdown);
  if (provenance.length === 0) return { records: [], stale: 0, missing: 0 };
  const ledgerExists = fs.existsSync(ledgerPath);
  const ledger = ledgerExists ? readLedger(ledgerPath) : undefined;
  const freshness = checkExtractedProvenanceFreshness({
    markdownFilePath,
    workspaceRoot,
    ledgerPath,
  });
  const problemsByLine = new Map<number, DetachFreshnessProblem[]>();
  for (const problem of freshness.problems) {
    const list = problemsByLine.get(problem.line) ?? [];
    list.push(problem);
    problemsByLine.set(problem.line, list);
  }

  const records: ProvenanceExtractedRecord[] = [];
  let stale = 0;
  let missing = 0;
  for (const record of provenance) {
    const source = resolveSource(markdownFilePath, workspaceRoot, record.source);
    const entry = ledger
      ? matchingLedgerEntry(ledger, ledgerPath, source.absolute, record)
      : undefined;
    const problems = problemsByLine.get(record.line) ?? [];
    const freshnessValue = freshnessOf(
      record,
      ledgerExists,
      entry,
      problems,
      source.status,
    );
    if (freshnessValue === 'stale') stale += 1;
    if (source.status !== 'resolved' || freshnessValue === 'missing') missing += 1;
    records.push({
      line: record.line,
      kind: record.kind,
      source: source.relative,
      ...(record.place ? { place: record.place } : {}),
      fingerprint: record.fingerprintDigest,
      freshness: freshnessValue,
      ...(entry
        ? {
            ledger: {
              output: entry.output,
              ...(entry.outputDigest ? { outputDigest: entry.outputDigest } : {}),
              conversion: entry.conversion,
              reviewState: entry.reviewState,
              basis: entry.basis,
              reviewedAt: entry.reviewedAt,
            },
          }
        : {}),
      ...(problems.length > 0
        ? {
            problems: problems.map((problem) => ({
              code: problem.code,
              message: problem.message,
            })),
          }
        : {}),
    });
  }
  return { records, stale, missing };
}

export function buildProvenanceReport(
  options: BuildProvenanceReportOptions,
): ProvenanceReport {
  const markdownFilePath = path.resolve(options.markdownFilePath);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  if (!isPathWithinBoundary(realpathOrSelf(markdownFilePath), realpathOrSelf(workspaceRoot))) {
    throw new Error('MMI_PROVENANCE_DOCUMENT_OUTSIDE_ROOT: document must be inside the workspace root');
  }
  if (!fs.existsSync(markdownFilePath) || !fs.statSync(markdownFilePath).isFile()) {
    throw new Error(`MMI_PROVENANCE_DOCUMENT_MISSING: ${options.markdownFilePath}`);
  }
  const markdown = fs.readFileSync(markdownFilePath, 'utf8');
  const documentDigest = readSourceFileIdentity(markdownFilePath).digest;
  const linked = linkedRecords(markdown, markdownFilePath, workspaceRoot);
  const extracted = extractedRecords(
    markdown,
    markdownFilePath,
    workspaceRoot,
    path.resolve(options.ledgerPath),
  );
  const diagnostics = [...(options.diagnostics ?? [])];
  const missingSources = linked.filter((item) => item.status !== 'resolved').length
    + extracted.missing;
  const review = evaluateReviewBasis({
    markdownFilePath,
    workspaceRoot,
    sidecarPath: path.resolve(
      options.reviewBasisPath ?? path.join(workspaceRoot, 'mmi-review-basis.json'),
    ),
    references: linked.map((item) => ({
      reference: item.reference,
      source: item.source,
    })),
  });
  return {
    schema: PROVENANCE_REPORT_SCHEMA,
    document: {
      path: portableRelative(workspaceRoot, markdownFilePath),
      digest: documentDigest,
    },
    summary: {
      linked: linked.length,
      extracted: extracted.records.length,
      diagnostics: diagnostics.length,
      stale: extracted.stale,
      missingSources,
      reviewStale: review.stale,
      reviewUnrecorded: review.unrecorded,
    },
    linked,
    extracted: extracted.records,
    review: {
      ...review,
      ...(review.status === 'not-configured'
        ? {
            reasonCode: 'MMI_REVIEW_BASIS_NOT_RECORDED',
            message:
              'no review-basis file exists; use `mmi review-basis <doc.md> --write` after reviewing the referenced tables.',
            trackingIssue: '#522',
          }
        : {}),
    },
    diagnostics,
  };
}

/** Human-readable report; no source cell values are included. */
export function formatProvenanceReport(report: ProvenanceReport): string {
  const lines: string[] = [];
  lines.push(`# 出典報告: ${report.document.path}`);
  lines.push('');
  lines.push(`- schema: ${report.schema}`);
  lines.push(`- document digest: ${report.document.digest}`);
  lines.push(
    `- Linked: ${report.summary.linked} / Extracted: ${report.summary.extracted} / 診断: ${report.summary.diagnostics} / stale: ${report.summary.stale} / 原本なし: ${report.summary.missingSources}`,
  );
  lines.push('');
  lines.push('## Linked参照');
  if (report.linked.length === 0) {
    lines.push('なし');
  } else {
    for (const item of report.linked) {
      const target = [
        item.sheet ? `#${item.sheet}` : '',
        item.range ? `|${item.range}` : '',
      ].join('');
      const digest = item.sourceDigest ? `  ${item.sourceDigest.slice(0, 19)}…` : '';
      lines.push(
        `- L${item.line}  ${item.source}${target}  [${item.status}]  \`${item.reference}\`${digest}`,
      );
    }
  }
  lines.push('');
  lines.push('## 取り込み資産');
  if (report.extracted.length === 0) {
    lines.push('なし');
  } else {
    for (const item of report.extracted) {
      const place = item.place ? `  ${item.place}` : '';
      const output = item.ledger ? `  -> ${item.ledger.output}` : '';
      lines.push(`- L${item.line}  ${item.kind}  ${item.source}${place}  [${item.freshness}]${output}`);
      for (const problem of item.problems ?? []) {
        lines.push(`  - ${problem.code}: ${problem.message}`);
      }
    }
  }
  lines.push('');
  lines.push('## 見直し記録');
  lines.push(
    `- status: ${report.review.status}  file: ${report.review.file}`,
  );
  for (const item of report.review.references) {
    const reason = item.reasonCode ? `  ${item.reasonCode}` : '';
    lines.push(`- ${item.reference}  [${item.status}]${reason}`);
  }
  if (report.review.reasonCode) {
    lines.push(`${report.review.reasonCode}: ${report.review.message ?? ''}`);
  }
  lines.push('');
  lines.push('## 診断');
  if (report.diagnostics.length === 0) {
    lines.push('なし');
  } else {
    for (const item of report.diagnostics) {
      lines.push(
        `- ${item.file}:${item.line}:${item.column}  ${item.severity} ${item.code}: ${item.message}`,
      );
    }
  }
  return lines.join('\n');
}
