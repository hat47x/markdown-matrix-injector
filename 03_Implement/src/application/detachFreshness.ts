import fs from 'node:fs';
import path from 'node:path';

import { buildCandidateReviewInventory } from './candidateReviewInventory.js';
import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { readXmlTree } from '../adapters/xmlTreeAdapter.js';
import type { Candidate } from '../core/candidate.js';
import {
  assessLedger,
  placeOf,
  readLedger,
  sourceKey,
  type Ledger,
  type LedgerState,
} from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { isXmlSpreadsheet2003Text } from '../core/workbookLoader.js';

export type DetachFreshnessProblemCode =
  | 'MMI_DETACH_LEDGER_MISSING'
  | 'MMI_DETACH_EXTRACTED_SOURCE_MISSING'
  | 'MMI_DETACH_EXTRACTED_SOURCE_OUTSIDE_ROOT'
  | 'MMI_DETACH_EXTRACTED_UNTRACKED'
  | 'MMI_DETACH_EXTRACTED_CANDIDATE_MISSING'
  | 'MMI_DETACH_EXTRACTED_AMBIGUOUS'
  | 'MMI_DETACH_EXTRACTED_STALE';

export interface DetachFreshnessProblem {
  line: number;
  code: DetachFreshnessProblemCode;
  message: string;
  source?: string;
  sheet?: string;
  place?: string;
  ledgerState?: LedgerState;
}

export interface DetachFreshnessResult {
  checked: number;
  errors: number;
  problems: DetachFreshnessProblem[];
}

export interface DetachFreshnessOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  ledgerPath: string;
}

interface ExtractedProvenance {
  line: number;
  kind: 'image' | 'table-range' | 'tree';
  source: string;
  sheet?: string;
  place?: string;
  fingerprintDigest: string;
}

/**
 * Pre-detach freshness check for content that was previously extracted from a
 * source and then adopted into this Markdown document. Closure alone cannot
 * detect a stale copied image/table/tree, so provenance is reconciled with
 * the current Candidate and import ledger before the source is removed.
 */
export function checkExtractedProvenanceFreshness(
  options: DetachFreshnessOptions,
): DetachFreshnessResult {
  const markdown = fs.readFileSync(options.markdownFilePath, 'utf8');
  const records = extractedProvenance(markdown);
  if (records.length === 0) return { checked: 0, errors: 0, problems: [] };

  if (!fs.existsSync(options.ledgerPath)) {
    const problem: DetachFreshnessProblem = {
      line: records[0].line,
      code: 'MMI_DETACH_LEDGER_MISSING',
      message: `extracted provenance exists but import ledger is missing: ${options.ledgerPath}`,
    };
    return { checked: 0, errors: 1, problems: [problem] };
  }

  const ledger = readLedger(options.ledgerPath);
  const inventoryCache = new Map<string, Candidate[]>();
  const problems: DetachFreshnessProblem[] = [];
  let checked = 0;

  for (const record of records) {
    const sourcePath = resolveSource(options.markdownFilePath, record.source);
    const boundary = containedPath(sourcePath, options.workspaceRoot);
    if (!boundary.contained) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_SOURCE_OUTSIDE_ROOT',
        `extracted source leaves the workspace boundary: ${record.source}`));
      continue;
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_SOURCE_MISSING',
        `extracted source is unavailable for freshness verification: ${record.source}`));
      continue;
    }

    let candidates = inventoryCache.get(sourcePath);
    if (!candidates) {
      const sourceLabel = path.relative(options.workspaceRoot, sourcePath).split(path.sep).join('/');
      try {
        candidates = candidatesFromCurrentSource(sourcePath, sourceLabel);
      } catch (error) {
        problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_CANDIDATE_MISSING',
          `cannot inspect current source Candidate: ${error instanceof Error ? error.message : String(error)}`));
        continue;
      }
      inventoryCache.set(sourcePath, candidates);
    }

    const current = candidatesForRecord(candidates, record);
    if (current.length === 0) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_CANDIDATE_MISSING',
        'the adopted occurrence is no longer present in the current source'));
      continue;
    }
    if (current.length > 1) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_AMBIGUOUS',
        'multiple current Candidates match this extracted provenance; re-review the occurrence'));
      continue;
    }

    const candidate = current[0];
    const entry = ledgerEntryFor(ledger, options.ledgerPath, sourcePath, candidate);
    if (!entry) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_UNTRACKED',
        'the adopted Candidate has no matching import-ledger review record'));
      continue;
    }

    // The document provenance is part of the adoption evidence. If it does not
    // describe the ledger Candidate that is being revalidated, fail closed.
    if (entry.fingerprint.digest !== record.fingerprintDigest) {
      problems.push(problemFor(record, 'MMI_DETACH_EXTRACTED_STALE',
        'document provenance fingerprint differs from the reviewed ledger entry', 'changed'));
      continue;
    }

    const assessment = assessLedger(
      ledger,
      options.ledgerPath,
      sourcePath,
      candidate,
    );
    checked += 1;
    if (assessment.state !== 'imported') {
      const stale = assessment.staleClaims?.length
        ? ` (stale claims: ${assessment.staleClaims.join(', ')})`
        : '';
      problems.push(problemFor(
        record,
        'MMI_DETACH_EXTRACTED_STALE',
        `adopted Candidate is ${assessment.state}${stale}; review it before detaching`,
        assessment.state,
      ));
    }
  }

  return { checked, errors: problems.length, problems };
}

