import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { inspectSource, main } from '../src/cli/mmi.js';
import { extractXmlTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xml-tree-'));
  const source = path.join(root, 'service.xml');
  const markdown = path.join(root, 'design.md');
  const outDir = path.join(root, 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(
    source,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<service id="billing">',
      '  <name>Billing &amp; Payments</name>',
      '  <endpoint method="POST">/pay</endpoint>',
      '  <endpoint method="POST"><![CDATA[/refund?x=1&y=2]]></endpoint>',
      '  <meta><owner>platform</owner></meta>',
      '</service>',
    ].join('\n'),
  );
  fs.writeFileSync(markdown, '# Design\n');
  return { root, source, markdown, outDir, ledgerPath };
}

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

test('inspect exposes generic XML hierarchy as observed deterministic Tree Candidates', () => {
  const f = workspace();
  const result = inspectSource(f.source, 0);

  assert.deepEqual(result.sheets, []);
  assert.deepEqual(result.images, []);
  assert.deepEqual(
    result.trees?.map((tree) => [tree.format, tree.pointer]),
    [
      ['xml', '/service[1]'],
      ['xml', '/service[1]/name[1]'],
      ['xml', '/service[1]/endpoint[1]'],
      ['xml', '/service[1]/endpoint[2]'],
      ['xml', '/service[1]/meta[1]'],
      ['xml', '/service[1]/meta[1]/owner[1]'],
    ],
  );

  const root = result.candidates.find(
    (candidate) =>
      candidate.locator.structuralPath === '/service[1]',
  );
  assert.ok(root);
  assert.equal(root.kind, 'tree');
  assert.equal(root.status, 'observed');
  assert.equal(root.execution, 'deterministic');
  assert.equal(root.method, 'M0');
  assert.deepEqual(
    root.claims.find((claim) => claim.aspect === 'attributes')?.value,
    ['@id="billing"'],
  );
});

test('generic XML Tree supports Unicode names and rejects DTD-dependent parsing', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    '<?xml version="1.0" encoding="UTF-8"?><設定 環境="本番"><項目>値</項目></設定>',
  );
  const result = inspectSource(f.source, 0);
  assert.deepEqual(
    result.trees?.map((tree) => tree.pointer),
    ['/設定[1]', '/設定[1]/項目[1]'],
  );
  assert.deepEqual(
    result.candidates[0].claims.find(
      (claim) => claim.aspect === 'attributes',
    )?.value,
    ['@環境="本番"'],
  );

  fs.writeFileSync(
    f.source,
    '<!DOCTYPE service [<!ENTITY x "value">]><service>&x;</service>',
  );
  assert.throws(
    () => inspectSource(f.source, 0),
    /DTD\/declaration syntax is not supported/u,
  );
});

