/**
 * Review-basis sidecar for Linked references (issue #522).
 *
 * Recording is an explicit write. A record stores the canonical digest of the
 * logical table (the same projection `render` produces) for one reference, not
 * the source file as a whole. A later provenance report compares that digest
 * with the current logical table, so a change outside the referenced range
 * does not mark the prose as stale.
 *
 * The sidecar is a separate, human-readable JSON file. It is deliberately not
 * hidden in the source workbook or in the Markdown notation; moving it into
 * the notation remains a Human Sponsor decision (issue #522 Remaining work).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FenceTracker, stripInlineCode } from '../core/markdownLinks.js';
import { isPathWithinBoundary, resolveSourcePath } from '../core/pathResolver.js';
import { buildLogicalTable, type LogicalTable } from '../core/renderTable.js';
import { REVIEW_BASIS_SCHEMA } from '../core/reviewBasisContract.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { parseEmbedSyntax, type EmbedQuery } from '../parser/embedSyntax.js';

export { REVIEW_BASIS_SCHEMA };
export const DEFAULT_REVIEW_BASIS_FILE = 'mmi-review-basis.json';

export interface ReviewBasisRecord {
  /** Exact MMI reference text, including parameters. This is the identity. */
  reference: string;
  /** Source as written, relative to the document or workspace. */
  source: string;
  target?: string;
  range?: string;
  logicalTableDigest: string;
  recordedAt: string;
}

export interface ReviewBasisFile {
  schema: typeof REVIEW_BASIS_SCHEMA;
  documents: Readonly<Record<string, readonly ReviewBasisRecord[]>>;
}

export type ReviewReferenceStatus = 'fresh' | 'stale' | 'unrecorded' | 'unverifiable';

export interface ReviewReferenceEvaluation {
  reference: string;
  source: string;
  status: ReviewReferenceStatus;
  recordedDigest?: string;
  currentDigest?: string;
  reasonCode?: string;
}

export interface ReviewEvaluation {
  status: 'not-configured' | 'recorded' | 'partial';
  file: string;
  references: ReviewReferenceEvaluation[];
  stale: number;
  unrecorded: number;
  unverifiable: number;
}

export interface ReviewBasisProblem {
  code: string;
  message: string;
  reference?: string;
}

export interface RecordReviewBasisOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  sidecarPath: string;
  /** Compute and report, but do not write the sidecar. */
  dryRun?: boolean;
}

export interface RecordReviewBasisResult {
  written: boolean;
  file: string;
  document: string;
  records: ReviewBasisRecord[];
  problems: ReviewBasisProblem[];
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** Canonical logical-table identity shared by recording and revalidation. */
export function logicalTableDigest(table: LogicalTable): string {
  return sha256(JSON.stringify({
    ...(table.headers ? { headers: table.headers } : {}),
    bodyRows: table.bodyRows,
  }));
}

function portableRelative(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target))
    .split(path.sep).join('/');
}

function documentKey(workspaceRoot: string, markdownFilePath: string): string {
  return portableRelative(workspaceRoot, markdownFilePath);
}

function queryOf(reference: string): EmbedQuery | undefined {
  return parseEmbedSyntax(reference) ?? undefined;
}

function workbookFor(
  markdownFilePath: string,
  workspaceRoot: string,
  query: EmbedQuery,
  cache: Map<string, WorkbookData>,
): { absolute: string; workbook: WorkbookData } {
  const absolute = resolveSourcePath({
    markdownFilePath,
    sourcePath: query.filepath,
    workspaceRoot,
  });
  let workbook = cache.get(absolute);
  if (!workbook) {
    workbook = loadWorkbook({ absolutePath: absolute });
    cache.set(absolute, workbook);
  }
  return { absolute, workbook };
}

function currentDigest(
  markdownFilePath: string,
  workspaceRoot: string,
  reference: string,
  cache: Map<string, WorkbookData>,
): { digest?: string; source?: string; problem?: ReviewBasisProblem } {
  const query = queryOf(reference);
  if (!query) {
    return {
      problem: {
        code: 'MMI_REVIEW_BASIS_REFERENCE_INVALID',
        message: 'the reference is not valid MMI embed syntax',
        reference,
      },
    };
  }
  try {
    const { absolute, workbook } = workbookFor(
      markdownFilePath,
      workspaceRoot,
      query,
      cache,
    );
    return {
      digest: logicalTableDigest(buildLogicalTable(query, workbook)),
      source: portableRelative(workspaceRoot, absolute),
    };
  } catch (error) {
    return {
      problem: {
        code: 'MMI_REVIEW_BASIS_UNVERIFIABLE',
        message: error instanceof Error ? error.message : String(error),
        reference,
      },
    };
  }
}

