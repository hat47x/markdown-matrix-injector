import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDetachedDocument, markdownLinkTargets } from '../src/application/detachCheck.js';

const FULLWIDTH_COLON = '\uFF1A';

/**
 * Oracle: the link-target helper as it stood on origin/main, copied verbatim
 * from 03_Implement/src/application/detachCheck.ts at commit b9fe717.
 * Lines without the three ported special cases must produce exactly this output.
 */
function originMarkdownLinkTargets(line: string): string[] {
  const targets: string[] = [];
  const pattern = /!?\[[^\]]*\]\((?<target>[^)]+)\)/gu;
  for (const match of line.matchAll(pattern)) {
    const raw = match.groups?.target?.trim();
    if (!raw) continue;
    // A destination may be followed by a Markdown title. Paths containing
    // spaces should normally be percent encoded; preserve <...> destinations.
    const target = raw.startsWith('<') && raw.includes('>')
      ? raw.slice(1, raw.indexOf('>'))
      : raw.split(/\s+["']/u, 1)[0];
    targets.push(target);
  }
  return targets;
}

function checkDocument(content: string): { code: string; line: number }[] {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-links-'));
  try {
    const doc = path.join(root, 'spec.md');
    fs.writeFileSync(doc, content);
    return checkDetachedDocument({ markdownFilePath: doc, workspaceRoot: root })
      .problems.map((problem) => ({ code: problem.code, line: problem.line }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('(a) link-like text inside an inline code span is not a link', () => {
  assert.deepEqual(markdownLinkTargets('see `[x](missing.md)` here'), []);
  assert.deepEqual(markdownLinkTargets('`a [b](c.md)` and [d](e.md)'), ['e.md']);
  assert.deepEqual(markdownLinkTargets('[`code`](present.md)'), ['present.md']);
  assert.deepEqual(markdownLinkTargets('``x `[y](z.md)` w``'), []);
  assert.deepEqual(markdownLinkTargets('[a]`x`(b.md)'), []);

  assert.deepEqual(checkDocument('説明 `[x](missing.md)` 以上\n'), []);
});

test('(b) the legacy 別紙 card accepts the full-width colon, and the whitespace rule is unchanged', () => {
  assert.deepEqual(
    checkDocument(`> 別紙${FULLWIDTH_COLON} old.xlsx\n`),
    [{ code: 'MMI_DETACH_LEGACY_CARD', line: 1 }],
  );
  assert.deepEqual(
    checkDocument('> 別紙: old.xlsx\n'),
    [{ code: 'MMI_DETACH_LEGACY_CARD', line: 1 }],
  );
  // Whitespace before the colon is not part of the card and stays unrecognised.
  assert.deepEqual(checkDocument('> 別紙 : old.xlsx\n'), []);
  assert.deepEqual(checkDocument(`> 別紙 ${FULLWIDTH_COLON} old.xlsx\n`), []);
});

test('(c) the legacy 別紙 card is recognised when nested in blockquotes', () => {
  assert.deepEqual(
    checkDocument('> > 別紙: old.xlsx\n'),
    [{ code: 'MMI_DETACH_LEGACY_CARD', line: 1 }],
  );
  assert.deepEqual(
    checkDocument(`>>別紙${FULLWIDTH_COLON} old.xlsx\n`),
    [{ code: 'MMI_DETACH_LEGACY_CARD', line: 1 }],
  );
  assert.deepEqual(
    checkDocument(`intro\n\n> > > 別紙${FULLWIDTH_COLON} old.xlsx\n`),
    [{ code: 'MMI_DETACH_LEGACY_CARD', line: 3 }],
  );
});

test('(d) lines without the ported special cases return exactly origin/main output', () => {
  const lines = [
    'See [spec](spec.md) and [data](../data/wide.csv).',
    'plain text without links',
    '![image](images/fig.png)',
    '[a](b.md)[c](d.md)',
    '[empty]()',
    '[anchor](#section)',
    '[remote](https://example.com/x)',
    '[a](  spaced.md  )',
    // Unencoded spaces in destinations, with and without titles.
    '[a](my doc.md)',
    '[a](my doc.md "Title")',
    "[a](my doc.md 'Title')",
    '[a](<my doc.md>)',
    '[a](<my doc.md> "Title")',
    '[a](b.md\ttitle)',
    // Parentheses inside destinations (balanced parentheses are not ported).
    '[a](pic (1).png)',
    '[a](foo(bar).md)',
    // Backslashes (backslash escapes are not ported).
    '[a](C:\\docs\\spec.md)',
    '[a](dir\\file.md)',
    '[a](esc\\(x\\).md)',
    // Reference definitions (not ported).
    '[id]: ./spec.md "Title"',
    '[id]: ./spec.md',
    'see [ref][id] here',
    // Autolinks (not ported).
    'Autolink <https://example.com/spec.md> here',
    'mail <mailto:someone@example.com>',
    // HTML attributes (not ported).
    '<a href="spec.md">spec</a>',
    "<img src='fig.png' alt=\"x\">",
    '<img srcset="a.png 1x, b.png 2x">',
  ];
  for (const line of lines) {
    assert.deepEqual(markdownLinkTargets(line), originMarkdownLinkTargets(line), line);
  }
  // Guard against a vacuous equivalence: the oracle does find destinations on these lines.
  assert.deepEqual(originMarkdownLinkTargets('[a](my doc.md)'), ['my doc.md']);
  assert.deepEqual(originMarkdownLinkTargets('[a](pic (1).png)'), ['pic (1']);
  assert.deepEqual(originMarkdownLinkTargets('[a](<my doc.md>)'), ['my doc.md']);
});
