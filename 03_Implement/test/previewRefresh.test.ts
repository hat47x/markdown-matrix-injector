import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkbookSaveEvent, PreviewRefresher } from '../src/dx/previewRefresh.js';

function fixture(texts: string[]) {
  const timers: { callback: () => void; delayMs: number; cleared: boolean }[] = [];
  let refreshed = 0;
  const refresher = new PreviewRefresher({
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => { (handle as { cleared: boolean }).cleared = true; },
    refreshPreview: async () => { refreshed += 1; },
    openMarkdownTexts: () => texts,
  });
  const fire = () => timers.filter((t) => !t.cleared).forEach((t) => t.callback());
  return { refresher, timers, fire, count: () => refreshed };
}

test('Excel lock files and temp names are not saves', () => {
  for (const name of ['D:/ws/~$設計.xlsx', ['C:', 'ws', '~$設計.xlsx'].join(String.fromCharCode(92)), 'D:/ws/.~lock.設計.xlsx#', 'D:/ws/設計.xlsx.tmp']) assert.equal(isWorkbookSaveEvent(name), false, name);
  assert.equal(isWorkbookSaveEvent('D:/ws/設計.xlsx'), true);
});

test('a saved workbook named in an open document refreshes once after a burst', () => {
  const f = fixture(['![[./data/設計.xlsx#画面|A1:B2]]']);
  f.refresher.workbookChanged('D:/ws/data/設計.xlsx');
  f.refresher.workbookChanged('D:/ws/data/設計.xlsx');
  f.refresher.workbookChanged('D:/ws/data/設計.xlsx');
  assert.equal(f.timers.filter((t) => !t.cleared).length, 1, 'bursts collapse into one pending refresh');
  assert.equal(f.timers[0].delayMs, 600);
  f.fire();
  assert.equal(f.count(), 1);
  assert.equal(f.refresher.refreshes, 1);
});

test('a workbook no open document names, a lock file, or a deleted book that is named behave as stated', () => {
  const f = fixture(['![[./設計.xlsx#画面|A1:B2]]']);
  f.refresher.workbookChanged('D:/ws/別の.xlsx');
  f.refresher.workbookChanged('D:/ws/~$設計.xlsx');
  assert.equal(f.timers.length, 0);
  f.refresher.workbookChanged('D:/ws/設計.XLSX'); // delete/create events carry the path too, matched ignoring case
  assert.equal(f.timers.length, 1);
});

test('a failing refresh command (no preview open) is swallowed', async () => {
  const refresher = new PreviewRefresher({
    setTimer: (cb) => { cb(); return 1; },
    clearTimer: () => undefined,
    refreshPreview: () => Promise.reject(new Error('no preview')),
    openMarkdownTexts: () => ['設計.xlsx'],
  });
  refresher.workbookChanged('設計.xlsx');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refresher.refreshes, 1);
});