export function readReviewBasis(file: string): ReviewBasisFile {
  if (!fs.existsSync(file)) {
    return { schema: REVIEW_BASIS_SCHEMA, documents: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ReviewBasisFile>;
  if (parsed.schema !== REVIEW_BASIS_SCHEMA || !parsed.documents
      || typeof parsed.documents !== 'object' || Array.isArray(parsed.documents)) {
    throw new Error(`${file} is not an ${REVIEW_BASIS_SCHEMA} file`);
  }
  for (const [document, records] of Object.entries(parsed.documents)) {
    if (!Array.isArray(records)) {
      throw new Error(`${file}: documents[${document}] must be an array`);
    }
    for (const record of records) {
      if (!record || typeof record !== 'object'
          || typeof record.reference !== 'string'
          || typeof record.source !== 'string'
          || typeof record.logicalTableDigest !== 'string'
          || !/^sha256:[0-9a-f]{64}$/u.test(record.logicalTableDigest)) {
        throw new Error(`${file}: documents[${document}] has an invalid record`);
      }
    }
  }
  return {
    schema: REVIEW_BASIS_SCHEMA,
    documents: parsed.documents as Record<string, ReviewBasisRecord[]>,
  };
}

function writeReviewBasisAtomic(file: string, value: ReviewBasisFile): void {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

/** Explicitly record the current logical table digest for every Linked reference. */
export function recordReviewBasis(
  options: RecordReviewBasisOptions,
): RecordReviewBasisResult {
  const markdownFilePath = path.resolve(options.markdownFilePath);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const sidecarPath = path.resolve(options.sidecarPath);
  const result: RecordReviewBasisResult = {
    written: false,
    file: sidecarPath,
    document: documentKey(workspaceRoot, markdownFilePath),
    records: [],
    problems: [],
  };
  if (!isPathWithinBoundary(markdownFilePath, workspaceRoot)) {
    result.problems.push({
      code: 'MMI_REVIEW_BASIS_DOCUMENT_OUTSIDE_ROOT',
      message: 'the document must be inside the workspace root',
    });
    return result;
  }
  if (!isPathWithinBoundary(sidecarPath, workspaceRoot)) {
    result.problems.push({
      code: 'MMI_REVIEW_BASIS_OUTSIDE_ROOT',
      message: 'the review-basis file must be inside the workspace root',
    });
    return result;
  }
  const markdown = fs.readFileSync(markdownFilePath, 'utf8');
  const fence = new FenceTracker();
  const references: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/u)) {
    if (fence.skips(rawLine)) continue;
    for (const match of stripInlineCode(rawLine).matchAll(/!\[\[[^\]]+\]\]/gu)) {
      references.push(match[0]);
    }
  }
  const cache = new Map<string, WorkbookData>();
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference)) continue;
    seen.add(reference);
    const query = queryOf(reference);
    if (!query) {
      result.problems.push({
        code: 'MMI_REVIEW_BASIS_REFERENCE_INVALID',
        message: 'the reference is not valid MMI embed syntax',
        reference,
      });
      continue;
    }
    const digest = currentDigest(markdownFilePath, workspaceRoot, reference, cache);
    if (!digest.digest || !digest.source) {
      result.problems.push(digest.problem ?? {
        code: 'MMI_REVIEW_BASIS_UNVERIFIABLE',
        message: 'the logical table could not be computed',
        reference,
      });
      continue;
    }
    result.records.push({
      reference,
      source: query.filepath,
      ...(query.target ? { target: query.target } : {}),
      ...(query.range ? { range: query.range } : {}),
      logicalTableDigest: digest.digest,
      recordedAt: new Date().toISOString(),
    });
  }
  if (result.problems.length > 0) return result;
  if (!options.dryRun) {
    const basis = readReviewBasis(sidecarPath);
    const documents = {
      ...basis.documents,
      [result.document]: result.records,
    };
    writeReviewBasisAtomic(sidecarPath, {
      schema: REVIEW_BASIS_SCHEMA,
      documents,
    });
    result.written = true;
  }
  return result;
}

export function evaluateReviewBasis(options: {
  markdownFilePath: string;
  workspaceRoot: string;
  sidecarPath: string;
  references: readonly { reference: string; source: string }[];
}): ReviewEvaluation {
  const markdownFilePath = path.resolve(options.markdownFilePath);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const sidecarPath = path.resolve(options.sidecarPath);
  const exists = fs.existsSync(sidecarPath);
  const basis = exists
    ? readReviewBasis(sidecarPath)
    : { schema: REVIEW_BASIS_SCHEMA, documents: {} };
  const document = documentKey(workspaceRoot, markdownFilePath);
  const recorded = new Map(
    (basis.documents[document] ?? []).map((record) => [record.reference, record]),
  );
  const cache = new Map<string, WorkbookData>();
  const references: ReviewReferenceEvaluation[] = [];
  let stale = 0;
  let unrecorded = 0;
  let unverifiable = 0;
  for (const item of options.references) {
    const record = recorded.get(item.reference);
    if (!record) {
      references.push({
        reference: item.reference,
        source: item.source,
        status: 'unrecorded',
        reasonCode: 'review-basis-not-recorded',
      });
      unrecorded += 1;
      continue;
    }
    const current = currentDigest(
      markdownFilePath,
      workspaceRoot,
      item.reference,
      cache,
    );
    if (!current.digest) {
      references.push({
        reference: item.reference,
        source: item.source,
        status: 'unverifiable',
        recordedDigest: record.logicalTableDigest,
        ...(current.problem ? { reasonCode: current.problem.code } : {}),
      });
      unverifiable += 1;
      continue;
    }
    if (current.digest === record.logicalTableDigest) {
      references.push({
        reference: item.reference,
        source: item.source,
        status: 'fresh',
        recordedDigest: record.logicalTableDigest,
        currentDigest: current.digest,
      });
    } else {
      references.push({
        reference: item.reference,
        source: item.source,
        status: 'stale',
        recordedDigest: record.logicalTableDigest,
        currentDigest: current.digest,
        reasonCode: 'logical-table-changed',
      });
      stale += 1;
    }
  }
  const status = !exists
    ? 'not-configured'
    : unrecorded === 0 && unverifiable === 0
      ? 'recorded'
      : 'partial';
  return {
    status,
    file: sidecarPath,
    references,
    stale,
    unrecorded,
    unverifiable,
  };
}
