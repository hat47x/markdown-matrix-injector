import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import {
  imageCandidates,
  readExcelImages,
  shapeCandidates,
} from '../src/adapters/excelImageAdapter.js';
import { tableCandidates } from '../src/adapters/tableRegionAdapter.js';
import { fingerprintOf } from '../src/core/candidate.js';
import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import {
  candidateIdentityOf,
  createAiHandoffPackage,
  type AiHandoffPackageV1,
  type HandoffProvenanceView,
} from '../src/dx/aiHandoff.js';
import {
  AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA,
  AI_HANDOFF_TRANSFORMATION_VALIDATION_SCHEMA,
  validateAiHandoffTransformationProposal,
} from '../src/dx/aiHandoffTransformationValidation.js';
import {
  buildXlsxWithImages,
  screenDesignWorkbook,
} from './helpers/buildXlsxWithImages.js';

function tableFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-ai-transform-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs);
  fs.mkdirSync(data);
  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'release.csv');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, 'ID,State\n1,ready\n');

  const source = '../data/release.csv';
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const workbook = loadWorkbook({ absolutePath: sourcePath });
  const candidate = tableCandidates({
    source,
    sourceDigest,
    sheetName: 'Sheet1',
    sheet: workbook.sheets.Sheet1,
  })[0];
  assert.ok(candidate);

  return {
    root,
    markdownFilePath,
    sourcePath,
    candidate,
    identity: candidateIdentityOf(candidate),
    handoff: createAiHandoffPackage({
      task: 'このCandidateを成果物へ進める案をレビューする',
      candidates: [candidate],
    }),
  };
}

function proposal(
  identity: ReturnType<typeof candidateIdentityOf>,
  targetState: 'linked' | 'extracted',
) {
  return {
    schema: AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA,
    candidate: identity,
    targetState,
    rationale: '提示されたCandidateを既存MMI経路で利用する',
    unresolved: [],
  };
}

function check(
  result: Awaited<
    ReturnType<typeof validateAiHandoffTransformationProposal>
  >,
  name: string,
) {
  return result.checks.find((item) => item.check === name);
}

test('linked transformation uses only the current local Candidate reference and revalidates it', async () => {
  const f = tableFixture();
  const result = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: proposal(f.identity, 'linked'),
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(
    result.schema,
    AI_HANDOFF_TRANSFORMATION_VALIDATION_SCHEMA,
  );
  assert.equal(result.status, 'accepted-for-review');
  assert.deepEqual(result.plan, {
    operation: 'link-existing-reference',
    candidate: f.identity,
    notation: f.candidate.reference,
  });
  assert.equal(
    result.notationValidation?.status,
    'accepted',
  );
  assert.equal(
    check(result, 'authority-revalidation')?.code,
    'TRANSFORMATION_LINK_AUTHORITY_REVALIDATED',
  );
});

test('table extraction proposal returns a local review plan without choosing an output path', async () => {
  const f = tableFixture();
  const before = fs.readdirSync(f.root).sort();
  const result = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: proposal(f.identity, 'extracted'),
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'accepted-for-review');
  assert.deepEqual(result.plan, {
    operation: 'extract-standard-asset',
    candidate: f.identity,
    candidateKind: 'table-range',
    conversion: 'gfm-table-v1',
  });
  assert.equal('outputPath' in (result.plan ?? {}), false);
  assert.deepEqual(fs.readdirSync(f.root).sort(), before);
});

test('image extraction proposal is rederived from the current XLSX package', async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-ai-transform-image-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs);
  fs.mkdirSync(data);
  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'design.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  const workbook = screenDesignWorkbook();
  fs.writeFileSync(sourcePath, workbook.bytes);

  const source = '../data/design.xlsx';
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const read = readExcelImages(workbook.bytes);
  const candidate = imageCandidates({
    source,
    sourceDigest,
    images: read.images,
  })[0];
  assert.ok(candidate);
  const identity = candidateIdentityOf(candidate);
  const handoff = createAiHandoffPackage({
    task: '画像CandidateのExtracted案をレビューする',
    candidates: [candidate],
  });

  const result = await validateAiHandoffTransformationProposal({
    handoff,
    proposal: proposal(identity, 'extracted'),
    markdownFilePath,
    workspaceRoot: root,
  });

  assert.equal(result.status, 'accepted-for-review');
  assert.deepEqual(result.plan, {
    operation: 'extract-standard-asset',
    candidate: identity,
    candidateKind: 'image',
    conversion: 'raw-image-bytes-v1',
  });
});