function extractedProvenance(markdown: string): ExtractedProvenance[] {
  const records: ExtractedProvenance[] = [];
  const lines = markdown.split(/\r?\n/u);
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/u.test(line)) inFence = !inFence;
    if (inFence) continue;

    const image = /<!--\s*mmi:extracted\s+(?<attrs>.*?)\s*-->/u.exec(line);
    if (image?.groups?.attrs) {
      const attrs = attributes(image.groups.attrs);
      if (attrs.source && attrs.sheet && attrs.sha256) {
        records.push({
          line: index + 1,
          kind: 'image',
          source: attrs.source,
          sheet: attrs.sheet,
          ...(attrs.anchor ? { place: attrs.anchor } : {}),
          fingerprintDigest: normalizedSha256(attrs.sha256),
        });
      }
    }

    const table = /<!--\s*mmi:extracted-table\s+(?<attrs>.*?)\s*-->/u.exec(line);
    if (table?.groups?.attrs) {
      const attrs = attributes(table.groups.attrs);
      if (attrs.source && attrs.sheet && attrs.range && attrs['candidate-sha256']) {
        records.push({
          line: index + 1,
          kind: 'table-range',
          source: attrs.source,
          sheet: attrs.sheet,
          place: attrs.range,
          fingerprintDigest: normalizedSha256(attrs['candidate-sha256']),
        });
      }
    }

    const tree = /<!--\s*mmi:extracted-tree\s+(?<attrs>.*?)\s*-->/u.exec(line);
    if (tree?.groups?.attrs) {
      const attrs = attributes(tree.groups.attrs);
      if (
        attrs.source
        && Object.prototype.hasOwnProperty.call(attrs, 'path')
        && attrs['candidate-sha256']
      ) {
        records.push({
          line: index + 1,
          kind: 'tree',
          source: attrs.source,
          place: `path:${attrs.path}`,
          fingerprintDigest: normalizedSha256(attrs['candidate-sha256']),
        });
      }
    }
  }
  return records;
}

function candidatesFromCurrentSource(
  sourcePath: string,
  sourceLabel: string,
): Candidate[] {
  if (/\.json$/iu.test(sourcePath)) {
    const sourceDigest = readSourceFileIdentity(sourcePath).digest;
    return [
      ...readJsonTree(
        fs.readFileSync(sourcePath, 'utf8'),
        sourceLabel,
        sourceDigest,
      ).candidates,
    ];
  }
  if (/\.xml$/iu.test(sourcePath)) {
    const xml = fs.readFileSync(sourcePath, 'utf8');
    if (!isXmlSpreadsheet2003Text(xml)) {
      const sourceDigest = readSourceFileIdentity(sourcePath).digest;
      return [
        ...readXmlTree(
          xml,
          sourceLabel,
          sourceDigest,
        ).candidates,
      ];
    }
  }
  return buildCandidateReviewInventory(sourcePath, sourceLabel)
    .items.map((item) => item.candidate);
}

function attributes(text: string): Record<string, string> {
  return Object.fromEntries(
    [...text.matchAll(/(?<key>[A-Za-z0-9-]+)="(?<value>[^"]*)"/gu)]
      .flatMap((match) => match.groups?.key
        ? [[match.groups.key, match.groups.value ?? ''] as const]
        : []),
  );
}

function normalizedSha256(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function resolveSource(markdownFilePath: string, source: string): string {
  return path.resolve(path.dirname(markdownFilePath), source);
}

function containedPath(target: string, root: string): { contained: boolean } {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  let checkedRoot = resolvedRoot;
  let checkedTarget = resolvedTarget;
  try {
    checkedRoot = fs.realpathSync(resolvedRoot);
  } catch {
    // Root existence is handled by the caller's normal workspace setup.
  }
  try {
    checkedTarget = fs.realpathSync(resolvedTarget);
  } catch {
    // Missing source is reported separately.
  }
  const relative = path.relative(checkedRoot, checkedTarget);
  return { contained: relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) };
}

function candidatesForRecord(
  candidates: readonly Candidate[],
  record: ExtractedProvenance,
): Candidate[] {
  const sameKindSheet = candidates.filter(
    (candidate) =>
      candidate.kind === record.kind
      && (candidate.locator.sheet ?? '') === (record.sheet ?? ''),
  );
  if (record.place) {
    return sameKindSheet.filter((candidate) => placeOf(candidate) === record.place);
  }
  // Anchor-less images can only be reconciled by their reviewed content within
  // the same sheet. Multiple equal occurrences remain ambiguous by design.
  return sameKindSheet.filter(
    (candidate) => candidate.fingerprint.digest === record.fingerprintDigest,
  );
}

function ledgerEntryFor(
  ledger: Ledger,
  ledgerPath: string,
  sourcePath: string,
  candidate: Candidate,
) {
  const source = sourceKey(ledgerPath, sourcePath);
  const place = placeOf(candidate);
  return ledger.entries.find(
    (entry) =>
      entry.kind === candidate.kind
      && entry.source === source
      && (entry.sheet ?? '') === (candidate.locator.sheet ?? '')
      && entry.place === place,
  );
}

function problemFor(
  record: ExtractedProvenance,
  code: DetachFreshnessProblemCode,
  message: string,
  ledgerState?: LedgerState,
): DetachFreshnessProblem {
  return {
    line: record.line,
    code,
    message,
    source: record.source,
    ...(record.sheet ? { sheet: record.sheet } : {}),
    ...(record.place ? { place: record.place } : {}),
    ...(ledgerState ? { ledgerState } : {}),
  };
}
