import assert from 'node:assert/strict';
import test from 'node:test';

import type { Candidate } from '../src/core/candidate.js';
import type {
  CandidateReviewInventoryItem,
} from '../src/application/candidateReviewInventory.js';
import {
  candidateReviewActionPolicy,
} from '../src/application/candidateReviewActionPolicy.js';

const digest = 'sha256:' + 'a'.repeat(64);
const fingerprint = 'sha256:' + 'b'.repeat(64);

function candidate(
  execution: 'deterministic' | 'provider-dependent',
): Candidate {
  return {
    kind: 'table-range',
    locator: {
      source: './design.xlsx',
      sourceDigest: digest,
      sheet: 'Sheet1',
      range: 'A1:B2',
    },
    status: 'inferred',
    execution,
    method: execution === 'deterministic' ? 'M1' : 'M2',
    claims: [{
      aspect: 'boundary',
      value: 'A1:B2',
      status: 'inferred',
      execution,
      method: execution === 'deterministic' ? 'M1' : 'M2',
      reasonCode: 'test-boundary',
    }],
    provenance: execution === 'deterministic'
      ? {
          algorithm: 'test.detector',
          run: {
            execution: 'deterministic',
            inputDigest: digest,
            config: {},
            implementationVersion: 'fixture-v1',
          },
        }
      : {
          algorithm: 'test.provider',
          run: {
            execution: 'provider-dependent',
            inputDigest: digest,
            provider: 'provider-a',
            model: 'model-a',
            artifactVersion: 'fixture-v1',
            parameters: {},
          },
        },
    fingerprint: {
      algorithm: 'sha256',
      representation: 'table-content-v1',
      digest: fingerprint,
    },
    scores: execution === 'deterministic'
      ? []
      : [{ provider: 'provider-a', scale: 'cosine', value: 0.8 }],
    reference: '![[./design.xlsx#Sheet1|A1:B2]]',
  };
}

function tableItem(
  execution: 'deterministic' | 'provider-dependent',
): CandidateReviewInventoryItem {
  return {
    kind: 'table',
    candidate: candidate(execution),
    sheet: 'Sheet1',
    range: 'A1:B2',
  };
}

test('deterministic extractable Candidates keep the existing extract path', () => {
  assert.deepEqual(
    candidateReviewActionPolicy(tableItem('deterministic')),
    { extraction: 'deterministic-extract' },
  );
});

test('provider-dependent Candidates are review-only until authority binding exists', () => {
  const policy = candidateReviewActionPolicy(
    tableItem('provider-dependent'),
  );
  assert.equal(policy.extraction, 'review-only');
  assert.match(policy.reason ?? '', /deterministic Candidate/u);
});

test('choice-list, shape and Note remain review-only independently of provider mode', () => {
  const base = candidate('deterministic');
  const choice = {
    kind: 'choice-list',
    candidate: {
      ...base,
      kind: 'choice-list',
    },
    choiceList: {},
  } as unknown as CandidateReviewInventoryItem;
  const shape = {
    kind: 'shape',
    candidate: {
      ...base,
      kind: 'shape',
    },
    shape: {},
  } as unknown as CandidateReviewInventoryItem;
  const note = {
    kind: 'note',
    candidate: {
      ...base,
      kind: 'note',
      status: 'observed',
      method: 'M0',
      claims: [{
        aspect: 'text',
        value: 'review me',
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'classic-comment-text',
      }],
    },
    note: {
      ordinal: 1,
      sheet: 'Sheet1',
      cell: 'A1',
      text: 'review me',
      commentsPart: 'xl/comments1.xml',
      contentDigest: fingerprint,
    },
  } as unknown as CandidateReviewInventoryItem;

  assert.equal(
    candidateReviewActionPolicy(choice).extraction,
    'review-only',
  );
  assert.equal(
    candidateReviewActionPolicy(shape).extraction,
    'review-only',
  );
  const notePolicy = candidateReviewActionPolicy(note, 'ja');
  assert.equal(notePolicy.extraction, 'review-only');
  assert.match(notePolicy.reason ?? '', /自動取り込み/u);
  assert.match(candidateReviewActionPolicy(note).reason ?? '', /not imported into the body automatically/u);
});
