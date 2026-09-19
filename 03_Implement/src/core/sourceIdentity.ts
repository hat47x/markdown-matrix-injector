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

export function resolveContainedSourceIdentity(
  options: ResolveSourcePathOptions,
): ResolvedSourceIdentityV1 {
  const resolvedPath = resolveSourcePath(options);
  return {
    resolvedPath,
    identity: readSourceFileIdentity(resolvedPath),
  };
}
