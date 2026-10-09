import { readSourceFileIdentity } from '../core/sourceIdentity.js';

/**
 * Content identity used to guard a user confirmation against source changes.
 * mtime/size are intentionally insufficient: Excel saves can replace bytes
 * without a reliably distinguishable timestamp on coarse filesystems.
 */
export function sourceContentStamp(
  absolutePath: string | undefined,
): string {
  if (!absolutePath) return 'unavailable';
  try {
    return readSourceFileIdentity(absolutePath).digest;
  } catch {
    return 'missing';
  }
}