test('shape transformation is revalidated then blocked as unsupported instead of pretending the Candidate disappeared', async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-ai-transform-shape-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs);
  fs.mkdirSync(data);
  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'flow.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="4" name="承認"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="diamond"/></xdr:spPr><xdr:txBody><a:p><a:r><a:t>承認</a:t></a:r></a:p></xdr:txBody></xdr:sp>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  const bytes = buildXlsxWithImages(
    [{ name: 'Flow', rawDrawing: drawing }],
    {},
  );
  fs.writeFileSync(sourcePath, bytes);

  const source = '../data/flow.xlsx';
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const read = readExcelImages(bytes);
  const candidate = shapeCandidates({
    source,
    sourceDigest,
    shapes: read.shapes,
  })[0];
  assert.ok(candidate);
  const identity = candidateIdentityOf(candidate);
  const handoff = createAiHandoffPackage({
    task: 'Shape Candidateの利用案をレビューする',
    candidates: [candidate],
  });

  const result = await validateAiHandoffTransformationProposal({
    handoff,
    proposal: proposal(identity, 'extracted'),
    markdownFilePath,
    workspaceRoot: root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'current-candidate')?.code,
    'TRANSFORMATION_CURRENT_CANDIDATE_REDISCOVERED',
  );
  assert.equal(
    check(result, 'transformation-contract')?.code,
    'TRANSFORMATION_CANDIDATE_KIND_UNSUPPORTED',
  );
  assert.match(
    check(result, 'transformation-contract')?.detail ?? '',
    /Candidate kind shape/u,
  );
  assert.equal(
    check(result, 'authority-revalidation')?.status,
    'not-run',
  );
  assert.equal(result.plan, undefined);
});

test('fabricated Candidate identity is blocked before source or transform checks', async () => {
  const f = tableFixture();
  const fabricated = {
    ...f.identity,
    digest: fingerprintOf('fabricated', 'candidate').digest,
  };
  const result = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: proposal(fabricated, 'extracted'),
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'candidate-allowlist')?.code,
    'TRANSFORMATION_CANDIDATE_NOT_IN_HANDOFF',
  );
  assert.equal(check(result, 'source-identity')?.status, 'not-run');
});

test('changed source bytes invalidate a transformation proposal made from an older handoff', async () => {
  const f = tableFixture();
  fs.appendFileSync(f.sourcePath, '2,changed\n');

  const result = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: proposal(f.identity, 'extracted'),
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'source-identity')?.code,
    'TRANSFORMATION_SOURCE_DIGEST_MISMATCH',
  );
  assert.equal(check(result, 'current-candidate')?.status, 'not-run');
});

test('changed Candidate provenance requires a new handoff even when occurrence and content identity match', async () => {
  const f = tableFixture();
  const tampered = JSON.parse(
    JSON.stringify(f.handoff),
  ) as AiHandoffPackageV1;
  const alter = (value: {
    candidateIdentity: { digest: string };
    provenance: HandoffProvenanceView;
  }) => {
    if (
      value.candidateIdentity.digest === f.identity.digest
      && value.provenance.run.execution === 'deterministic'
    ) {
      value.provenance.run.implementationVersion = 'older-adapter';
    }
  };
  tampered.confirmedFacts.forEach(alter);
  tampered.inferredCandidates.forEach(alter);
  tampered.unresolvedIssues.forEach((item) => {
    if (item.kind === 'abstained-claim') alter(item);
  });

  const result = await validateAiHandoffTransformationProposal({
    handoff: tampered,
    proposal: proposal(f.identity, 'extracted'),
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'current-candidate')?.code,
    'TRANSFORMATION_CANDIDATE_PROVENANCE_CHANGED',
  );
});

