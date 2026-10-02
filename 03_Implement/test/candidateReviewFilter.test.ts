import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableCandidateReviewFacets,
  candidateReviewFacetFilter,
  matchesCandidateReviewFacets,
} from '../src/application/candidateReviewFilter.js';
import type {
  CandidateKind,
  EpistemicStatus,
  ExecutionProperty,
} from '../src/core/candidate.js';

function candidate(
  kind: CandidateKind,
  status: EpistemicStatus,
  execution: ExecutionProperty,
) {
  return { kind, status, execution };
}

test('candidate review facet options expose only values present in the view', () => {
  const facets = availableCandidateReviewFacets([
    candidate('table-range', 'inferred', 'deterministic'),
    candidate('image', 'observed', 'deterministic'),
    candidate('image', 'inferred', 'provider-dependent'),
  ]);

  assert.deepEqual(facets, [
    { axis: 'kind', value: 'table-range' },
    { axis: 'kind', value: 'image' },
    { axis: 'status', value: 'observed' },
    { axis: 'status', value: 'inferred' },
    { axis: 'execution', value: 'deterministic' },
    { axis: 'execution', value: 'provider-dependent' },
  ]);
});

test('empty facet selection keeps every Candidate visible', () => {
  const filter = candidateReviewFacetFilter([]);

  assert.equal(
    matchesCandidateReviewFacets(
      candidate('table-range', 'inferred', 'deterministic'),
      filter,
    ),
    true,
  );
  assert.equal(
    matchesCandidateReviewFacets(
      candidate('image', 'observed', 'provider-dependent'),
      filter,
    ),
    true,
  );
});

test('facet values are OR within one axis and AND across axes', () => {
  const filter = candidateReviewFacetFilter([
    { axis: 'kind', value: 'table-range' },
    { axis: 'kind', value: 'image' },
    { axis: 'status', value: 'inferred' },
    { axis: 'execution', value: 'deterministic' },
  ]);

  assert.equal(
    matchesCandidateReviewFacets(
      candidate('table-range', 'inferred', 'deterministic'),
      filter,
    ),
    true,
  );
  assert.equal(
    matchesCandidateReviewFacets(
      candidate('image', 'inferred', 'deterministic'),
      filter,
    ),
    true,
  );
  assert.equal(
    matchesCandidateReviewFacets(
      candidate('image', 'observed', 'deterministic'),
      filter,
    ),
    false,
  );
  assert.equal(
    matchesCandidateReviewFacets(
      candidate('image', 'inferred', 'provider-dependent'),
      filter,
    ),
    false,
  );
});

test('facet filter keeps deterministic and provider-dependent inference distinct', () => {
  const deterministic = candidateReviewFacetFilter([
    { axis: 'status', value: 'inferred' },
    { axis: 'execution', value: 'deterministic' },
  ]);
  const provider = candidateReviewFacetFilter([
    { axis: 'status', value: 'inferred' },
    { axis: 'execution', value: 'provider-dependent' },
  ]);

  const ruleCandidate = candidate(
    'table-range',
    'inferred',
    'deterministic',
  );
  const modelCandidate = candidate(
    'table-range',
    'inferred',
    'provider-dependent',
  );

  assert.equal(
    matchesCandidateReviewFacets(ruleCandidate, deterministic),
    true,
  );
  assert.equal(
    matchesCandidateReviewFacets(modelCandidate, deterministic),
    false,
  );
  assert.equal(
    matchesCandidateReviewFacets(ruleCandidate, provider),
    false,
  );
  assert.equal(
    matchesCandidateReviewFacets(modelCandidate, provider),
    true,
  );
});

test('duplicate facet selections do not duplicate filter values', () => {
  assert.deepEqual(
    candidateReviewFacetFilter([
      { axis: 'kind', value: 'image' },
      { axis: 'kind', value: 'image' },
      { axis: 'status', value: 'abstained' },
      { axis: 'status', value: 'abstained' },
    ]),
    {
      kinds: ['image'],
      statuses: ['abstained'],
      executions: [],
    },
  );
});
