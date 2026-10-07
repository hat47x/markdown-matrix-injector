import assert from 'node:assert/strict';
import test from 'node:test';

import type { Candidate } from '../src/core/candidate.js';
import type {
  CandidateReviewInventoryItem,
} from '../src/application/candidateReviewInventory.js';
import {
  CandidateReviewProviderCache,
  startCandidateReviewProviderRefresh,
} from '../src/application/candidateReviewProviderRefresh.js';
import {
  candidateReviewSessionKey,
} from '../src/application/candidateReviewSession.js';

const digestA = 'sha256:' + 'a'.repeat(64);
const digestB = 'sha256:' + 'b'.repeat(64);
const fingerprint = 'sha256:' + 'c'.repeat(64);

function providerCandidate(
  provider: string,
  sourceDigest = digestA,
): Candidate {
  return {
    kind: 'table-range',
    locator: {
      source: './design.xlsx',
      sourceDigest,
      sheet: 'Sheet1',
      range: 'A1:B2',
    },
    status: 'inferred',
    execution: 'provider-dependent',
    method: 'M2',
    claims: [{
      aspect: 'boundary',
      value: 'A1:B2',
      status: 'inferred',
      execution: 'provider-dependent',
      method: 'M2',
      reasonCode: 'test-provider-boundary',
    }],
    provenance: {
      algorithm: `test.${provider}`,
      run: {
        execution: 'provider-dependent',
        inputDigest: sourceDigest,
        provider,
        model: 'test-model',
        artifactVersion: 'fixture-v1',
        parameters: {},
      },
    },
    fingerprint: {
      algorithm: 'sha256',
      representation: 'test-provider-table-v1',
      digest: fingerprint,
    },
    scores: [{
      provider,
      scale: 'cosine',
      value: 0.8,
    }],
    reference: '![[./design.xlsx#Sheet1|A1:B2]]',
  };
}

function tableItem(
  provider: string,
  sourceDigest = digestA,
): CandidateReviewInventoryItem {
  return {
    kind: 'table',
    candidate: providerCandidate(provider, sourceDigest),
    sheet: 'Sheet1',
    range: 'A1:B2',
  };
}

const context = {
  sourcePath: '/workspace/design.xlsx',
  sourceLabel: './design.xlsx',
  sourceDigest: digestA,
};

test('provider refresh returns cached work immediately and completes new work in the background', async () => {
  const cache = new CandidateReviewProviderCache();
  let release:
    ((items: readonly CandidateReviewInventoryItem[]) => void)
    | undefined;
  const pending = new Promise<readonly CandidateReviewInventoryItem[]>(
    (resolve) => {
      release = resolve;
    },
  );

  const refresh = startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: () => pending,
    }],
    cache,
  );

  assert.deepEqual(refresh.cachedItems, []);
  let completed = false;
  void refresh.settled.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(
    completed,
    false,
    'opening review must not await provider completion',
  );

  release?.([tableItem('provider-a')]);
  const summary = await refresh.settled;
  assert.deepEqual(summary.completedProviders, ['provider-a']);
  assert.deepEqual(summary.failedProviders, []);
  assert.equal(summary.cachedItemCount, 1);

  const next = startCandidateReviewProviderRefresh(
    context,
    [],
    cache,
  );
  assert.equal(next.cachedItems.length, 1);
  assert.equal(
    next.cachedItems[0].candidate.execution,
    'provider-dependent',
  );
});

test('provider cache is source-snapshot scoped', async () => {
  const cache = new CandidateReviewProviderCache();
  await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [tableItem('provider-a')],
    }],
    cache,
  ).settled;

  const changed = startCandidateReviewProviderRefresh(
    { ...context, sourceDigest: digestB },
    [],
    cache,
  );
  assert.deepEqual(changed.cachedItems, []);
});

test('invalid provider output fails closed without replacing cached results', async () => {
  const cache = new CandidateReviewProviderCache();
  await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [tableItem('provider-a')],
    }],
    cache,
  ).settled;

  const invalid = tableItem('provider-a');
  invalid.candidate.execution = 'deterministic';

  const summary = await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [invalid],
    }],
    cache,
  ).settled;

  assert.equal(summary.completedProviders.length, 0);
  assert.equal(summary.failedProviders.length, 1);
  assert.match(
    summary.failedProviders[0].message,
    /non-provider-dependent/u,
  );
  assert.equal(cache.get(context).length, 1);
  assert.equal(cache.get(context)[0].candidate.execution, 'provider-dependent');
});

test('provider identity stays separate in one review session', () => {
  const left = providerCandidate('provider-a');
  const right = providerCandidate('provider-b');

  assert.equal(left.fingerprint.digest, right.fingerprint.digest);
  assert.notEqual(
    candidateReviewSessionKey(left),
    candidateReviewSessionKey(right),
  );
});

