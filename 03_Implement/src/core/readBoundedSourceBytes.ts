import fs from 'node:fs';

/** Bounded byte observation; uses O_NOFOLLOW where available. Callers enforce containment. */
export function readBoundedSourceBytes(file: string, maxBytes: number): Buffer {
  if (!fs.lstatSync(file).isFile()) throw new Error('not-regular-file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('not-regular-file');
    if (stat.size > maxBytes) throw new Error('size-limit');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length !== stat.size || fs.fstatSync(fd).mtimeMs !== stat.mtimeMs) throw new Error('source-changed');
    return buffer.subarray(0, length);
  } finally { fs.closeSync(fd); }
}

