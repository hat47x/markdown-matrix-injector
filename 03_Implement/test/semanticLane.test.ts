import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { createEmbeddingProvider, endpointProblem, type FetchLike } from '../src/search/semantic/embeddingProvider.js';
import type { DiscoveryFetch } from '../src/search/semantic/runtimeDiscovery.js';
import { WorkspaceRegionIndex, type SemanticSetting } from '../src/search/workspaceRegionIndex.js';

function sheet(cells: Record<string, string>): SheetSource {
  const map = new Map<string, SourceCell>();
  let used = { startRow: Infinity, startCol: Infinity, endRow: -1, endCol: -1 };
  for (const [ref, text] of Object.entries(cells)) {
    const [, letters, digits] = /^([A-Z]+)(\d+)$/u.exec(ref)!;
    const col = letters.charCodeAt(0) - 65;
    const row = Number(digits) - 1;
    map.set(`${row},${col}`, { text, type: 's', value: text });
    used = { startRow: Math.min(used.startRow, row), startCol: Math.min(used.startCol, col), endRow: Math.max(used.endRow, row), endCol: Math.max(used.endCol, col) };
  }
  return { usedRange: used, merges: [], cellAt: (r, c) => map.get(`${r},${c}`) };
}

const BOOKS: Record<string, WorkbookData> = {
  '/ws/本番移行.xlsx': {
    sheets: {
      リハーサル: sheet({ A1: '回', B1: '実施日', C1: '結果', D1: '所見', A2: '1', B2: '10/01', C2: '機密セル値XYZ', D2: '問題なし', A3: '2', B3: '10/08', C3: '成功', D3: '手順修正' }),
    },
  },
  '/ws/環境.xlsx': {
    sheets: {
      サーバ: sheet({ A1: '機器名', B1: 'OS', C1: 'メモリ', D1: '用途', A2: 'web01', B2: 'Linux', C2: '16GB', D2: 'Web', A3: 'db01', B3: 'Linux', C3: '64GB', D3: 'DB' }),
    },
  },
};

/**
 * A stand-in embedding model: it knows that 予行演習 means リハーサル and 機械 means サーバ, then hashes
 * character bigrams. It is deliberately tiny -- the test is about the plumbing and the boundaries.
 */
function embedText(text: string): number[] {
  const folded = text.replace(/予行演習/gu, 'リハーサル').replace(/機械/gu, 'サーバ').replace(/本番前/gu, '本番移行');
  const vector = new Array<number>(64).fill(0);
  const chars = [...folded.replace(/\s+/gu, '')];
  for (let i = 0; i + 1 < chars.length; i += 1) {
    const code = (chars[i].codePointAt(0)! * 31 + chars[i + 1].codePointAt(0)!) % 64;
    vector[code] += 1;
  }
  return vector;
}

function fakeFetch(log: Array<{ url: string; body: { model: string; input: string[] } }>, options: { fail?: boolean } = {}): FetchLike {
  return async (url, init) => {
    const body = JSON.parse(init.body) as { model: string; input: string[] };
    log.push({ url, body });
    if (options.fail) throw new Error('connection refused');
    const vectors = body.input.map(embedText);
    return { ok: true, json: async () => (url.endsWith('/api/embed') ? { embeddings: vectors } : { data: vectors.map((embedding) => ({ embedding })) }) };
  };
}

function build(
  fetchImpl?: FetchLike,
  semanticIdentityFetch?: DiscoveryFetch,
) {
  const index = new WorkspaceRegionIndex({
    statFile: () => ({ mtimeMs: 1, size: 1 }),
    loadWorkbook: (path) => BOOKS[path],
    ...(fetchImpl ? { embeddingFetch: fetchImpl } : {}),
    ...(semanticIdentityFetch ? { semanticIdentityFetch } : {}),
  });
  return index;
}
const relative = (path: string): string => `./${path.split('/').pop()}`;
const SETTING: SemanticSetting = { api: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'fake-embed', minScore: 0.3 };
const REQUEST = '予行演習は何回やって、うまくいったの？';

