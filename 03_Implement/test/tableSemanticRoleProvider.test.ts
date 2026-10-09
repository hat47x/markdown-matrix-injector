import test from 'node:test';
import assert from 'node:assert/strict';

import type { Candidate } from '../src/core/candidate.js';
import type {
  CandidateReviewInventoryItem,
} from '../src/application/candidateReviewInventory.js';
import {
  createTableSemanticRoleProviderLane,
  TABLE_SEMANTIC_ROLES,
  tableSemanticRoleDescriptor,
} from '../src/application/tableSemanticRoleProvider.js';
import type {
  DiscoveryFetch,
} from '../src/search/semantic/runtimeDiscovery.js';
import type {
  FetchLike,
} from '../src/search/semantic/embeddingProvider.js';

const sourceDigest = 'sha256:' + 'a'.repeat(64);
const fingerprint = 'sha256:' + 'b'.repeat(64);

function tableCandidate(
  title = 'リリース予定',
  headers: readonly string[] = ['日付', '担当', '予定'],
): Candidate {
  return {
    kind: 'table-range',
    locator: {
      source: './design.xlsx',
      sourceDigest,
      sheet: '計画',
      range: 'A1:C4',
    },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims: [
      {
        aspect: 'location',
        value: 'A1:C4',
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'source-cell-coordinates',
      },
      {
        aspect: 'boundary',
        value: 'A1:C4',
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'blank-row-column-regions',
      },
      ...(title
        ? [{
            aspect: 'title',
            value: title,
            status: 'inferred',
            execution: 'deterministic',
            method: 'M1',
            reasonCode: 'title-above-block',
          } as const]
        : []),
      ...(headers.length > 0
        ? [{
            aspect: 'header',
            value: headers,
            status: 'inferred',
            execution: 'deterministic',
            method: 'M1',
            reasonCode: 'header-rules-passed',
          } as const]
        : []),
      {
        aspect: 'private-sample',
        value: 'SECRET-CELL-VALUE',
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'test-only',
      },
    ],
    provenance: {
      algorithm: 'mmi.table-region-detector',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion: '1',
      },
    },
    fingerprint: {
      algorithm: 'sha256',
      representation: 'table-display-cells-v1',
      digest: fingerprint,
    },
    scores: [],
    reference: '![[./design.xlsx#計画|A1:C4?header=first]]',
  };
}

function tableItem(
  candidate = tableCandidate(),
): Extract<CandidateReviewInventoryItem, { kind: 'table' }> {
  return {
    kind: 'table',
    candidate,
    sheet: '計画',
    range: 'A1:C4',
    title: 'リリース予定',
  };
}

function vectorFor(text: string): number[] {
  const vector = Array(TABLE_SEMANTIC_ROLES.length).fill(0);
  const roleIndex = TABLE_SEMANTIC_ROLES.findIndex((role) =>
    text.includes(role.description));
  if (roleIndex >= 0) {
    vector[roleIndex] = 1;
    return vector;
  }
  if (text.includes('曖昧')) {
    vector[0] = 1;
    vector[1] = 1;
    return vector;
  }
  if (
    text.includes('リリース予定')
    || text.includes('日付')
    || text.includes('担当')
  ) {
    vector[TABLE_SEMANTIC_ROLES.findIndex(
      (role) => role.id === 'schedule-plan',
    )] = 1;
    return vector;
  }
  vector[0] = 1;
  return vector;
}

function embeddingFetch(
  seenInputs: string[],
): FetchLike {
  return async (_url, init) => {
    const body = JSON.parse(init.body) as {
      input: string[];
    };
    seenInputs.push(...body.input);
    return {
      ok: true,
      async json() {
        return {
          embeddings: body.input.map(vectorFor),
        };
      },
    };
  };
}

const context = {
  sourcePath: '/workspace/design.xlsx',
  sourceLabel: './design.xlsx',
  sourceDigest,
};

test('table semantic role provider preserves deterministic occurrence/content identity and adds only an M2 role Claim', async () => {
  const seen: string[] = [];
  const base = tableCandidate();
  const lane = createTableSemanticRoleProviderLane({
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model',
    items: [tableItem(base)],
    embeddingFetch: embeddingFetch(seen),
    minScore: 0.6,
    minMargin: 0.05,
  });

  const items = await lane.collect(context);
  assert.equal(items.length, 1);
  const candidate = items[0].candidate;
  assert.equal(candidate.execution, 'provider-dependent');
  assert.equal(candidate.method, 'M2');
  assert.equal(candidate.status, 'inferred');
  assert.deepEqual(candidate.locator, base.locator);
  assert.deepEqual(candidate.fingerprint, base.fingerprint);
  assert.equal(candidate.reference, base.reference);
  assert.deepEqual(candidate.claims.map((claim) => claim.aspect), [
    'semantic-role',
  ]);
  assert.equal(candidate.claims[0].value, 'schedule-plan');
  assert.equal(candidate.scores.length, 1);
  assert.equal(candidate.scores[0].provider, lane.providerId);
  assert.equal(candidate.scores[0].scale, 'cosine');
  assert.ok(candidate.scores[0].value > 0.99);

  assert.equal(
    seen.some((text) => text.includes('SECRET-CELL-VALUE')),
    false,
    'provider input must not contain arbitrary Candidate/cell values',
  );
  assert.equal(
    seen.some((text) => text.includes('見出し: 日付、担当、予定')),
    true,
  );
});

test('descriptor uses only sheet, title and inferred headers', () => {
  const descriptor = tableSemanticRoleDescriptor(tableItem());
  assert.equal(
    descriptor,
    'シート: 計画 / 表題: リリース予定 / 見出し: 日付、担当、予定',
  );
  assert.equal(descriptor?.includes('SECRET-CELL-VALUE'), false);
});

test('ambiguous role scores abstain instead of forcing a label', async () => {
  const seen: string[] = [];
  const ambiguous = tableCandidate('曖昧', ['分類', '対応']);
  const lane = createTableSemanticRoleProviderLane({
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model',
    items: [tableItem(ambiguous)],
    embeddingFetch: embeddingFetch(seen),
    minScore: 0.6,
    minMargin: 0.1,
  });

  assert.deepEqual(await lane.collect(context), []);
});

test('tables without title or header are not sent to the provider', async () => {
  let calls = 0;
  const base = tableCandidate('', []);
  const lane = createTableSemanticRoleProviderLane({
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model',
    items: [tableItem(base)],
    embeddingFetch: async () => {
      calls += 1;
      throw new Error('should not be called');
    },
  });

  assert.deepEqual(await lane.collect(context), []);
  assert.equal(calls, 0);
});

test('pinned local artifact drift fails before embedding', async () => {
  let embeddingCalls = 0;
  const expected = 'sha256:' + 'c'.repeat(64);
  const identityFetch: DiscoveryFetch = async () => ({
    ok: true,
    async json() {
      return {
        models: [{
          model: 'embed-model',
          digest: 'd'.repeat(64),
        }],
      };
    },
  });

  const lane = createTableSemanticRoleProviderLane({
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model',
    expectedArtifactDigest: expected,
    items: [tableItem()],
    identityFetch,
    embeddingFetch: async () => {
      embeddingCalls += 1;
      throw new Error('identity mismatch must stop first');
    },
  });

  await assert.rejects(
    () => lane.collect(context),
    /artifact identity no longer matches/u,
  );
  assert.equal(embeddingCalls, 0);
});
