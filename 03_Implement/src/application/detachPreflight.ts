import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildCandidateReviewInventory } from './candidateReviewInventory.js';
import {
  assessLedger,
  placeOf,
  readLedger,
  type LedgerEntry,
  type LedgerState,
} from '../core/importLedger.js';

export interface DetachPreflightProblem {
  code:
    | 'MMI_DETACH_LEDGER_MISSING'
    | 'MMI_DETACH_SOURCE_OUTSIDE_ROOT'
    | 'MMI_DETACH_SOURCE_MISSING'
    | 'MMI_DETACH_OUTPUT_OUTSIDE_ROOT'
    | 'MMI_DETACH_OUTPUT_MISSING'
    | 'MMI_DETACH_OUTPUT_UNVERIFIED'
    | 'MMI_DETACH_OUTPUT_CHANGED'
    | 'MMI_DETACH_CANDIDATE_MISSING'
    | 'MMI_DETACH_CANDIDATE_CHANGED'
    | 'MMI_DETACH_CANDIDATE_STALE';
  message: string;
  source?: string;
  output?: string;
  sheet?: string;
  place?: string;
}

export interface DetachPreflightResult {
  errors: number;
  checkedEntries: number;
  problems: DetachPreflightProblem[];
}

export interface DetachPreflightOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  ledgerPath: string;
}

/**
 * Verify that imported Candidates adopted by this document are still backed by
 * the current source and by the exact reviewed output bytes.
 *
 * This runs before source removal. detach-check remains the post-materialize
 * artifact-closure check and therefore does not need access to the source.
 */
export function checkDetachPreflight(options: DetachPreflightOptions): DetachPreflightResult {
  const ledgerPath = path.resolve(options.ledgerPath);
  const documentPath = path.resolve(options.markdownFilePath);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const text = fs.readFileSync(documentPath, 'utf8');
  const adoptedTargets = localLinkTargets(text)
    .map((target) => resolveDocumentTarget(documentPath, target))
    .filter((value): value is string => Boolean(value));

  if (!fs.existsSync(ledgerPath)) {
    const hasExtractedProvenance = /<!--\s*mmi:extracted(?:-table)?\b/u.test(text);
    return hasExtractedProvenance
      ? {
          errors: 1,
          checkedEntries: 0,
          problems: [{
            code: 'MMI_DETACH_LEDGER_MISSING',
            message: 'document contains extracted MMI provenance but the import ledger is missing',
          }],
        }
      : { errors: 0, checkedEntries: 0, problems: [] };
  }

  const ledger = readLedger(ledgerPath);
  const ledgerDirectory = path.dirname(ledgerPath);
  const selected = new Map<string, LedgerEntry>();

  for (const entry of ledger.entries) {
    const outputAbsolute = path.resolve(ledgerDirectory, entry.output);
    if (adoptedTargets.some((target) => path.resolve(target) === outputAbsolute)) {
      selected.set(entryKey(entry), entry);
    }
  }
  for (const ref of extractedProvenance(text)) {
    const matched = ledger.entries.find((entry) => provenanceMatches(entry, ref));
    if (matched) selected.set(entryKey(matched), matched);
  }

  const problems: DetachPreflightProblem[] = [];
  const inventoryCache = new Map<string, ReturnType<typeof buildCandidateReviewInventory>>();

  for (const entry of selected.values()) {
    const sourcePath = path.resolve(ledgerDirectory, entry.source);
    const outputPath = path.resolve(ledgerDirectory, entry.output);
    const identity = {
      source: entry.source,
      output: entry.output,
      ...(entry.sheet ? { sheet: entry.sheet } : {}),
      place: entry.place,
    };

    if (!isWithin(workspaceRoot, sourcePath)) {
      problems.push({
        code: 'MMI_DETACH_SOURCE_OUTSIDE_ROOT',
        message: 'reviewed source leaves the workspace boundary',
        ...identity,
      });
      continue;
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      problems.push({
        code: 'MMI_DETACH_SOURCE_MISSING',
        message: 'reviewed source no longer exists; freshness cannot be established',
        ...identity,
      });
      continue;
    }
    if (!isWithin(workspaceRoot, outputPath)) {
      problems.push({
        code: 'MMI_DETACH_OUTPUT_OUTSIDE_ROOT',
        message: 'reviewed extracted output leaves the workspace boundary',
        ...identity,
      });
      continue;
    }
    if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isFile()) {
      problems.push({
        code: 'MMI_DETACH_OUTPUT_MISSING',
        message: 'reviewed extracted output is missing',
        ...identity,
      });
      continue;
    }
    if (!entry.outputDigest) {
      problems.push({
        code: 'MMI_DETACH_OUTPUT_UNVERIFIED',
        message: 'legacy ledger entry has no output digest; re-extract this Candidate before detaching',
        ...identity,
      });
      continue;
    }
    const actualOutputDigest = sha256File(outputPath);
    if (actualOutputDigest !== entry.outputDigest) {
      problems.push({
        code: 'MMI_DETACH_OUTPUT_CHANGED',
        message: 'reviewed extracted output bytes changed after the ledger decision',
        ...identity,
      });
      continue;
    }

    let inventory = inventoryCache.get(sourcePath);
    if (!inventory) {
      inventory = buildCandidateReviewInventory(sourcePath, entry.source);
      inventoryCache.set(sourcePath, inventory);
    }
    const current = inventory.items.find((item) =>
      item.candidate.kind === entry.kind
      && (item.candidate.locator.sheet ?? '') === (entry.sheet ?? '')
      && placeOf(item.candidate) === entry.place
    )?.candidate;

    if (!current) {
      problems.push({
        code: 'MMI_DETACH_CANDIDATE_MISSING',
        message: 'reviewed Candidate occurrence no longer exists in the current source',
        ...identity,
      });
      continue;
    }

    const assessment = assessLedger(ledger, ledgerPath, sourcePath, current);
    if (assessment.state !== 'imported') {
      problems.push({
        code: stateProblemCode(assessment.state),
        message: assessment.state === 'stale'
          ? 'review basis is stale' + (assessment.staleClaims?.length ? ': ' + assessment.staleClaims.join(', ') : '')
          : 'current Candidate content differs from the reviewed/imported occurrence',
        ...identity,
      });
    }
  }

  return {
    errors: problems.length,
    checkedEntries: selected.size,
    problems,
  };
}