test('endpoint: only loopback is accepted, so table names cannot leave the machine', () => {
  assert.equal(endpointProblem('http://127.0.0.1:11434'), undefined);
  assert.equal(endpointProblem('http://localhost:1234'), undefined);
  assert.equal(endpointProblem('http://[::1]:8080'), undefined);
  for (const bad of ['http://192.168.1.5:11434', 'https://api.example.com', 'http://localhost.evil.com', 'ftp://127.0.0.1', 'not a url', 'http://user:pw@127.0.0.1']) {
    assert.ok(endpointProblem(bad), bad);
  }
  assert.throws(() => createEmbeddingProvider({ api: 'ollama', endpoint: 'http://10.0.0.2:11434', model: 'm' }));
  assert.throws(() => createEmbeddingProvider({ api: 'ollama', endpoint: 'http://127.0.0.1:11434', model: ' ' }));
});

test('provider: Ollama and OpenAI-compatible responses are read; failure is `unavailable`, not an error', async () => {
  const log: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  const ollama = createEmbeddingProvider({ api: 'ollama', endpoint: 'http://127.0.0.1:11434/', model: 'm' }, fakeFetch(log));
  assert.equal((await ollama.embed(['あ', 'い']))?.length, 2);
  assert.equal(log[0].url, 'http://127.0.0.1:11434/api/embed');
  const openai = createEmbeddingProvider({ api: 'openai-compatible', endpoint: 'http://127.0.0.1:1234', model: 'm' }, fakeFetch(log));
  assert.equal((await openai.embed(['あ']))?.length, 1);
  assert.equal(log[1].url, 'http://127.0.0.1:1234/v1/embeddings');
  const down = createEmbeddingProvider({ api: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'm' }, fakeFetch([], { fail: true }));
  assert.equal(await down.embed(['あ']), undefined);
  assert.equal(ollama.descriptor.executionBoundary, 'local');
});

test('semantic lane: off by default -- without a setting the result is exactly the name lane', async () => {
  const index = build(fakeFetch([]));
  await index.refresh(Object.keys(BOOKS));
  const result = await index.querySemantic(REQUEST, relative, undefined);
  assert.notEqual(result.status, 'candidates');
});

test('semantic lane: a description with no shared word finds the table by meaning, as an inferred candidate', async () => {
  const log: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  const index = build(fakeFetch(log));
  await index.refresh(Object.keys(BOOKS));
  const result = await index.querySemantic(REQUEST, relative, SETTING);
  assert.equal(result.status, 'candidates');
  assert.equal(result.requiresSelection, true);
  const top = result.candidates[0];
  assert.equal(top.basis, 'semantic');
  assert.match(top.markdown, /本番移行\.xlsx#リハーサル/u);
  assert.equal(top.providerScore?.model, 'fake-embed');
  assert.equal(top.providerScore?.provider, 'local-embedding:ollama');
  assert.match(top.notes.join(''), /実験的機能/u);

  const machines = await index.querySemantic('機械のOSとメモリ容量が分かる表', relative, { ...SETTING, minScore: 0.1, window: 0.5 });
  assert.match(machines.candidates[0]?.markdown ?? '', /環境\.xlsx#サーバ/u);
});

test('semantic lane: what is sent is names and the request -- never a cell value', async () => {
  const log: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  const index = build(fakeFetch(log));
  await index.refresh(Object.keys(BOOKS));
  await index.querySemantic(REQUEST, relative, SETTING);
  const sent = log.flatMap((entry) => entry.body.input).join('\n');
  assert.ok(sent.includes('見出し: 回、実施日、結果、所見'));
  assert.ok(!sent.includes('機密セル値XYZ'));
  assert.ok(!sent.includes('web01'));
});

test('semantic lane: a request that names a table, or a task, never reaches the model', async () => {
  const log: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  const index = build(fakeFetch(log));
  await index.refresh(Object.keys(BOOKS));
  const named = await index.querySemantic('「予行演習」の表', relative, SETTING);
  const task = await index.querySemantic('リハーサルの回数を集計して', relative, SETTING);
  assert.notEqual(named.status, "unsupported");
  assert.ok(named.candidates.every((candidate) => candidate.basis !== 'semantic'));
  assert.ok(task.candidates.every((candidate) => candidate.basis !== 'semantic'));
  assert.equal(task.status, 'unsupported');
});

test('semantic lane: below the threshold nothing is offered, and an unavailable runtime changes nothing', async () => {
  const strict = build(fakeFetch([]));
  await strict.refresh(Object.keys(BOOKS));
  const unrelated = await strict.querySemantic('社員食堂の今週のメニューは何か', relative, { ...SETTING, minScore: 0.9 });
  assert.notEqual(unrelated.status, 'candidates');

  const down = build(fakeFetch([], { fail: true }));
  await down.refresh(Object.keys(BOOKS));
  const offline = await down.querySemantic(REQUEST, relative, SETTING);
  assert.notEqual(offline.status, 'candidates');
  const refused = await down.querySemantic(REQUEST, relative, { ...SETTING, endpoint: 'http://192.168.0.9:11434' });
  assert.notEqual(refused.status, 'candidates');
});

test('semantic lane is off by default in the extension settings and the endpoint default is loopback', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { default?: unknown }> } };
  };
  const properties = manifest.contributes.configuration.properties;
  assert.equal(properties['markdownMatrixInjector.search.semantic.enabled'].default, false);
  assert.equal(properties['markdownMatrixInjector.search.semantic.model'].default, '');
  assert.equal(properties['markdownMatrixInjector.search.semantic.artifactDigest'].default, '');
  assert.equal(endpointProblem(String(properties['markdownMatrixInjector.search.semantic.endpoint'].default)), undefined);
});

