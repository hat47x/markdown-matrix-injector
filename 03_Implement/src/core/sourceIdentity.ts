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
  assertExpectedSourceDigestFormat(expected);
  return checkExpectedSourceDigestOfBytes(fs.readFileSync(absolutePath), expected);
}

/** Throws when the caller's expected digest is not a SHA-256 Source Identity digest. */
export function assertExpectedSourceDigestFormat(expected: string): void {
  if (!SOURCE_DIGEST_PATTERN.test(expected)) {
    throw new Error('expected source digest must be a SHA-256 Source Identity digest (sha256:<64 hex>)');
  }
}

/**
 * Same comparison as `checkExpectedSourceDigest`, on bytes the caller already read.
 * Parsing the same bytes keeps the digest and the values it vouches for from two different reads (#744).
 */
export function checkExpectedSourceDigestOfBytes(bytes: Uint8Array, expected: string): ExpectedSourceDigestCheck {
  assertExpectedSourceDigestFormat(expected);
  const actual = createSourceIdentityFromBytes(bytes).digest;
  return actual === expected
    ? { ok: true, actual }
    : { ok: false, actual, message: `source digest mismatch: expected ${expected} but the source is ${actual}; run inspect again and use the current digest` };
}

/** Throws SourceDigestMismatchError unless the bytes the caller already read have the expected digest. */
export function assertSourceBytesDigest(bytes: Uint8Array, expected: string | undefined): void {
  if (expected === undefined) return;
  const check = checkExpectedSourceDigestOfBytes(bytes, expected);
  if (!check.ok) throw new SourceDigestMismatchError(check.message, check.actual);
}

/** A pinned `expectedSourceDigest` did not match the bytes that were read. */
export class SourceDigestMismatchError extends Error {
  constructor(message: string, readonly actual: string) {
    super(message);
    this.name = 'SourceDigestMismatchError';
  }
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
