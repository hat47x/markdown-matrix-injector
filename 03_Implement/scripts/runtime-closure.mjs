// package-lock.jsonから、runtime依存（dependencies）の閉包を導く。
// CLI配布tarballの同梱物一覧と、THIRD_PARTY_NOTICES.mdの照合に使う。
import fs from 'node:fs';

function resolveInstalled(packages, from, name) {
  let base = from;
  for (;;) {
    const key = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (packages[key]) return key;
    if (!base) return undefined;
    const index = base.lastIndexOf('/node_modules/');
    base = index < 0 ? '' : base.slice(0, index);
  }
}

/**
 * @param {{packages: Record<string, any>}} lock package-lock.json（lockfileVersion 2/3）の内容
 * @returns {{name: string, version: string, license: string, path: string}[]}
 *   path順に整列した、runtime依存の閉包。同名で版が違うものは別項目になる。
 */
export function collectRuntimeClosure(lock) {
  const packages = lock.packages ?? {};
  const root = packages[''];
  if (!root) throw new Error('package-lock.json has no root package entry.');
  const seen = new Map();
  const pending = [{ from: '', deps: root.dependencies ?? {} }];
  while (pending.length > 0) {
    const { from, deps } = pending.pop();
    for (const name of Object.keys(deps)) {
      const key = resolveInstalled(packages, from, name);
      if (!key) throw new Error(`Runtime dependency is not in the lock: ${name}`);
      if (seen.has(key)) continue;
      const entry = packages[key];
      seen.set(key, {
        name,
        version: entry.version,
        license: typeof entry.license === 'string' ? entry.license : 'UNKNOWN',
        path: key,
      });
      pending.push({ from: key, deps: entry.dependencies ?? {} });
    }
  }
  return [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function readRuntimeClosure(lockPath) {
  return collectRuntimeClosure(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
}

/**
 * THIRD_PARTY_NOTICES.mdの「同梱するruntime依存」表から、`name | version | license`を読む。
 * 表の行は `| name | version | license |` の形で、nameは同名別版を区別するため
 * 配置の説明（括弧内）を含めない。
 */
export function parseNoticeClosure(markdown) {
  const rows = [];
  let inTable = false;
  for (const line of markdown.split(/\r?\n/u)) {
    if (/^<!-- runtime-closure:begin -->/u.test(line)) { inTable = true; continue; }
    if (/^<!-- runtime-closure:end -->/u.test(line)) break;
    if (!inTable) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4 || cells[0] === 'package' || /^-+$/u.test(cells[0])) continue;
    rows.push({ name: cells[0], version: cells[1], license: cells[2], path: cells[3] });
  }
  return rows;
}