test('semantic-eval harness: sweeps thresholds against a local runtime and reports recall with false acceptance', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const input = (JSON.parse(body) as { input: string[] }).input;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ embeddings: input.map(embedText) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as { port: number };
    const { main } = await import('../scripts/cpu-search-eval/semantic-eval.js');
    const report = (await main(['--queries', 'dev', '--model', 'fake', '--endpoint', `http://127.0.0.1:${port}`])) as {
      sweep: Array<{ threshold: number; recallAt5: number; rejectionAccuracy: number; falseAcceptances: string[] }>;
      requestsReachingModel: number;
      provider: { executionBoundary: string };
    };
    assert.equal(report.provider.executionBoundary, 'local');
    assert.ok(report.sweep.length >= 5);
    // A stricter threshold can only offer fewer candidates from the model, never more false acceptances.
    for (let i = 1; i < report.sweep.length; i += 1) {
      assert.ok(report.sweep[i].falseAcceptances.length <= report.sweep[i - 1].falseAcceptances.length);
    }
    assert.ok(report.requestsReachingModel >= 0);
  } finally {
    server.close();
  }
});


test('semantic lane: pinned artifact digest must still match the runtime before ranking', async () => {
  const embeddingLog: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  let identityCalls = 0;
  const identityFetch: DiscoveryFetch = async (url) => {
    identityCalls += 1;
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    return {
      ok: true,
      async json() {
        return {
          models: [{
            model: 'fake-embed',
            digest: 'a'.repeat(64),
            size: 123,
          }],
        };
      },
    };
  };
  const index = build(fakeFetch(embeddingLog), identityFetch);
  await index.refresh(Object.keys(BOOKS));

  const accepted = await index.querySemantic(
    REQUEST,
    relative,
    {
      ...SETTING,
      expectedArtifactDigest: `sha256:${'a'.repeat(64)}`,
    },
  );
  assert.equal(accepted.status, 'candidates');
  assert.ok(embeddingLog.length > 0);
  assert.equal(identityCalls, 1);

  embeddingLog.length = 0;
  const changed = await index.querySemantic(
    REQUEST,
    relative,
    {
      ...SETTING,
      expectedArtifactDigest: `sha256:${'b'.repeat(64)}`,
    },
  );
  assert.notEqual(changed.status, 'candidates');
  assert.equal(embeddingLog.length, 0);
  assert.equal(identityCalls, 2);
});

test('semantic lane: unverifiable pinned digest disables only semantic ranking', async () => {
  const embeddingLog: Array<{ url: string; body: { model: string; input: string[] } }> = [];
  const index = build(fakeFetch(embeddingLog), async () => {
    throw new Error('runtime unavailable');
  });
  await index.refresh(Object.keys(BOOKS));

  const result = await index.querySemantic(
    REQUEST,
    relative,
    {
      ...SETTING,
      expectedArtifactDigest: `sha256:${'a'.repeat(64)}`,
    },
  );
  assert.notEqual(result.status, 'candidates');
  assert.equal(embeddingLog.length, 0);

  // Lexical retrieval remains available and authoritative.
  assert.equal(
    index.query('本番移行', relative).status,
    'candidates',
  );
});
