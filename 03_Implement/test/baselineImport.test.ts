import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runBaselineImport,
  type BaselineConverter,
  type CandidateReconciler,
} from '../src/core/baselineImport.js';
import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { classify, readLedger } from '../src/core/importLedger.js';
import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';

function sha256(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function candidate(
  sourceDigest: string,
  kind: 'table-range' | 'image',
  range: string,
  content: string,
): Candidate {
  const fingerprint = fingerprintOf(
    kind === 'image' ? 'image-media-bytes-v1' : 'table-logical-grid-v1',
    content,
  );
  return {
    kind,
    locator: {
      source: './source.xlsx',
      sourceDigest,
      sheet: 'Sheet1',
      range,
    },
    status: kind === 'image' ? 'observed' : 'inferred',
    execution: 'deterministic',
    method: kind === 'image' ? 'M0' : 'M1',
    claims: [{
      aspect: 'digest',
      value: fingerprint.digest,
      status: kind === 'image' ? 'observed' : 'inferred',
      execution: 'deterministic',
      method: kind === 'image' ? 'M0' : 'M1',
      reasonCode: 'fixture',
    }],
    provenance: {
      algorithm: 'fixture',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion: '1',
      },
    },
    fingerprint,
    scores: [],
  };
}

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-bulk-import-'));
  const sourcePath = path.join(root, 'source.xlsx');
  const outputRoot = path.join(root, 'converted');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, 'source-v1');
  fs.mkdirSync(outputRoot);
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const candidates = [
    candidate(sourceDigest, 'table-range', 'A1:C4', 'table-a'),
    candidate(sourceDigest, 'image', 'E2:G8', 'image-a'),
  ] as const;
  return { root, sourcePath, outputRoot, ledgerPath, sourceDigest, candidates };
}

test('only explicitly reconciled converter artifacts become imported', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1.2.3' },
    async convert({ outputRoot: root }) {
      const markdownPath = path.join(root, 'document.md');
      const imagePath = path.join(root, 'assets', 'screen.png');
      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      fs.writeFileSync(markdownPath, '# converted\n');
      fs.writeFileSync(imagePath, 'image-bytes');
      return {
        artifacts: [
          {
            id: 'document',
            kind: 'markdown',
            relativePath: 'document.md',
            contentDigest: sha256(fs.readFileSync(markdownPath)),
            mediaType: 'text/markdown',
          },
          {
            id: 'screen',
            kind: 'asset',
            relativePath: 'assets/screen.png',
            contentDigest: sha256(fs.readFileSync(imagePath)),
            mediaType: 'image/png',
          },
        ],
      };
    },
  };

  const reconciler: CandidateReconciler = {
    async reconcile() {
      return [
        {
          candidateIndex: 0,
          status: 'unmatched',
          evidence: [{ code: 'converter-table-not-source-addressable' }],
        },
        {
          candidateIndex: 1,
          status: 'matched',
          artifactId: 'screen',
          evidence: [{ code: 'same-image-bytes' }],
        },
      ];
    },
  };

  const result = await runBaselineImport({
    sourcePath,
    outputRoot,
    ledgerPath,
    candidates,
    converter,
    reconciler,
    mmiVersion: '0.1.0-test',
    conversionOptions: { mode: 'fixture' },
  });

  assert.equal(result.ledgerEntries.length, 1);
  assert.equal(result.ledgerEntries[0].kind, 'image');
  assert.equal(result.ledgerEntries[0].conversion.converterId, 'fixture.converter');
  assert.equal(result.ledgerEntries[0].conversion.converterVersion, '1.2.3');
  assert.equal(result.ledgerEntries[0].conversion.artifactId, 'screen');
  assert.equal(result.ledgerEntries[0].conversion.mmiVersion, '0.1.0-test');
  assert.match(
    String(result.ledgerEntries[0].conversion.reconciliationEvidence),
    /same-image-bytes/u,
  );

  const ledger = readLedger(ledgerPath);
  assert.equal(classify(ledger, ledgerPath, sourcePath, candidates[0]), 'unimported');
  assert.equal(classify(ledger, ledgerPath, sourcePath, candidates[1]), 'imported');
});

test('ambiguous converter output never becomes imported', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  const output = path.join(outputRoot, 'document.md');
  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      fs.writeFileSync(output, '# ambiguous\n');
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'document.md',
          contentDigest: sha256(fs.readFileSync(output)),
        }],
      };
    },
  };
  const reconciler: CandidateReconciler = {
    async reconcile() {
      return candidates.map((_, candidateIndex) => ({
        candidateIndex,
        status: 'ambiguous' as const,
        evidence: [{ code: 'multiple-possible-regions' }],
      }));
    },
  };

  const result = await runBaselineImport({
    sourcePath,
    outputRoot,
    ledgerPath,
    candidates,
    converter,
    reconciler,
    mmiVersion: '0.1.0-test',
  });

  assert.equal(result.ledgerEntries.length, 0);
  assert.equal(fs.existsSync(ledgerPath), false);
});

test('missing Candidate decisions fail closed before ledger write', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  const output = path.join(outputRoot, 'document.md');
  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      fs.writeFileSync(output, '# partial\n');
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'document.md',
          contentDigest: sha256(fs.readFileSync(output)),
        }],
      };
    },
  };
  const reconciler: CandidateReconciler = {
    async reconcile() {
      return [{
        candidateIndex: 0,
        status: 'unmatched',
        evidence: [{ code: 'explicit-no-match' }],
      }];
    },
  };

  await assert.rejects(
    runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates,
      converter,
      reconciler,
      mmiVersion: '0.1.0-test',
    }),
    /must decide every Candidate exactly once/u,
  );
  assert.equal(fs.existsSync(ledgerPath), false);
});

