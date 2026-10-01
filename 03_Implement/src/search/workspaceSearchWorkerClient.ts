/**
 * Extension-host client for the CPU table-search worker.
 *
 * The worker owns the mutable WorkspaceRegionIndex and workbook cache so
 * indexing, retrieval and source re-verification do not block the VS Code
 * extension-host event loop. This client only transports file lists, progress,
 * cancellation and plain structured-cloneable search results.
 */
import { Worker } from 'node:worker_threads';

import type { CompileResult } from './nlQuery/compiler.js';
import type { RefreshResult } from './workspaceRegionIndex.js';
import type { RetrievalMethod } from './searchIndex.js';

interface ProgressMessage {
  kind: 'progress';
  id: number;
  done: number;
  total: number;
}

interface ResultMessage {
  kind: 'result';
  id: number;
  op: 'refresh' | 'query';
  value: unknown;
}

interface ErrorMessage {
  kind: 'error';
  id: number;
  message: string;
}

type WorkerMessage = ProgressMessage | ResultMessage | ErrorMessage;

interface PendingRequest {
  resolve(value: any): void;
  reject(error: Error): void;
  onProgress?: (done: number, total: number) => void;
  cleanup?: () => void;
}

export interface WorkerRefreshOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface WorkspaceSearchWorkerClientOptions {
  /** Test seam; production uses the compiled sibling worker module. */
  workerUrl?: URL;
}

export class WorkspaceSearchWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private disposed = false;
  private regions = 0;
  private method: RetrievalMethod = 'bm25';

  constructor(options: WorkspaceSearchWorkerClientOptions = {}) {
    this.worker = new Worker(options.workerUrl ?? new URL('./workspaceSearchWorkerThread.js', import.meta.url));
    this.worker.on('message', (message: WorkerMessage) => this.onMessage(message));
    this.worker.on('error', (error) => this.failAll(error));
    this.worker.on('exit', (code) => {
      if (!this.disposed) this.failAll(new Error(`MMI table-search worker exited unexpectedly with code ${code}.`));
    });
  }

  get regionCount(): number {
    return this.regions;
  }

  get retrievalMethod(): RetrievalMethod {
    return this.method;
  }

  async refresh(paths: readonly string[], options: WorkerRefreshOptions = {}): Promise<RefreshResult> {
    if (options.signal?.aborted) {
      return {
        updated: [],
        unchanged: [],
        failed: [],
        cancelled: true,
        capped: false,
        regions: this.regions,
        method: this.method,
      };
    }

    const id = this.nextId++;
    const result = await new Promise<RefreshResult>((resolve, reject) => {
      const onAbort = (): void => this.worker.postMessage({ kind: 'cancel', requestId: id });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve,
        reject,
        onProgress: options.onProgress,
        cleanup: () => options.signal?.removeEventListener('abort', onAbort),
      });
      this.worker.postMessage({ kind: 'refresh', id, paths: [...paths] });
    });

    this.regions = result.regions;
    this.method = result.method;
    return result;
  }

  query(text: string, markdownFilePath: string, maxCandidates = 5): Promise<CompileResult> {
    const id = this.nextId++;
    return new Promise<CompileResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ kind: 'query', id, text, markdownFilePath, maxCandidates });
    });
  }

  /**
   * Terminates the worker, dropping the in-memory index and workbook cache.
   * A later search creates a fresh worker through searchFlow.indexFor().
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error('MMI table-search worker was disposed.'));
    void this.worker.terminate();
  }

  private onMessage(message: WorkerMessage): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;

    if (message.kind === 'progress') {
      pending.onProgress?.(message.done, message.total);
      return;
    }

    this.pending.delete(message.id);
    pending.cleanup?.();

    if (message.kind === 'error') {
      pending.reject(new Error(message.message));
      return;
    }
    pending.resolve(message.value);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup?.();
      pending.reject(error);
    }
    this.pending.clear();
  }
}
