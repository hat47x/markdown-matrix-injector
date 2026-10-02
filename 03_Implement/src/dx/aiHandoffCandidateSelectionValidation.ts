import { createHash } from 'node:crypto';

import {
  AI_HANDOFF_SCHEMA,
  assertAiHandoffPackage,
  type AiHandoffPackageV1,
  type HandoffCandidateIdentity,
} from './aiHandoff.js';

export const AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA =
  'mmi.ai-handoff-candidate-selection/v1' as const;
export const AI_HANDOFF_CANDIDATE_SELECTION_VALIDATION_SCHEMA =
  'mmi.ai-handoff-candidate-selection-validation/v1' as const;

export interface AiHandoffCandidateSelectionProposalV1 {
  schema: typeof AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA;
  selected: readonly HandoffCandidateIdentity[];
  rationale: string;
  unresolved: readonly string[];
}

export interface AiHandoffCandidateSelectionValidationV1 {
  schema: typeof AI_HANDOFF_CANDIDATE_SELECTION_VALIDATION_SCHEMA;
  handoffSchema: typeof AI_HANDOFF_SCHEMA;
  proposalDigest: string;
  status: 'accepted-for-review' | 'blocked';
  selected: readonly HandoffCandidateIdentity[];
  checks: readonly {
    check: 'package' | 'proposal-schema' | 'candidate-allowlist' | 'epistemic-boundary';
    status: 'passed' | 'failed';
    code: string;
    detail?: string;
  }[];
}

/**
 * Validates an external model's Candidate choice without turning that choice
 * into Authority. "accepted-for-review" only means that every selected identity
 * was actually present in the immutable handoff evidence and that the proposal
 * did not attempt to change epistemic state.
 */
export function validateAiHandoffCandidateSelection(
  handoff: AiHandoffPackageV1,
  proposal: unknown,
): AiHandoffCandidateSelectionValidationV1 {
  assertAiHandoffPackage(handoff);
  const checks: AiHandoffCandidateSelectionValidationV1['checks'][number][] = [
    { check: 'package', status: 'passed', code: 'HANDOFF_PACKAGE_ACCEPTED' },
  ];

  if (!isProposal(proposal)) {
    checks.push({ check: 'proposal-schema', status: 'failed', code: 'CANDIDATE_SELECTION_SCHEMA_INVALID' });
    return finish(handoff, proposal, [], checks);
  }
  checks.push({ check: 'proposal-schema', status: 'passed', code: 'CANDIDATE_SELECTION_SCHEMA_ACCEPTED' });

  const offered = collectCandidateIdentities(handoff);
  const selected = proposal.selected;
  const unknown = selected.filter((identity) => !offered.has(identity.digest));
  if (unknown.length > 0) {
    checks.push({
      check: 'candidate-allowlist',
      status: 'failed',
      code: 'CANDIDATE_SELECTION_NOT_IN_HANDOFF',
      detail: unknown.map((identity) => identity.digest).join(', '),
    });
    return finish(handoff, proposal, selected, checks);
  }
  checks.push({ check: 'candidate-allowlist', status: 'passed', code: 'CANDIDATE_SELECTION_IN_HANDOFF' });

  // Selection proposals contain identities + rationale only. They deliberately
  // have no field capable of rewriting observed/inferred/abstained state.
  checks.push({ check: 'epistemic-boundary', status: 'passed', code: 'CANDIDATE_SELECTION_NO_AUTHORITY_ESCALATION' });
  return finish(handoff, proposal, selected, checks);
}

function isProposal(value: unknown): value is AiHandoffCandidateSelectionProposalV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proposal = value as Partial<AiHandoffCandidateSelectionProposalV1>
    & Record<string, unknown>;
  const keys = Object.keys(proposal).sort();
  if (
    JSON.stringify(keys)
    !== JSON.stringify(['rationale', 'schema', 'selected', 'unresolved'])
  ) return false;
  return proposal.schema === AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA
    && Array.isArray(proposal.selected)
    && proposal.selected.length > 0
    && proposal.selected.every(isIdentity)
    && new Set(proposal.selected.map((item) => item.digest)).size === proposal.selected.length
    && typeof proposal.rationale === 'string'
    && proposal.rationale.trim().length > 0
    && Array.isArray(proposal.unresolved)
    && proposal.unresolved.every((item) => typeof item === 'string');
}

function isIdentity(value: unknown): value is HandoffCandidateIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Partial<HandoffCandidateIdentity>
    & Record<string, unknown>;
  const keys = Object.keys(identity).sort();
  if (
    JSON.stringify(keys)
    !== JSON.stringify(['algorithm', 'digest', 'representation'])
  ) return false;
  return identity.algorithm === 'sha256'
    && identity.representation === 'mmi-candidate-occurrence-content-v1'
    && typeof identity.digest === 'string'
    && /^sha256:[0-9a-f]{64}$/u.test(identity.digest);
}

function collectCandidateIdentities(handoff: AiHandoffPackageV1): Set<string> {
  const digests = new Set<string>();
  for (const item of handoff.confirmedFacts) digests.add(item.candidateIdentity.digest);
  for (const item of handoff.inferredCandidates) digests.add(item.candidateIdentity.digest);
  for (const item of handoff.unresolvedIssues) {
    if (item.kind === 'abstained-claim') digests.add(item.candidateIdentity.digest);
  }
  return digests;
}

function finish(
  handoff: AiHandoffPackageV1,
  proposal: unknown,
  selected: readonly HandoffCandidateIdentity[],
  checks: AiHandoffCandidateSelectionValidationV1['checks'],
): AiHandoffCandidateSelectionValidationV1 {
  return {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_VALIDATION_SCHEMA,
    handoffSchema: handoff.schema,
    proposalDigest: `sha256:${createHash('sha256').update(stableJson(proposal), 'utf8').digest('hex')}`,
    status: checks.every((item) => item.status === 'passed') ? 'accepted-for-review' : 'blocked',
    selected,
    checks,
  };
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}
