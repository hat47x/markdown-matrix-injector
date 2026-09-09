import fs from 'node:fs/promises';
import path from 'node:path';
import { isPathWithinBoundary } from './pathResolver.js';

export async function validateOpenSourcePath(source: unknown, roots: string[]): Promise<string> {
  if (typeof source !== 'string' || !path.isAbsolute(source) || !/\.(xlsx?|csv|tsv|xml)$/i.test(source)) {
    throw new Error('ワークスペース内の表データを指定してください。');
  }
  const realSource = await fs.realpath(source);
  const realRoots = await Promise.all(roots.map(root => fs.realpath(root)));
  if (!realRoots.some(root => isPathWithinBoundary(realSource, root)) || !(await fs.stat(realSource)).isFile()) {
    throw new Error('ワークスペース外のファイルは開けません。');
  }
  return realSource;
}