test('proposal schema rejects external command/output-path fields instead of ignoring them', async () => {
  const f = tableFixture();
  for (const extra of [
    { command: 'rm -rf /' },
    { outputPath: '../../outside.md' },
    { conversion: 'arbitrary-provider-transform' },
  ]) {
    const result = await validateAiHandoffTransformationProposal({
      handoff: f.handoff,
      proposal: {
        ...proposal(f.identity, 'extracted'),
        ...extra,
      },
      markdownFilePath: f.markdownFilePath,
      workspaceRoot: f.root,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(
      check(result, 'proposal-schema')?.code,
      'TRANSFORMATION_PROPOSAL_SCHEMA_INVALID',
    );
    assert.equal(check(result, 'candidate-allowlist')?.status, 'not-run');
  }
});

test('proposal receipt digest binds nested identity and rationale content', async () => {
  const f = tableFixture();
  const base = proposal(f.identity, 'extracted');
  const first = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: base,
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });
  const second = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: {
      ...base,
      rationale: '別の理由',
    },
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });
  const third = await validateAiHandoffTransformationProposal({
    handoff: f.handoff,
    proposal: {
      ...base,
      unresolved: ['人が最終確認する'],
    },
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.notEqual(first.proposalDigest, second.proposalDigest);
  assert.notEqual(first.proposalDigest, third.proposalDigest);
});


async function captureMain(argv: string[]): Promise<{ code: number; output: string }> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return { code: await main(argv), output: written.join('') };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('CLI validate-transformation returns only a review plan and never writes assets', async () => {
  const f = tableFixture();
  const handoffPath = path.join(f.root, 'handoff.json');
  const proposalPath = path.join(f.root, 'transformation.json');
  fs.writeFileSync(handoffPath, JSON.stringify(f.handoff, null, 2));
  fs.writeFileSync(proposalPath, JSON.stringify(
    proposal(f.identity, 'extracted'),
    null,
    2,
  ));
  const before = listFiles(f.root);

  const accepted = await captureMain([
    'validate-transformation',
    proposalPath,
    '--package',
    handoffPath,
    '--document',
    f.markdownFilePath,
    '--root',
    f.root,
    '--json',
  ]);

  assert.equal(accepted.code, 0);
  const receipt = JSON.parse(accepted.output);
  assert.equal(receipt.status, 'accepted-for-review');
  assert.equal(receipt.plan.operation, 'extract-standard-asset');
  assert.equal(receipt.plan.conversion, 'gfm-table-v1');
  assert.deepEqual(listFiles(f.root), before);
});

test('CLI validate-transformation blocks stale source proposals and boundary escapes', async () => {
  const f = tableFixture();
  const handoffPath = path.join(f.root, 'handoff.json');
  const proposalPath = path.join(f.root, 'transformation.json');
  fs.writeFileSync(handoffPath, JSON.stringify(f.handoff));
  fs.writeFileSync(proposalPath, JSON.stringify(proposal(f.identity, 'extracted')));
  fs.appendFileSync(f.sourcePath, '2,changed\n');

  const blocked = await captureMain([
    'validate-transformation',
    proposalPath,
    '--package',
    handoffPath,
    '--document',
    f.markdownFilePath,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(blocked.code, 1);
  assert.equal(JSON.parse(blocked.output).status, 'blocked');

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-transform-outside-'));
  const outsideProposal = path.join(outside, 'transformation.json');
  fs.writeFileSync(outsideProposal, JSON.stringify(proposal(f.identity, 'extracted')));
  assert.equal((await captureMain([
    'validate-transformation',
    outsideProposal,
    '--package',
    handoffPath,
    '--document',
    f.markdownFilePath,
    '--root',
    f.root,
  ])).code, 2);
});

function listFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else out.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  visit(root);
  return out.sort();
}
