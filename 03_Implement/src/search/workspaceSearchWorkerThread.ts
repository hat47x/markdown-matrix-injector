/**
 * Worker-thread owner of WorkspaceRegionIndex.
 *
 * Requests are serialized because refresh mutates the catalog/index while
 * query reads it. Cancellation is delivered out-of-band so a long refresh can
 * stop between books even while later requests remain queued.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

import { WorkbookCache } from '../cache/workbookCache.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { WorkspaceRegionIndex, type SemanticSetting } from './workspaceRegionIndex.js';

interface RefreshRequest {
  kind: 'refresh';
  id: number;
  paths: string[];
}

interface QueryRequest {
  kind: 'query';
  id: number;
  text: string;
  markdownFilePath: string;
  maxCandidates: number;
  /** Experimental local-embedding lane; absent unless the user turned it on. */
  semantic?: SemanticSetting;
}

interface CancelRequest {
  kind: 'cancel';
  requestId: number;
}

type Request = RefreshRequest | QueryRequest | CancelRequest;

if (!parentPort) throw new Error('workspaceSearchWorkerThread must run inside a worker thread.');

const port = parentPort;
const workbookCache = new WorkbookCache<WorkbookData>();
const index = new WorkspaceRegionIndex({
  statFile: (bookPath) => {
    const stat = fs.statSync(bookPath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  },
  loadWorkbook: (bookPath) => loadWorkbook({ absolutePath: bookPath, cache: workbookCache }),
});

const refreshControllers = new Map<number, AbortController>();
const cancelledRefreshes = new Set<number>();
let queue = Promise.resolve();

port.on('message', (request: Request) => {
  if (request.kind === 'cancel') {
    const controller = refreshControllers.get(request.requestId);
    if (controller) controller.abort();
    else cancelledRefreshes.add(request.requestId);
    return;
  }
  queue = queue.then(() => handle(request)).catch((error) => {
    port.postMessage({
      kind: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

async function handle(request: RefreshRequest | QueryRequest): Promise<void> {
  if (request.kind === 'refresh') {
    const controller = new AbortController();
    refreshControllers.set(request.id, controller);
    if (cancelledRefreshes.delete(request.id)) controller.abort();
    try {
      const value = await index.refresh(request.paths, {
        signal: controller.signal,
        onProgress: (done, total) => port.postMessage({ kind: 'progress', id: request.id, done, total }),
      });
      // RegionCatalog retains only bounded structural/search evidence. Drop the
      // full workbooks used to build it; source verification will lazily cache
      // only the books that actual candidates touch.
      workbookCache.clear();
      port.postMessage({ kind: 'result', id: request.id, op: 'refresh', value });
    } finally {
      refreshControllers.delete(request.id);
      cancelledRefreshes.delete(request.id);
    }
    return;
  }

  const relativePath = (bookPath: string): string => {
    const relative = path.relative(path.dirname(request.markdownFilePath), bookPath).replace(/\\/g, '/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };
  const value = request.semantic
    ? await index.querySemantic(request.text, relativePath, request.semantic, undefined, request.maxCandidates)
    : index.query(request.text, relativePath, request.maxCandidates);
  port.postMessage({ kind: 'result', id: request.id, op: 'query', value });
}
