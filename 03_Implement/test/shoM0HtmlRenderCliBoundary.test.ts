/**
 * M0-G1a: run the REAL MMI CLI HTML render path with the separately pinned SHO
 * RI-L0-01/02 Markdown fixtures. This is a product-CLI boundary test, NOT
 * a SHO Reader/Editor end-to-end test, network proof or an E2 byte receipt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const implementationRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/shoM0/', import.meta.url));
const expected: Record<string, { sha256: string; hrefs: string[] }> = {
  'RI-L0-01.md': {
    sha256: '8868469affb2844f03759b0ea4714dcd1b923342b9aa93f1faa2b3805106548a',
    hrefs: ['a', 'b', 'a', 'c', 'd'].map((x) => 'https://example.org/' + x),
  },
  'RI-L0-02.md': {
    sha256: '62000b4509ea42ec6f760adefabc4206ebe0217e57fb89700183d539867811c0',
    hrefs: ['md', 'angle', 'html'].map((x) => 'https://example.org/' + x),
  },
};

function digest(x: Buffer | string): string {
  return createHash('sha256').update(x).digest('hex');
}

function hrefsFromHtml(html: string): string[] {
  const result: string[] = [];
  // This is a deliberately narrow, synthetic-example URL check, not a DOM parser
  // or a claim that every rendered hyperlink/resource has been enumerated.
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)) {
    const href = match[1] ?? match[2];
    if (href?.startsWith('https://example.org/')) result.push(href);
  }
  return result;
}

function runMmiCli(raw: Buffer, filename: string): { hrefs: string[]; htmlHash: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-sho-g1a-'));
  const doc = path.join(root, filename);
  try {
    fs.writeFileSync(doc, raw, { flag: 'wx' });
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', 'src/cli/mmi.ts',
      'render', doc, '--to', 'html', '--root', root,
    ], {
      cwd: implementationRoot, shell: false, windowsHide: true,
      encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, String(result.stderr).slice(0, 2000));
    assert.equal(result.signal, null, 'CLI must exit normally');
    assert.deepEqual(fs.readFileSync(doc), raw, 'input Markdown must not be rewritten');
    assert.deepEqual(fs.readdirSync(root), [filename], 'render should not create extra workspace files');
    return { hrefs: hrefsFromHtml(result.stdout), htmlHash: digest(result.stdout) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

for (const filename of Object.keys(expected)) {
  test('G1a real MMI render of SHO ' + filename + ' keeps the declared syntax scope', () => {
    const raw = fs.readFileSync(path.join(fixtureDir, filename));
    assert.equal(digest(raw), expected[filename].sha256, 'cross-repository fixture bytes must be pinned');
    const rendered = runMmiCli(raw, filename);
    assert.deepEqual(rendered.hrefs, expected[filename].hrefs,
      'real MMI HTML anchors differ from independently fixed expected example links');
    assert.equal(rendered.htmlHash.length, 64);
  });
}

test('G1a real MMI renderer notices a changed reference definition despite unchanged link count', () => {
  const filename = 'RI-L0-01.md';
  const raw = fs.readFileSync(path.join(fixtureDir, filename));
  assert.equal(digest(raw), expected[filename].sha256);
  const changed = Buffer.from(raw.toString('utf8').replace(
    '[paper-b]: https://example.org/b "補足文献"',
    '[paper-b]: https://example.org/changed "補足文献"',
  ), 'utf8');
  assert.notEqual(digest(changed), digest(raw));
  const a = runMmiCli(raw, 'before.md');
  const b = runMmiCli(changed, 'after.md');
  assert.equal(a.hrefs.length, b.hrefs.length);
  assert.deepEqual(b.hrefs, ['a', 'changed', 'a', 'c', 'd'].map((x) => 'https://example.org/' + x));
  assert.notDeepEqual(a.hrefs, b.hrefs, 'reference definition updates must invalidate effective hrefs');
});
