import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, inspectSource } from '../src/cli/mmi.js';
import { extractXmlTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xml-tree-'));
  const source = path.join(root, 'service.xml');
  const outDir = path.join(root, 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(
    source,
    `<?xml version="1.0" encoding="UTF-8"?>
<catalog version="1">
  <service id="billing">
    <endpoint method="POST">/pay</endpoint>
    <endpoint method="POST"><![CDATA[/refund?mode=fast]]></endpoint>
  </service>
  <enabled>true</enabled>
</catalog>`,
  );
  return { root, source, outDir, ledgerPath };
}

const digest = (file: string): string =>
  'sha256:' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function captureMain(
  argv: string[],
): Promise<{ code: number; output: string; error: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  const error = console.error;
  process.stdout.write = ((chunk: string) => (
    output.push(String(chunk)), true
  )) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: output.join(''),
      error: errors.join('\n'),
    };
  } finally {
    process.stdout.write = write;
    console.error = error;
  }
}

test('inspect exposes generic XML hierarchy as observed Tree Candidates', () => {
  const f = workspace();
  const result = inspectSource(f.source, 0);

  assert.deepEqual(result.sheets, []);
  assert.deepEqual(result.images, []);
  assert.deepEqual(
    result.trees?.map((tree) => [
      tree.format,
      tree.structuralPath,
      tree.nodeType,
    ]),
    [
      ['xml', '/catalog[1]', 'element'],
      ['xml', '/catalog[1]/service[1]', 'element'],
      ['xml', '/catalog[1]/service[1]/endpoint[1]', 'element'],
      ['xml', '/catalog[1]/service[1]/endpoint[2]', 'element'],
      ['xml', '/catalog[1]/enabled[1]', 'element'],
    ],
  );
  assert.equal(
    result.candidates.every(
      (candidate) =>
        candidate.kind === 'tree'
        && candidate.status === 'observed'
        && candidate.execution === 'deterministic'
        && candidate.method === 'M0',
    ),
    true,
  );
  assert.deepEqual(result.trees?.[0].leafValues, ['@version="1"']);
  assert.deepEqual(
    result.trees?.[2].leafValues,
    ['@method="POST"', '#text[1]="/pay"'],
  );
});

test('extractXmlTree projects one explicit subtree and records the shared ledger', () => {
  const f = workspace();
  const sourceBefore = digest(f.source);
  const result = extractXmlTree({
    sourcePath: f.source,
    structuralPath: '/catalog[1]/service[1]',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.equal(result.extracted.format, 'xml');
  assert.equal(
    result.extracted.structuralPath,
    '/catalog[1]/service[1]',
  );
  assert.equal(digest(result.extracted.file), result.extracted.digest);
  assert.equal(result.extracted.markdown.includes('- \\<service\\>'), true);
  assert.match(result.extracted.markdown, /- @id: "billing"/u);
  assert.equal(result.extracted.markdown.includes('- \\<endpoint\\>'), true);
  assert.match(result.extracted.markdown, /- #text: "\/pay"/u);
  assert.match(
    result.extracted.markdown,
    /projection="xml-nested-list-v1" -->$/u,
  );
  assert.equal(digest(f.source), sourceBefore);

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(
    ledger.entries[0].place,
    'path:/catalog[1]/service[1]',
  );
  assert.equal(ledger.entries[0].reviewState, 'accepted');
  assert.equal(
    ledger.entries[0].conversion.mode,
    'xml-nested-list-v1',
  );
  assert.equal(
    ledger.entries[0].conversion.structuralPath,
    '/catalog[1]/service[1]',
  );
});

test('CLI inspect and extract accept XML structural paths and root', async () => {
  const f = workspace();

  const inspected = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(inspected.code, 0);
  const payload = JSON.parse(inspected.output);
  assert.equal(
    payload.candidates.some(
      (candidate: any) =>
        candidate.kind === 'tree'
        && candidate.locator.structuralPath
          === '/catalog[1]/service[1]',
    ),
    true,
  );
  assert.equal(
    payload.trees.some(
      (tree: any) =>
        tree.format === 'xml'
        && tree.structuralPath === '/catalog[1]/service[1]',
    ),
    true,
  );

  const extracted = await captureMain([
    'extract',
    f.source,
    '--tree',
    '/catalog[1]/service[1]',
    '--out-dir',
    f.outDir,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  assert.equal(
    JSON.parse(extracted.output).extracted.structuralPath,
    '/catalog[1]/service[1]',
  );

  const rootOut = path.join(f.root, 'root-assets');
  const root = await captureMain([
    'extract',
    f.source,
    '--tree',
    'root',
    '--out-dir',
    rootOut,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(root.code, 0);
  assert.equal(
    JSON.parse(root.output).extracted.structuralPath,
    '/catalog[1]',
  );

  const missing = await captureMain([
    'extract',
    f.source,
    '--tree',
    '/catalog[1]/missing[1]',
    '--out-dir',
    f.outDir,
    '--root',
    f.root,
  ]);
  assert.equal(missing.code, 1);
  assert.match(missing.error, /MMI_TREE_CANDIDATE_NOT_FOUND/u);
});

test('XML Spreadsheet 2003 stays on the table path instead of generic Tree extraction', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Table><Row><Cell><Data ss:Type="String">A</Data></Cell></Row></Table>
  </Worksheet>
</Workbook>`,
  );

  const result = extractXmlTree({
    sourcePath: f.source,
    structuralPath: 'root',
    outDir: f.outDir,
  });
  assert.equal(result.extracted, undefined);
  assert.deepEqual(
    result.problems.map((problem) => problem.code),
    ['MMI_TREE_XML_SPREADSHEET'],
  );

  const inspected = inspectSource(f.source, 0);
  assert.equal(inspected.trees, undefined);
  assert.equal(inspected.sheets.length, 1);
  assert.equal(
    inspected.candidates.some((candidate) => candidate.kind === 'tree'),
    false,
  );
});


test('XML Tree projection escapes Markdown-significant element/text content', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    '<root note="*literal*"><item><![CDATA[<b>*not markup*</b>]]></item></root>',
  );

  const result = extractXmlTree({
    sourcePath: f.source,
    structuralPath: '/root[1]',
    outDir: f.outDir,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.equal(result.extracted.markdown.includes('- \\<root\\>'), true);
  assert.equal(
    result.extracted.markdown.includes('- @note: "\\*literal\\*"'),
    true,
  );
  assert.equal(
    result.extracted.markdown.includes(
      '- #text: "\\<b\\>\\*not markup\\*\\</b\\>"',
    ),
    true,
  );
});

test('review-bound XML extraction rejects a changed subtree Candidate', () => {
  const f = workspace();
  const reviewed = inspectSource(f.source, 0).candidates.find(
    (candidate) =>
      candidate.kind === 'tree'
      && candidate.locator.structuralPath === '/catalog[1]/service[1]',
  );
  assert.ok(reviewed);

  fs.writeFileSync(
    f.source,
    '<catalog version="1"><service id="billing-v2"><endpoint method="POST">/pay</endpoint></service></catalog>',
  );

  const result = extractXmlTree({
    sourcePath: f.source,
    structuralPath: '/catalog[1]/service[1]',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });

  assert.equal(result.extracted, undefined);
  assert.deepEqual(
    result.problems.map((problem) => problem.code),
    ['MMI_TREE_CANDIDATE_CHANGED'],
  );
  assert.equal(fs.existsSync(f.ledgerPath), false);
});
