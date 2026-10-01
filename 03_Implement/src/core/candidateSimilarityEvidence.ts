/**
 * Read-only bridge for non-authoritative similarity evidence produced by the
 * research/cognition layer. The evidence is displayed beside ledger facts but
 * never participates in imported/unimported filtering (issue-0195).
 */
import fs from 'node:fs';
import type { Candidate, CandidateKind, Fingerprint } from './candidate.js';

const CANDIDATE_KINDS = new Set<CandidateKind>([
  'table-range',
  'image',
  'text-block',
  'key-value',
  'diagram',
]);
import { placeOf, sourceKey } from './importLedger.js';

export const CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA =
  'mmi.candidate-similarity-evidence/v1';

export interface SimilarityProviderRef {
  id: string;
  version: string;
}

export interface SimilarityMetric {
  /** Provider-owned score namespace; scores from different namespaces are not merged. */
  namespace: string;
  name: string;
  semantics: string;
  value: number;
  range?: { min: number; max: number };
  higherIsStronger?: boolean;
}

export interface SimilarityTarget {
  kind: CandidateKind;
  source: string;
  sheet?: string;
  place: string;
  fingerprint?: Pick<Fingerprint, 'representation' | 'digest'>;
}

export interface CandidateSimilarityEvidenceEntry {
  /** Current Candidate occurrence, relative to the sidecar file. */
  source: string;
  kind: CandidateKind;
  sheet?: string;
  place: string;
  provider: SimilarityProviderRef;
  metric: SimilarityMetric;
  /** The historical/imported occurrence this evidence compares against. */
  target: SimilarityTarget;
  evidence?: readonly { code: string; detail?: string }[];
}

export interface CandidateSimilarityEvidenceDocument {
  schema: typeof CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA;
  entries: CandidateSimilarityEvidenceEntry[];
}

export function emptyCandidateSimilarityEvidence(): CandidateSimilarityEvidenceDocument {
  return { schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA, entries: [] };
}

export function readCandidateSimilarityEvidence(
  evidencePath: string,
): CandidateSimilarityEvidenceDocument {
  const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as Partial<CandidateSimilarityEvidenceDocument>;
  if (
    parsed.schema !== CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA
    || !Array.isArray(parsed.entries)
  ) {
    throw new Error(
      `${evidencePath} is not an ${CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA} document`,
    );
  }
  for (const [index, entry] of parsed.entries.entries()) {
    assertEntry(entry, index);
  }
  return {
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: parsed.entries,
  };
}

export function similarityEvidenceForCandidate(
  document: CandidateSimilarityEvidenceDocument,
  evidencePath: string,
  absoluteSource: string,
  candidate: Candidate,
): CandidateSimilarityEvidenceEntry[] {
  const source = sourceKey(evidencePath, absoluteSource);
  const place = placeOf(candidate);
  return document.entries.filter((entry) =>
    entry.source === source
    && entry.kind === candidate.kind
    && (entry.sheet ?? '') === (candidate.locator.sheet ?? '')
    && entry.place === place);
}

function assertEntry(entry: CandidateSimilarityEvidenceEntry, index: number): void {
  const prefix = `similarity entry ${index}`;
  assertText(`${prefix}.source`, entry.source);
  assertCandidateKind(`${prefix}.kind`, entry.kind);
  if (entry.sheet !== undefined) assertText(`${prefix}.sheet`, entry.sheet);
  assertText(`${prefix}.place`, entry.place);
  assertText(`${prefix}.provider.id`, entry.provider?.id);
  assertText(`${prefix}.provider.version`, entry.provider?.version);
  assertText(`${prefix}.metric.namespace`, entry.metric?.namespace);
  assertText(`${prefix}.metric.name`, entry.metric?.name);
  assertText(`${prefix}.metric.semantics`, entry.metric?.semantics);
  if (!Number.isFinite(entry.metric?.value)) {
    throw new Error(`${prefix}.metric.value must be finite`);
  }
  if (
    entry.metric.higherIsStronger !== undefined
    && typeof entry.metric.higherIsStronger !== 'boolean'
  ) {
    throw new Error(`${prefix}.metric.higherIsStronger must be boolean`);
  }
  if (entry.metric.range) {
    const { min, max } = entry.metric.range;
    if (
      !Number.isFinite(min)
      || !Number.isFinite(max)
      || min >= max
      || entry.metric.value < min
      || entry.metric.value > max
    ) {
      throw new Error(`${prefix}.metric.range must contain the score with finite min < max`);
    }
  }
  assertText(`${prefix}.target.source`, entry.target?.source);
  assertCandidateKind(`${prefix}.target.kind`, entry.target?.kind);
  if (entry.target?.sheet !== undefined) {
    assertText(`${prefix}.target.sheet`, entry.target.sheet);
  }
  assertText(`${prefix}.target.place`, entry.target?.place);
  if (entry.target?.fingerprint) {
    assertText(
      `${prefix}.target.fingerprint.representation`,
      entry.target.fingerprint.representation,
    );
    assertText(
      `${prefix}.target.fingerprint.digest`,
      entry.target.fingerprint.digest,
    );
  }
  for (const item of entry.evidence ?? []) {
    assertText(`${prefix}.evidence.code`, item.code);
    if (item.detail !== undefined) {
      assertText(`${prefix}.evidence.detail`, item.detail);
    }
  }
}

function assertText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}


function assertCandidateKind(name: string, value: unknown): asserts value is CandidateKind {
  if (typeof value !== 'string' || !CANDIDATE_KINDS.has(value as CandidateKind)) {
    throw new Error(`${name} must be a supported Candidate kind`);
  }
}