interface ExtractedProvenance {
  kind: 'table' | 'image';
  sheet?: string;
  place?: string;
  digest?: string;
}

function extractedProvenance(text: string): ExtractedProvenance[] {
  const result: ExtractedProvenance[] = [];
  for (const match of text.matchAll(/<!--\s*mmi:(extracted-table|extracted)\s+(?<attrs>.*?)-->/gu)) {
    const attrs = parseAttributes(match.groups?.attrs ?? '');
    if (match[1] === 'extracted-table') {
      result.push({
        kind: 'table',
        ...(attrs.sheet ? { sheet: attrs.sheet } : {}),
        ...(attrs.range ? { place: attrs.range } : {}),
        ...(attrs['candidate-sha256'] ? { digest: 'sha256:' + attrs['candidate-sha256'] } : {}),
      });
    } else {
      result.push({
        kind: 'image',
        ...(attrs.sheet ? { sheet: attrs.sheet } : {}),
        ...(attrs.anchor ? { place: attrs.anchor } : {}),
        ...(attrs.sha256 ? { digest: 'sha256:' + attrs.sha256 } : {}),
      });
    }
  }
  return result;
}

function provenanceMatches(entry: LedgerEntry, ref: ExtractedProvenance): boolean {
  if (entry.kind !== ref.kind) return false;
  if (ref.sheet && (entry.sheet ?? '') !== ref.sheet) return false;
  if (ref.place && entry.place !== ref.place) return false;
  if (ref.digest && entry.fingerprint.digest !== ref.digest) return false;
  return Boolean(ref.place || ref.digest);
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([a-z0-9-]+)="([^"]*)"/giu)) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function localLinkTargets(text: string): string[] {
  const targets: string[] = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s*(\x60\x60\x60|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(/!?\[[^\]]*\]\((?<target>[^)]+)\)/gu)) {
      const raw = match.groups?.target?.trim();
      if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/iu.test(raw)) continue;
      targets.push(raw.startsWith('<') && raw.includes('>')
        ? raw.slice(1, raw.indexOf('>'))
        : raw.split(/\s+["']/u, 1)[0]);
    }
  }
  return targets;
}

function resolveDocumentTarget(documentPath: string, rawTarget: string): string | undefined {
  let target = rawTarget.split('#', 1)[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // Preserve malformed encoding as a literal; existence checks happen later.
  }
  return target ? path.resolve(path.dirname(documentPath), target) : undefined;
}

function entryKey(entry: LedgerEntry): string {
  return [entry.kind, entry.source, entry.sheet ?? '', entry.place].join('\u0000');
}

function sha256File(file: string): string {
  return 'sha256:' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stateProblemCode(state: LedgerState): DetachPreflightProblem['code'] {
  return state === 'stale'
    ? 'MMI_DETACH_CANDIDATE_STALE'
    : 'MMI_DETACH_CANDIDATE_CHANGED';
}
