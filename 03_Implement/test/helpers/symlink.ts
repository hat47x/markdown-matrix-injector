import fs from 'node:fs';
import type { TestContext } from 'node:test';

/**
 * Creates a symlink, or skips the test when the OS refuses to.
 * Windows without Developer Mode or elevation rejects file symlinks with EPERM;
 * that is an environment limit, not a product failure.
 */
export function symlinkOrSkip(
  t: TestContext,
  target: string,
  linkPath: string,
  type?: 'file' | 'dir' | 'junction',
): boolean {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      t.skip('symlink creation is not permitted in this environment');
      return false;
    }
    throw error;
  }
}
