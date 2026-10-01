/**
 * Read-only bridge for non-authoritative similarity evidence produced by the
 * research/cognition layer. The evidence is displayed beside ledger facts but
 * never participates in imported/unimported filtering (issue-0195).
 */
import fs from 'node:fs';
import type { Candidate, CandidateKind, Fingerprint } from './candidate.js';
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
  assertText(`${prefix}.kind`, entry.kind);
  assertText(`${prefix}.place`, entry.place);
  assertText(`${prefix}.provider.id`, entry.provider?.id);
  assertText(`${prefix}.provider.version`, entry.provider?.version);
  assertText(`${prefix}.metric.namespace`, entry.metric?.namespace);
  assertText(`${prefix}.metric.name`, entry.metric?.name);
  assertText(`${prefix}.metric.semantics`, entry.metric?.semantics);
  if (!Number.isFinite(entry.metric?.value)) {
    throw new Error(`${prefix}.metric.value must be finite`);
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
  assertText(`${prefix}.target.kind`, entry.target?.kind);
  assertText(`${prefix}.target.place`, entry.target?.place);
  for (const item of entry.evidence ?? []) {
    assertText(`${prefix}.evidence.code`, item.code);
  }
}

function assertText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}
