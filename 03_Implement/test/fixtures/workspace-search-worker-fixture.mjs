import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('fixture requires worker thread');

const cancelled = new Set();

parentPort.on('message', (message) => {
  if (message.kind === 'cancel') {
    cancelled.add(message.requestId);
    return;
  }

  if (message.kind === 'refresh') {
    parentPort.postMessage({ kind: 'progress', id: message.id, done: 1, total: Math.max(1, message.paths.length) });
    const finish = () => parentPort.postMessage({
      kind: 'result',
      id: message.id,
      op: 'refresh',
      value: {
        updated: cancelled.has(message.id) ? [] : [...message.paths],
        unchanged: [],
        failed: [],
        cancelled: cancelled.has(message.id),
        capped: false,
        regions: cancelled.has(message.id) ? 0 : message.paths.length,
        method: 'bm25',
      },
    });
    if (message.paths.includes('wait')) setTimeout(finish, 25);
    else finish();
    return;
  }

  if (message.kind === 'query') {
    const finish = () => parentPort.postMessage({
      kind: 'result',
      id: message.id,
      op: 'query',
      value: {
        status: 'no-match',
        candidates: [],
        reasons: message.text === 'cancel-state'
          ? [`cancelled:${cancelled.size}`]
          : [message.text],
        requiresSelection: true,
      },
    });
    if (message.text === 'wait-query') setTimeout(finish, 25);
    else finish();
  }
});
