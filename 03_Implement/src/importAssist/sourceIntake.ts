/**
 * Safe intake of a legacy source file into an MMI project boundary.
 *
 * Linked MMI references may only resolve files within their trust boundary.
 * When a legacy workbook lives elsewhere, copy its exact bytes into the
 * project first instead of weakening reference containment.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';

export interface SourceIntakeResult {
  sourcePath: string;
  created: boolean;
}

/**
 * Containment check for paths that may not exist yet. The nearest existing
 * ancestor is canonicalized first, preventing symlink/junction escape.
 */
export function pathWithinBoundaryForWrite(
  target: string,
  boundary: string,
): boolean {
  return isPathWithinBoundary(
    canonicalPathForContainment(target),
    canonicalPathForContainment(boundary),
  );
}

/**
 * Copy one existing source file byte-for-byte to an explicit project path.
 *
 * - The extension is preserved so downstream source adapters do not change.
 * - Existing equal bytes are reused.
 * - Existing different bytes are never overwritten.
 * - The source is re-read after the copy; if it changed during intake, the
 *   newly-created destination is removed and the caller must retry.
 */
export function intakeSourceFile(
  inputSourcePath: string,
  destinationPath: string,
): SourceIntakeResult {
  const input = path.resolve(inputSourcePath);
  const destination = path.resolve(destinationPath);
  if (input === destination) return { sourcePath: input, created: false };

  if (!fs.existsSync(input) || !fs.statSync(input).isFile()) {
    throw new Error(`source file does not exist: ${input}`);
  }

  const inputExtension = path.extname(input).toLowerCase();
  const destinationExtension = path.extname(destination).toLowerCase();
  if (!inputExtension || destinationExtension !== inputExtension) {
    throw new Error(
      `source intake must keep the source extension ${inputExtension || '(none)'}`,
    );
  }

  const sourceBytes = fs.readFileSync(input);
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isFile()) {
      throw new Error(`source intake destination is not a file: ${destination}`);
    }
    const existing = fs.readFileSync(destination);
    if (!existing.equals(sourceBytes)) {
      throw new Error(
        `source intake destination already exists with different content: ${destination}`,
      );
    }
    return { sourcePath: destination, created: false };
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, sourceBytes, { flag: 'wx' });

  const sourceAfterCopy = fs.readFileSync(input);
  if (!sourceAfterCopy.equals(sourceBytes)) {
    fs.rmSync(destination, { force: true });
    throw new Error(
      'source changed while being copied into the workspace; run the import again',
    );
  }
  return { sourcePath: destination, created: true };
}

function canonicalPathForContainment(target: string): string {
  const absolute = path.resolve(target);
  let existing = absolute;
  const suffix: string[] = [];

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }

  try {
    return path.join(fs.realpathSync(existing), ...suffix);
  } catch {
    return absolute;
  }
}
