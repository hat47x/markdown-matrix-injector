import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createWorkbookRefreshBatchScheduler,
  markdownReferencesWorkbook,
  type WorkbookRefreshClock,
} from '../src/dx/previewRefresh.js';

test('preview refresh matches a document-relative workbook reference', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[../data/design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});

test('preview refresh also honors workspace-root-relative MMI references', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-root');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[data/design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});

test('preview refresh ignores unrelated workbook saves and external references', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-other');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      [
        '![[../data/other.xlsx#Sheet1|A1:B4]]',
        '![[https://example.test/design.xlsx#Sheet1|A1:B4]]',
      ].join('\n'),
      markdown,
      workbook,
      root,
    ),
    false,
  );
});

test('preview refresh decodes local URL-escaped workbook paths', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-space');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'screen design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[../data/screen%20design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});


class FakeRefreshClock implements WorkbookRefreshClock {
  private nextId = 1;
  readonly callbacks = new Map<number, () => void>();
  readonly cleared: number[] = [];

  setTimeout(callback: () => void, _delayMs: number): unknown {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(handle: unknown): void {
    const id = Number(handle);
    this.cleared.push(id);
    this.callbacks.delete(id);
  }

  fireLatest(): void {
    const latest = [...this.callbacks.entries()].at(-1);
    if (!latest) throw new Error('no scheduled refresh');
    this.callbacks.delete(latest[0]);
    latest[1]();
  }
}

test('preview refresh scheduler coalesces save bursts but keeps every changed workbook', () => {
  const clock = new FakeRefreshClock();
  const batches: string[][] = [];
  const scheduler = createWorkbookRefreshBatchScheduler({
    flush: (paths) => { batches.push([...paths]); },
    clock,
  });

  scheduler.schedule('/tmp/project/a.xlsx');
  scheduler.schedule('/tmp/project/a.xlsx');
  scheduler.schedule('/tmp/project/b.xlsx');

  assert.equal(clock.callbacks.size, 1);
  assert.equal(clock.cleared.length, 2);

  clock.fireLatest();

  assert.equal(batches.length, 1);
  assert.deepEqual(
    [...batches[0]].sort(),
    // The scheduler compares paths case-insensitively on Windows, so it reports them lower-cased there.
    [path.resolve('/tmp/project/a.xlsx'), path.resolve('/tmp/project/b.xlsx')]
      .map((file) => (process.platform === 'win32' ? file.toLocaleLowerCase('en-US') : file))
      .sort(),
  );
});

test('disposed preview refresh scheduler discards pending workbook events', () => {
  const clock = new FakeRefreshClock();
  let flushes = 0;
  const scheduler = createWorkbookRefreshBatchScheduler({
    flush: () => { flushes += 1; },
    clock,
  });

  scheduler.schedule('/tmp/project/a.xlsx');
  scheduler.dispose();

  assert.equal(clock.callbacks.size, 0);
  scheduler.schedule('/tmp/project/b.xlsx');
  assert.equal(clock.callbacks.size, 0);
  assert.equal(flushes, 0);
});

test('preview refresh scheduler reports asynchronous refresh failures', async () => {
  const clock = new FakeRefreshClock();
  const errors: unknown[] = [];
  const scheduler = createWorkbookRefreshBatchScheduler({
    flush: async () => { throw new Error('refresh failed'); },
    onError: (error) => errors.push(error),
    clock,
  });

  scheduler.schedule('/tmp/project/a.xlsx');
  clock.fireLatest();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /refresh failed/u);
});
