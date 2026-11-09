import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SECURITY.md「Read-only MUST（参照経路）」の静的な裏付け。
// 参照経路のディレクトリでファイルへ書き込むAPIを呼べるモジュールを、許可一覧に固定する。
// 動的な呼出し（fs[name]）や子プロセス経由の書込みは検出しない。

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const readOnlyDirs = ['core', 'plugin', 'cache', 'parser', 'adapters', 'navigate'];
const allowedWriters = new Set([
  'core/importLedger.ts',
  'core/candidateReviewDecisions.ts',
  'core/cognitiveArtifact.ts',
]);
const WRITE_API =
  /\b(?:writeFileSync|writeFile|createWriteStream|appendFileSync|appendFile|mkdirSync|mkdir|mkdtempSync|unlinkSync|unlink|renameSync|rename|rmSync|rmdirSync|rm|copyFileSync|copyFile|truncateSync|symlinkSync|linkSync|chmodSync|utimesSync|writeSync)\s*\(/u;

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

test('参照経路のディレクトリで書込みAPIを呼ぶモジュールは許可一覧の3ファイルだけである', () => {
  const writers = new Set<string>();
  for (const dir of readOnlyDirs) {
    const base = path.join(srcRoot, dir);
    if (!fs.existsSync(base)) continue;
    for (const file of listTs(base)) {
      const rel = path.relative(srcRoot, file).split(path.sep).join('/');
      if (WRITE_API.test(stripComments(fs.readFileSync(file, 'utf8')))) writers.add(rel);
    }
  }
  assert.deepEqual([...writers].sort(), [...allowedWriters].sort());
});

test('書込みAPIの検出が働いている（許可一覧のモジュールを検出できる）', () => {
  const text = stripComments(fs.readFileSync(path.join(srcRoot, 'core/importLedger.ts'), 'utf8'));
  assert.equal(WRITE_API.test(text), true);
});
