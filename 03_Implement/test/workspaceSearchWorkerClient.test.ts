import test from 'node:test';
import assert from 'node:assert/strict';

import { WorkspaceSearchWorkerClient } from '../src/search/workspaceSearchWorkerClient.js';

const workerUrl = new URL('./fixtures/workspace-search-worker-fixture.mjs', import.meta.url);

test('search worker client transports progress, results and cached state', async () => {
  const client = new WorkspaceSearchWorkerClient({ workerUrl });
  try {
    const progress: Array<[number, number]> = [];
    const refreshed = await client.refresh(['/a.xlsx', '/b.xlsx'], {
      onProgress: (done, total) => progress.push([done, total]),
    });
    assert.deepEqual(progress, [[1, 2]]);
    assert.equal(refreshed.cancelled, false);
    assert.equal(client.regionCount, 2);
    assert.equal(client.retrievalMethod, 'bm25');

    const query = await client.query('状態遷移表', '/ws/docs/readme.md');
    assert.equal(query.status, 'no-match');
    assert.deepEqual(query.reasons, ['状態遷移表']);
  } finally {
    client.dispose();
  }
});

test('search worker client forwards refresh cancellation', async () => {
  const client = new WorkspaceSearchWorkerClient({ workerUrl });
  try {
    const controller = new AbortController();
    const pending = client.refresh(['wait'], { signal: controller.signal });
    controller.abort();
    const refreshed = await pending;
    assert.equal(refreshed.cancelled, true);
    assert.equal(client.regionCount, 0);
  } finally {
    client.dispose();
  }
});
