import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  resolveSourcePath,
  type ResolveSourcePathOptions,
} from './pathResolver.js';

export const SOURCE_IDENTITY_ALGORITHM = 'sha256' as const;
export const SOURCE_IDENTITY_REPRESENTATION =
  'source-file-bytes-v1' as const;

export interface SourceIdentityV1 {
  algorithm: typeof SOURCE_IDENTITY_ALGORITHM;
  representation: typeof SOURCE_IDENTITY_REPRESENTATION;
  digest: string;
  byteLength: number;
}

export interface ResolvedSourceIdentityV1 {
  resolvedPath: string;
  identity: SourceIdentityV1;
}

export function createSourceIdentityFromBytes(
  bytes: Uint8Array,
): SourceIdentityV1 {
  const digest = createHash(SOURCE_IDENTITY_ALGORITHM)
    .update(bytes)
    .digest('hex');

  return {
    algorithm: SOURCE_IDENTITY_ALGORITHM,
    representation: SOURCE_IDENTITY_REPRESENTATION,
    digest: `${SOURCE_IDENTITY_ALGORITHM}:${digest}`,
    byteLength: bytes.byteLength,
  };
}

export function readSourceFileIdentity(
  absolutePath: string,
): SourceIdentityV1 {
  return createSourceIdentityFromBytes(
    fs.readFileSync(absolutePath),
  );
}

export const SOURCE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export type ExpectedSourceDigestCheck =
  | { ok: true; actual: string }
  | { ok: false; actual: string; message: string };

/**
 * Compares the digest of the file's bytes with the digest the caller saw earlier
 * (`inspect`'s `locator.sourceDigest`). A malformed expected value throws; a
 * different digest is returned as a mismatch so each caller can report it in its own shape.
 */
export function checkExpectedSourceDigest(absolutePath: string, expected: string): ExpectedSourceDigestCheck {
  if (!SOURCE_DIGEST_PATTERN.test(expected)) {
    throw new Error('expected source digest must be a SHA-256 Source Identity digest (sha256:<64 hex>)');
  }
  const actual = readSourceFileIdentity(absolutePath).digest;
  return actual === expected
    ? { ok: true, actual }
    : { ok: false, actual, message: `source digest mismatch: expected ${expected} but the source is ${actual}; run inspect again and use the current digest` };
}

export function resolveContainedSourceIdentity(
  options: ResolveSourcePathOptions,
): ResolvedSourceIdentityV1 {
  const resolvedPath = resolveSourcePath(options);
  return {
    resolvedPath,
    identity: readSourceFileIdentity(resolvedPath),
  };
}