test('lane provenance must match provider id and current source', async () => {
  const cache = new CandidateReviewProviderCache();
  const wrongProvider = await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [tableItem('provider-b')],
    }],
    cache,
  ).settled;
  assert.equal(wrongProvider.failedProviders.length, 1);
  assert.match(
    wrongProvider.failedProviders[0].message,
    /provenance does not match/u,
  );

  const wrongSource = await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [tableItem('provider-a', digestB)],
    }],
    cache,
  ).settled;
  assert.equal(wrongSource.failedProviders.length, 1);
  assert.match(
    wrongSource.failedProviders[0].message,
    /current source snapshot/u,
  );
  assert.deepEqual(cache.get(context), []);
});


test('provider cache does not leak across workspaces with the same label and bytes', async () => {
  const cache = new CandidateReviewProviderCache();
  await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [tableItem('provider-a')],
    }],
    cache,
  ).settled;

  const otherWorkspace = startCandidateReviewProviderRefresh(
    { ...context, sourcePath: '/other-workspace/design.xlsx' },
    [],
    cache,
  );
  assert.deepEqual(otherWorkspace.cachedItems, []);
});

test('deterministic review session keys keep their pre-provider format', () => {
  const candidate = providerCandidate('provider-a');
  candidate.execution = 'deterministic';
  candidate.method = 'M1';
  candidate.claims = [{
    aspect: 'boundary',
    value: 'A1:B2',
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    reasonCode: 'test-boundary',
  }];
  candidate.provenance = {
    algorithm: 'test.deterministic',
    run: {
      execution: 'deterministic',
      inputDigest: digestA,
      config: {},
      implementationVersion: 'fixture-v1',
    },
  };
  candidate.scores = [];

  assert.equal(
    candidateReviewSessionKey(candidate),
    [
      'table-range',
      './design.xlsx',
      'Sheet1',
      'A1:B2',
      'test-provider-table-v1',
      fingerprint,
    ].join('\u0000'),
  );
});

test('one provider lane deduplicates repeated copies of the same Candidate', async () => {
  const cache = new CandidateReviewProviderCache();
  const item = tableItem('provider-a');

  const summary = await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [item, item],
    }],
    cache,
  ).settled;

  assert.deepEqual(summary.completedProviders, ['provider-a']);
  assert.equal(summary.cachedItemCount, 1);
  assert.equal(cache.get(context).length, 1);
});


test('provider parameters remain separate review evidence', () => {
  const left = providerCandidate('provider-a');
  const right = providerCandidate('provider-a');
  if (
    left.provenance.run.execution !== 'provider-dependent'
    || right.provenance.run.execution !== 'provider-dependent'
  ) {
    assert.fail('expected provider-dependent fixtures');
  }
  left.provenance.run.parameters = { threshold: 0.6, mode: 'local' };
  right.provenance.run.parameters = { mode: 'local', threshold: 0.7 };

  assert.notEqual(
    candidateReviewSessionKey(left),
    candidateReviewSessionKey(right),
  );

  const sameAsLeft = providerCandidate('provider-a');
  if (sameAsLeft.provenance.run.execution !== 'provider-dependent') {
    assert.fail('expected provider-dependent fixture');
  }
  sameAsLeft.provenance.run.parameters = { mode: 'local', threshold: 0.6 };
  assert.equal(
    candidateReviewSessionKey(left),
    candidateReviewSessionKey(sameAsLeft),
    'parameter key order must not change identity',
  );
});

test('duplicate provider lanes fail closed instead of racing to overwrite cache', async () => {
  const cache = new CandidateReviewProviderCache();
  let duplicateCalled = false;
  const summary = await startCandidateReviewProviderRefresh(
    context,
    [
      {
        providerId: 'provider-a',
        collect: async () => [tableItem('provider-a')],
      },
      {
        providerId: 'provider-a',
        collect: async () => {
          duplicateCalled = true;
          return [];
        },
      },
    ],
    cache,
  ).settled;

  assert.deepEqual(summary.completedProviders, ['provider-a']);
  assert.equal(summary.failedProviders.length, 1);
  assert.match(summary.failedProviders[0].message, /Duplicate/u);
  assert.equal(duplicateCalled, false);
  assert.equal(cache.get(context).length, 1);
});

test('provider review item kind must match Candidate kind', async () => {
  const cache = new CandidateReviewProviderCache();
  const item = tableItem('provider-a');
  const mismatched = {
    ...item,
    kind: 'image' as const,
  } as unknown as CandidateReviewInventoryItem;

  const summary = await startCandidateReviewProviderRefresh(
    context,
    [{
      providerId: 'provider-a',
      collect: async () => [mismatched],
    }],
    cache,
  ).settled;

  assert.equal(summary.completedProviders.length, 0);
  assert.equal(summary.failedProviders.length, 1);
  assert.match(summary.failedProviders[0].message, /does not match Candidate kind/u);
  assert.deepEqual(cache.get(context), []);
});
