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


test('search worker client cancels stale queries and keeps later queries usable', async () => {
  const client = new WorkspaceSearchWorkerClient({ workerUrl });
  try {
    const controller = new AbortController();
    const stale = client.query(
      'wait-query',
      '/ws/docs/readme.md',
      5,
      undefined,
      controller.signal,
    );
    controller.abort();

    await assert.rejects(
      stale,
      (error: unknown) =>
        error instanceof Error && error.name === 'AbortError',
    );

    const state = await client.query(
      'cancel-state',
      '/ws/docs/readme.md',
    );
    assert.deepEqual(state.reasons, ['cancelled:1']);

    const latest = await client.query(
      'latest-query',
      '/ws/docs/readme.md',
    );
    assert.deepEqual(latest.reasons, ['latest-query']);
  } finally {
    client.dispose();
  }
});

test('semantic query cancellation is wired from UI through worker to provider signal', async () => {
  const { default: fs } = await import('node:fs/promises');
  const [flow, thread] = await Promise.all([
    fs.readFile(
      new URL('../src/dx/searchFlow.ts', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../src/search/workspaceSearchWorkerThread.ts', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(flow, /let activeQueryController: AbortController \| undefined;/u);
  assert.match(flow, /activeQueryController\?\.abort\(\);/u);
  assert.match(
    flow,
    /readSemanticSetting\(\),\s*controller\.signal,/su,
  );
  assert.match(
    thread,
    /index\.querySemantic\([\s\S]*?controller\.signal,[\s\S]*?request\.maxCandidates/su,
  );
  assert.match(
    thread,
    /requestControllers\.get\(request\.requestId\)[\s\S]*?controller\.abort\(\)/su,
  );
});
