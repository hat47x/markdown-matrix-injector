/**
 * Semantic Candidate -- the common currency between Source Adapters and
 * everything downstream (reference, extract, review, ledger). ADR-0019 D4,
 * ADR-0018 D1-D5, ADR-0020. Pure types and invariants: no I/O, no VS Code.
 *
 * Three things are kept deliberately separate:
 *
 *   epistemic status   observed | inferred | abstained
 *                      -- what the source/method can justify: read from the
 *                      source, derived by a method, or declined.
 *   review state       unreviewed | accepted | rejected | modified | deferred
 *                      -- a downstream decision; it never upgrades an
 *                      inference into a source fact.
 *   execution          deterministic | provider-dependent
 *                      -- whether the same input reproduces the same output
 *                      without a model/provider. Orthogonal to status: a rule
 *                      can infer, a model can observe.
 *   method class       M0..M5 (ADR-0020) -- the simplest method that suffices.
 *
 * and a Candidate states them per CLAIM, not once: a table's cell coordinates
 * are `observed`, while its boundary and header are `inferred` from rules.
 * Collapsing them into one label would hide exactly what a reviewer must see.
 *
 * Provider scores are never merged (ADR-0018 D4): `scores` is a list keyed by
 * provider and scale; there is no top-level `confidence`, and nothing here
 * compares or averages across providers.
 */
import { createHash } from 'node:crypto';

export type CandidateKind =
  | 'table-range'
  | 'image'
  | 'region-snapshot'
  | 'shape'
  | 'diagram'
  | 'tree'
  | 'choice-list'
  | 'note'
  | 'link'
  | 'section';

export type EpistemicStatus = 'observed' | 'inferred' | 'abstained';
export type ReviewState = 'unreviewed' | 'accepted' | 'rejected' | 'modified' | 'deferred';
export type ExecutionProperty = 'deterministic' | 'provider-dependent';
/** M0 explicit extraction, M1 deterministic inference, M2 light similarity, M3 bounded judgment, M4 local generative, M5 external handoff. */
export type MethodClass = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

/** Where in which source. Source paths are as the caller wants them written (e.g. relative to a document). */
export interface SourceLocator {
  /** Source file, e.g. `./data/design.xlsx`. */
  source: string;
  /** Digest of the source bytes the candidate was derived from (SourceIdentity v1). */
  sourceDigest: string;
  sheet?: string;
  /** A1 range of the candidate in the source (physical coordinates). */
  range?: string;
}

export interface Evidence {
  /** Short machine-readable tag, e.g. `blank-row-split`. */
  code: string;
  /** Human-readable detail, optional. */
  detail?: string;
}

/** One statement a method makes about a candidate, with its own epistemic footing. */
export interface Claim {
  aspect: string;
  /** Absent when status is `abstained`: a method that declines asserts nothing. */
  value?: string | readonly string[];
  status: EpistemicStatus;
  execution: ExecutionProperty;
  method: MethodClass;
  /** Why: a stable code (also the reason for abstaining). */
  reasonCode: string;
  evidence?: readonly Evidence[];
}

/** A provider's own score, on its own scale. Never combined with another provider's. */
export interface ProviderScore {
  provider: string;
  /** What the number means for that provider, e.g. `cosine`, `logit`, `rank`. */
  scale: string;
  value: number;
}

export type Reproducibility =
  | {
      execution: 'deterministic';
      /** Digest of the input (source bytes). Same input + config + implementationVersion => same output. */
      inputDigest: string;
      config: Readonly<Record<string, string | number | boolean>>;
      implementationVersion: string;
    }
  | {
      execution: 'provider-dependent';
      inputDigest: string;
      provider: string;
      model: string;
      artifactVersion: string;
      parameters: Readonly<Record<string, string | number | boolean>>;
    };

export interface Provenance {
  /** Algorithm or provider-method identifier, e.g. `mmi.table-region-detector`. */
  algorithm: string;
  run: Reproducibility;
}

export interface Fingerprint {
  algorithm: 'sha256';
  /** What was hashed. Different kinds use different representations (ADR-0019 D8). */
  representation: string;
  digest: string;
}

export interface Candidate {
  kind: CandidateKind;
  locator: SourceLocator;
  /** What the candidate as a whole asserts: its boundary/identity, not its coordinates. */
  status: EpistemicStatus;
  execution: ExecutionProperty;
  method: MethodClass;
  claims: readonly Claim[];
  provenance: Provenance;
  fingerprint: Fingerprint;
  /** Per-provider scores; empty for rule-based methods. No merged confidence exists. */
  scores: readonly ProviderScore[];
  /** MMI Notation that links this candidate (the Linked state), when one exists. */
  reference?: string;
}

/** The first violated invariant, or undefined when the candidate is well-formed. */
export function candidateProblem(candidate: Candidate): string | undefined {
  if (candidate.claims.length === 0) return 'a candidate needs at least one claim';
  if (candidate.provenance.run.execution !== candidate.execution) return 'execution disagrees with provenance.run';
  if (!candidate.locator.sourceDigest.startsWith('sha256:')) return 'sourceDigest must be a sha256: digest';
  if (candidate.provenance.run.inputDigest !== candidate.locator.sourceDigest) return 'run.inputDigest must be the sourceDigest';
  for (const claim of candidate.claims) {
    if (claim.status === 'abstained' && claim.value !== undefined) return `abstained claim "${claim.aspect}" must not carry a value`;
    if (claim.status !== 'abstained' && claim.value === undefined) return `claim "${claim.aspect}" needs a value`;
    if (!claim.reasonCode) return `claim "${claim.aspect}" needs a reasonCode`;
    if (candidate.execution === 'deterministic' && claim.execution !== 'deterministic') return `claim "${claim.aspect}" is provider-dependent inside a deterministic candidate`;
    if (claim.status === 'observed' && claim.method !== 'M0') return `observed claim "${claim.aspect}" must be M0 (explicit extraction)`;
  }
  const run = candidate.provenance.run;
  if (run.execution === 'provider-dependent' && !(run.provider && run.model && run.artifactVersion)) return 'provider-dependent run needs provider, model and artifactVersion';
  if (run.execution === 'deterministic' && !run.implementationVersion) return 'deterministic run needs implementationVersion';
  if (candidate.execution === 'deterministic' && candidate.scores.length > 0) return 'a deterministic rule method has no provider scores';
  const seen = new Set<string>();
  for (const score of candidate.scores) {
    const key = `${score.provider}\u0000${score.scale}`;
    if (seen.has(key)) return `duplicate score for ${score.provider}/${score.scale}`;
    seen.add(key);
  }
  if ((candidate.status === 'abstained') !== candidate.claims.every((claim) => claim.status === 'abstained')) {
    return 'a candidate is abstained exactly when all its claims are';
  }
  return undefined;
}

export function fingerprintOf(representation: string, material: string): Fingerprint {
  return { algorithm: 'sha256', representation, digest: `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}` };
}
