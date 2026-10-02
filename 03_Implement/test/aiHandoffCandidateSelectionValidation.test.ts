import test from 'node:test';
import assert from 'node:assert/strict';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { createAiHandoffPackage } from '../src/dx/aiHandoff.js';
import {
  AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
  validateAiHandoffCandidateSelection,
} from '../src/dx/aiHandoffCandidateSelectionValidation.js';

function candidate(): Candidate {
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'table-range',
    locator: { source: './design.xlsx', sourceDigest, sheet: '画面', range: 'A1:B3' },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims: [{
      aspect: 'header',
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'header-likely',
    }],
    provenance: {
      algorithm: 'test',
      run: { execution: 'deterministic', inputDigest: sourceDigest, config: {}, implementationVersion: '1' },
    },
    fingerprint: fingerprintOf('table-display-cells-v1', 'content'),
    scores: [],
  };
}

test('accepts only a Candidate identity that was present in the handoff', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const result = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: '提示された候補の中で依頼対象に一致するため',
    unresolved: ['semantic role remains inferred'],
  });
  assert.equal(result.status, 'accepted-for-review');
  assert.equal(result.selected[0].digest, identity.digest);
  assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_NO_AUTHORITY_ESCALATION');
});

test('blocks a fabricated Candidate identity even when its shape is valid', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const fabricated = {
    algorithm: 'sha256' as const,
    representation: 'mmi-candidate-occurrence-content-v1' as const,
    digest: fingerprintOf('fabricated', 'candidate').digest,
  };
  const result = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [fabricated],
    rationale: '外部モデルが生成した候補',
    unresolved: [],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_NOT_IN_HANDOFF');
});

test('proposal receipt digest changes when nested selection content changes', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const first = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: 'A',
    unresolved: [],
  });
  const second = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: 'B',
    unresolved: [],
  });
  assert.notEqual(first.proposalDigest, second.proposalDigest);
});