test('artifact digest mismatch and path escape are rejected before reconciliation can import', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();

  const badDigest: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert({ outputRoot: root }) {
      fs.writeFileSync(path.join(root, 'document.md'), '# changed\n');
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'document.md',
          contentDigest: sha256('different-bytes'),
        }],
      };
    },
  };
  const never: CandidateReconciler = {
    async reconcile() {
      throw new Error('reconciler must not run');
    },
  };
  await assert.rejects(
    runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates,
      converter: badDigest,
      reconciler: never,
      mmiVersion: '0.1.0-test',
    }),
    /contentDigest does not match output bytes/u,
  );

  const escaped = path.join(path.dirname(outputRoot), 'escape.md');
  fs.writeFileSync(escaped, '# escape\n');
  const pathEscape: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      return {
        artifacts: [{
          id: 'escape',
          kind: 'markdown',
          relativePath: '../escape.md',
          contentDigest: sha256(fs.readFileSync(escaped)),
        }],
      };
    },
  };
  await assert.rejects(
    runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates,
      converter: pathEscape,
      reconciler: never,
      mmiVersion: '0.1.0-test',
    }),
    /escapes outputRoot/u,
  );
  assert.equal(fs.existsSync(ledgerPath), false);
});

test('stale Candidate source digests are rejected before converter execution', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  let called = false;
  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      called = true;
      return { artifacts: [] };
    },
  };
  const stale: Candidate = {
    ...candidates[0],
    locator: {
      ...candidates[0].locator,
      sourceDigest: fingerprintOf('source-bytes-v1', 'older-source').digest,
    },
    provenance: {
      ...candidates[0].provenance,
      run: {
        ...candidates[0].provenance.run,
        inputDigest: fingerprintOf('source-bytes-v1', 'older-source').digest,
      },
    },
  };

  await assert.rejects(
    runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates: [stale],
      converter,
      reconciler: { async reconcile() { return []; } },
      mmiVersion: '0.1.0-test',
    }),
    /sourceDigest does not match current source bytes/u,
  );
  assert.equal(called, false);
  assert.equal(fs.existsSync(ledgerPath), false);
});


test('caller conversion options cannot spoof reserved provenance fields', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  const output = path.join(outputRoot, 'screen.png');
  const converter: BaselineConverter = {
    descriptor: { id: 'trusted.converter', version: '2.0' },
    async convert() {
      fs.writeFileSync(output, 'image');
      return {
        artifacts: [{
          id: 'screen',
          kind: 'asset',
          relativePath: 'screen.png',
          contentDigest: sha256(fs.readFileSync(output)),
        }],
      };
    },
  };

  const result = await runBaselineImport({
    sourcePath,
    outputRoot,
    ledgerPath,
    candidates: [candidates[1]],
    converter,
    reconciler: {
      async reconcile() {
        return [{
          candidateIndex: 0,
          status: 'matched',
          artifactId: 'screen',
          evidence: [{ code: 'same-image-bytes' }],
        }];
      },
    },
    mmiVersion: '0.1.0-test',
    conversionOptions: {
      converterId: 'spoofed',
      converterVersion: 'spoofed',
      mmiVersion: 'spoofed',
      artifactId: 'spoofed',
      artifactDigest: 'spoofed',
      reconciliationEvidence: 'spoofed',
      userOption: 'kept',
    },
  });

  assert.deepEqual(
    {
      converterId: result.ledgerEntries[0].conversion.converterId,
      converterVersion: result.ledgerEntries[0].conversion.converterVersion,
      mmiVersion: result.ledgerEntries[0].conversion.mmiVersion,
      artifactId: result.ledgerEntries[0].conversion.artifactId,
      userOption: result.ledgerEntries[0].conversion.userOption,
    },
    {
      converterId: 'trusted.converter',
      converterVersion: '2.0',
      mmiVersion: '0.1.0-test',
      artifactId: 'screen',
      userOption: 'kept',
    },
  );
  assert.notEqual(result.ledgerEntries[0].conversion.artifactDigest, 'spoofed');
  assert.notEqual(result.ledgerEntries[0].conversion.reconciliationEvidence, 'spoofed');
});

test('portable artifact paths reject Windows absolute and backslash traversal syntax', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  const outside = path.join(path.dirname(outputRoot), 'outside.md');
  fs.writeFileSync(outside, '# outside\n');

  const run = async (relativePath: string) => {
    const converter: BaselineConverter = {
      descriptor: { id: 'fixture.converter', version: '1' },
      async convert() {
        return {
          artifacts: [{
            id: 'document',
            kind: 'markdown',
            relativePath,
            contentDigest: sha256(fs.readFileSync(outside)),
          }],
        };
      },
    };
    return runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates,
      converter,
      reconciler: { async reconcile() { throw new Error('must not run'); } },
      mmiVersion: '0.1.0-test',
    });
  };

  await assert.rejects(run('C:\\temp\\outside.md'), /must be relative/u);
  await assert.rejects(run('..\\outside.md'), /escapes outputRoot/u);
  assert.equal(fs.existsSync(ledgerPath), false);
});

test('malformed converter output fails before reconciliation and ledger mutation', async () => {
  const { sourcePath, outputRoot, ledgerPath, candidates } = workspace();
  let reconciled = false;
  const converter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      return {} as any;
    },
  } satisfies BaselineConverter;

  await assert.rejects(
    runBaselineImport({
      sourcePath,
      outputRoot,
      ledgerPath,
      candidates,
      converter,
      reconciler: {
        async reconcile() {
          reconciled = true;
          return [];
        },
      },
      mmiVersion: '0.1.0-test',
    }),
    /artifacts array/u,
  );

  assert.equal(reconciled, false);
  assert.equal(fs.existsSync(ledgerPath), false);
});
