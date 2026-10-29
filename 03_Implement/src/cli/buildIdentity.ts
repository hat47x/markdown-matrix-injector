import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const BUILD_IDENTITY_SCHEMA = 'mmi.build-identity/v1';
export const BUILD_IDENTITY_FILE = 'build-identity.json';

export type BuildDistribution = 'tarball' | 'checkout' | 'unknown';

export interface BuildIdentity {
  schema: typeof BUILD_IDENTITY_SCHEMA;
  /** package.json の version。コミットごとには上がらない。 */
  version: string;
  /** ビルド元のコミットSHA（40桁）。確かめられないときはnull。 */
  commit: string | null;
  /** package-lock.json の生バイト列のsha256（`sha256:<hex>`）。確かめられないときはnull。 */
  lockfileDigest: string | null;
  /**
   * ビルド元に未コミットの変更（追跡対象外のファイルを含む。`git status --porcelain` が空でない）があるか。
   * 取れないとき（gitがない・時間切れ・古いtarball）はnullで、推測でfalseにしない。
   */
  dirty: boolean | null;
  /** この応答を返しているNode.jsの版。 */
  node: { version: string; major: number };
  /** tarball: 配布tarball（作成時に埋め込み）、checkout: 開発用チェックアウト。 */
  distribution: BuildDistribution;
}

interface EmbeddedIdentity {
  commit: string | null;
  lockfileDigest: string | null;
  dirty: boolean | null;
}

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function sha256Digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readEmbedded(packageRoot: URL): EmbeddedIdentity | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(new URL(BUILD_IDENTITY_FILE, packageRoot), 'utf8'),
    ) as Record<string, unknown>;
    if (parsed.schema !== BUILD_IDENTITY_SCHEMA) return null;
    return {
      commit: typeof parsed.commit === 'string' && COMMIT_PATTERN.test(parsed.commit)
        ? parsed.commit
        : null,
      lockfileDigest:
        typeof parsed.lockfileDigest === 'string' && DIGEST_PATTERN.test(parsed.lockfileDigest)
          ? parsed.lockfileDigest
          : null,
      dirty: typeof parsed.dirty === 'boolean' ? parsed.dirty : null,
    };
  } catch {
    return null;
  }
}

function gitHead(cwd: URL): string | null {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      // rev-parse は索引を書かないが、念のため任意ロックも使わせない。
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    const head = result.status === 0 ? result.stdout.trim() : '';
    return COMMIT_PATTERN.test(head) ? head : null;
  } catch {
    return null;
  }
}

/**
 * 作業ツリーに未コミットの変更があるかを返す。追跡対象外のファイルも数える
 * （release-candidate.mjs の `git status --porcelain` と同じ基準）。
 * gitが使えない・失敗・時間切れのときはnull。
 */
export function gitDirty(cwd: URL | string): boolean | null {
  try {
    const result = spawnSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      // statusが索引を更新しないよう、任意ロックを使わせない。
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    if (result.status !== 0 || result.error) return null;
    return result.stdout.trim().length > 0;
  } catch {
    return null;
  }
}

function lockDigestOf(packageRoot: URL): string | null {
  try {
    return sha256Digest(fs.readFileSync(new URL('package-lock.json', packageRoot)));
  } catch {
    return null;
  }
}

function locatePackageRoot(): URL | null {
  for (const candidate of [
    new URL('../../', import.meta.url),
    new URL('../../../', import.meta.url),
  ]) {
    if (fs.existsSync(new URL('package.json', candidate))) return candidate;
  }
  return null;
}

let cached: Omit<BuildIdentity, 'version' | 'node'> | undefined;

/**
 * このプロセスが応答しているビルドの識別を返す。
 * 配布tarballでは作成時に埋め込んだ build-identity.json を読み、
 * 開発用チェックアウトではgitのHEADとpackage-lock.jsonから求める。
 * チェックアウトのコミットは、未コミットの変更を反映しない。`dirty` がその有無を示す。
 */
export function readBuildIdentity(version: string): BuildIdentity {
  if (!cached) {
    const root = locatePackageRoot();
    const embedded = root ? readEmbedded(root) : null;
    if (embedded) {
      cached = { schema: BUILD_IDENTITY_SCHEMA, ...embedded, distribution: 'tarball' };
    } else if (root && fs.existsSync(new URL('tsconfig.json', root))) {
      cached = {
        schema: BUILD_IDENTITY_SCHEMA,
        commit: gitHead(root),
        lockfileDigest: lockDigestOf(root),
        dirty: gitDirty(root),
        distribution: 'checkout',
      };
    } else {
      cached = {
        schema: BUILD_IDENTITY_SCHEMA,
        commit: null,
        lockfileDigest: null,
        dirty: null,
        distribution: 'unknown',
      };
    }
  }
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  return {
    schema: cached.schema,
    version,
    commit: cached.commit,
    lockfileDigest: cached.lockfileDigest,
    dirty: cached.dirty,
    node: { version: process.version, major },
    distribution: cached.distribution,
  };
}