test('extractXmlTree preserves attributes and text in nested Markdown and ledger provenance', () => {
  const f = workspace();
  const result = extractXmlTree({
    sourcePath: f.source,
    pointer: '/service[1]/endpoint[2]',
    outDir: f.outDir,
    fromDocument: f.markdown,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(result.extracted.markdown, /^- \\<endpoint\\>/u);
  assert.match(result.extracted.markdown, /- @method: "POST"/u);
  assert.match(result.extracted.markdown, /- #text: "\\/refund\\?x=1&y=2"/u);
  assert.match(
    result.extracted.markdown,
    /path="\/service\[1\]\/endpoint\[2\]".*projection="xml-nested-list-v1"/u,
  );

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(
    ledger.entries[0].place,
    'path:/service[1]/endpoint[2]',
  );
  assert.equal(ledger.entries[0].conversion.mode, 'xml-nested-list-v1');
});

test('review-bound XML Tree extraction fails only when the reviewed subtree changes', () => {
  const f = workspace();
  const reviewed = inspectSource(f.source, 0).candidates.find(
    (candidate) =>
      candidate.locator.structuralPath === '/service[1]/endpoint[1]',
  );
  assert.ok(reviewed);

  const unrelated = fs.readFileSync(f.source, 'utf8')
    .replace('<owner>platform</owner>', '<owner>core-platform</owner>');
  fs.writeFileSync(f.source, unrelated);

  const accepted = extractXmlTree({
    sourcePath: f.source,
    pointer: '/service[1]/endpoint[1]',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.deepEqual(accepted.problems, []);
  assert.ok(accepted.extracted);

  fs.rmSync(f.outDir, { recursive: true, force: true });
  fs.rmSync(f.ledgerPath, { force: true });
  fs.writeFileSync(
    f.source,
    unrelated.replace('>/pay</endpoint>', '>/pay-v2</endpoint>'),
  );

  const stale = extractXmlTree({
    sourcePath: f.source,
    pointer: '/service[1]/endpoint[1]',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.equal(stale.extracted, undefined);
  assert.deepEqual(
    stale.problems.map((problem) => problem.code),
    ['MMI_TREE_CANDIDATE_CHANGED'],
  );
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(fs.existsSync(f.ledgerPath), false);
});

test('adopted XML Tree participates in detach freshness checks', () => {
  const f = workspace();
  const result = extractXmlTree({
    sourcePath: f.source,
    pointer: '/service[1]/endpoint[1]',
    outDir: f.outDir,
    fromDocument: f.markdown,
    ledgerPath: f.ledgerPath,
  });
  assert.ok(result.extracted);
  fs.writeFileSync(
    f.markdown,
    '# Design\n\n' + result.extracted.markdown + '\n',
  );

  const fresh = checkExtractedProvenanceFreshness({
    markdownFilePath: f.markdown,
    workspaceRoot: f.root,
    ledgerPath: f.ledgerPath,
  });
  assert.equal(fresh.errors, 0);
  assert.equal(fresh.checked, 1);

  fs.writeFileSync(
    f.source,
    fs.readFileSync(f.source, 'utf8')
      .replace('>/pay</endpoint>', '>/pay-v2</endpoint>'),
  );
  const stale = checkExtractedProvenanceFreshness({
    markdownFilePath: f.markdown,
    workspaceRoot: f.root,
    ledgerPath: f.ledgerPath,
  });
  assert.equal(stale.errors, 1);
  assert.equal(
    stale.problems[0]?.code,
    'MMI_DETACH_EXTRACTED_STALE',
  );
});

test('CLI inspect/extract supports XML paths while XML Spreadsheet 2003 stays on the table route', async () => {
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
  assert.equal(payload.candidateContract, 'mmi.semantic-candidate/v1');
  assert.equal(
    payload.candidates.some(
      (candidate: any) =>
        candidate.kind === 'tree'
        && candidate.locator.structuralPath
          === '/service[1]/endpoint[1]',
    ),
    true,
  );

  const extracted = await captureMain([
    'extract',
    f.source,
    '--tree',
    '/service[1]/endpoint[1]',
    '--out-dir',
    f.outDir,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  assert.equal(
    JSON.parse(extracted.output).extracted.pointer,
    '/service[1]/endpoint[1]',
  );

  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const spreadsheet = path.resolve(
    testDir,
    '../../04_Documentation/samples/practical/data/migration.xml',
  );
  const spreadsheetResult = inspectSource(spreadsheet, 0);
  assert.equal(spreadsheetResult.trees, undefined);
  assert.ok(spreadsheetResult.sheets.length > 0);
  assert.equal(
    spreadsheetResult.candidates.some(
      (candidate) => candidate.kind === 'tree',
    ),
    false,
  );
});


test('generic XML Tree enforces namespace well-formedness instead of accepting prefix-shaped text', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    '<p:service><p:name>billing</p:name></p:service>',
  );
  assert.throws(
    () => inspectSource(f.source, 0),
    /unbound namespace prefix/u,
  );

  fs.writeFileSync(
    f.source,
    '<service xmlns:a="urn:test" xmlns:b="urn:test" a:id="1" b:id="2"/>',
  );
  assert.throws(
    () => inspectSource(f.source, 0),
    /duplicate attribute/u,
  );
});

test('generic XML Tree preserves qualified namespaces and mixed content', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svc:service xmlns:svc="urn:service" svc:id="billing">',
      'before<svc:name>Billing &amp; Payments</svc:name><![CDATA[after<raw>]]>',
      '</svc:service>',
    ].join(''),
  );

  const inspected = inspectSource(f.source, 0);
  assert.deepEqual(
    inspected.trees?.map((tree) => tree.pointer),
    [
      '/svc:service[1]',
      '/svc:service[1]/svc:name[1]',
    ],
  );
  const root = inspected.candidates[0];
  assert.deepEqual(
    root.claims.find((claim) => claim.aspect === 'text')?.value,
    ['before', 'after<raw>'],
  );
  const attributes = root.claims.find(
    (claim) => claim.aspect === 'attributes',
  )?.value;
  assert.ok(Array.isArray(attributes));
  assert.ok(attributes.includes('@svc:id="billing"'));
  assert.ok(attributes.includes('@xmlns:svc="urn:service"'));
});

test('generic XML Tree rejects invalid character references and non-UTF-8 declarations', () => {
  const f = workspace();
  fs.writeFileSync(f.source, '<service>&#0;</service>');
  assert.throws(
    () => inspectSource(f.source, 0),
    /character|entity|XML/u,
  );

  fs.writeFileSync(
    f.source,
    '<?xml version="1.0" encoding="Shift_JIS"?><service/>',
  );
  assert.throws(
    () => inspectSource(f.source, 0),
    /must declare UTF-8/u,
  );
});

test('generic XML Tree rejects byte sequences that are not valid UTF-8', () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    Buffer.from([
      0x3c, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x3e,
      0x80,
      0x3c, 0x2f, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x3e,
    ]),
  );
  assert.throws(
    () => inspectSource(f.source, 0),
    /valid UTF-8/u,
  );
});
