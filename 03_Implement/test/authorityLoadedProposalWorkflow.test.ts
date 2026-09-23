import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import type { CognitiveObservation } from '../src/experimental/cognitiveContract.js';
import {
  bindExecutableProposalAuthorityEvidence,
} from '../src/experimental/executableProposalAuthorityEvidence.js';
import {
  runExecutableProposalAuthorityRevalidation,
} from '../src/experimental/authorityRevalidationAdapter.js';
import {
  runExecutableProposalAuthorityEvidenceWithDefaultLoader,
  runExecutableProposalAuthorityEvidenceWithLoader,
} from '../src/experimental/authorityLoadedProposalWorkflow.js';
import {
  createCognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
} from '../src/experimental/formatProfile.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const TABLE_PROPOSAL =
  '![[../data/release.csv#Sheet1|A1:B2?header=first&mode=table]]';
const CARD_PROPOSAL =
  '![[../data/release.csv?mode=card]]';

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function snapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 2, column: 0, text: '1' },
      { row: 2, column: 1, text: 'ready' },
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }],
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-loader-port-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  fs.writeFileSync(markdownFilePath, '# Spec\n');

  const sourcePath = path.join(data, 'release.csv');
  const bytes = Buffer.from('ID,State\n1,ready\n', 'utf8');
  fs.writeFileSync(sourcePath, bytes);
  const sourceDigest = sha256(bytes);

  const rawPrototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Workbook loader port fixture',
      prototype: rawPrototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );

  const match = matchWorksheetFormatSnapshot(
    snapshot(),
    [
      formatProfileToWorksheetPrototype(
        profile,
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      ),
    ],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const observation: CognitiveObservation<{ kind: string }> = {
    id: 'perception',
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'csv',
      sourceDigest,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };

  const envelope = createCognitiveReviewEnvelope({
    perception: adaptWorksheetFormatMatchToCognitiveOutcome(
      observation,
      match,
    ),
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });

  const workbook: WorkbookData = {
    sheets: {
      Sheet1: [
        ['ID', 'State'],
        ['1', 'ready'],
      ],
    },
  };

  return {
    root,
    markdownFilePath,
    sourcePath,
    envelope,
    workbook,
  };
}

function input(
  f: ReturnType<typeof fixture>,
  rawNotation = TABLE_PROPOSAL,
) {
  return {
    envelope: f.envelope,
    rawNotation,
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
    issuer: {
      kind: 'authority-plane' as const,
      componentId: 'mmi.experimental.authority-loader-port',
      componentVersion: '1',
      runId: 'run-loader-port',
    },
  };
}

function check(
  evidence: ReturnType<typeof runExecutableProposalAuthorityEvidenceWithLoader>,
  name: string,
) {
  return evidence.receipt.checks.find((entry) => entry.check === name);
}

test('calls injected loader with the contained resolved source path and produces satisfied Evidence', () => {
  const f = fixture();
  const seen: string[] = [];

  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input(f),
    (absolutePath) => {
      seen.push(absolutePath);
      return f.workbook;
    },
  );

  assert.deepEqual(seen, [f.sourcePath]);
  assert.equal(check(evidence, 'preview')?.status, 'passed');
  assert.equal(
    check(evidence, 'source-identity')?.evidenceCode,
    'SOURCE_DIGEST_MATCHED',
  );
  assert.equal(
    bindExecutableProposalAuthorityEvidence(
      f.envelope,
      TABLE_PROPOSAL,
      evidence,
    ).authorityStatus,
    'satisfied',
  );
});

test('does not invoke loader when source resolution fails', () => {
  const f = fixture();
  let calls = 0;

  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input(
      f,
      '![[../data/missing.csv#Sheet1|A1:B2?mode=table]]',
    ),
    () => {
      calls += 1;
      return f.workbook;
    },
  );

  assert.equal(calls, 0);
  assert.equal(check(evidence, 'resolver')?.status, 'failed');
  assert.equal(check(evidence, 'preview')?.status, 'failed');
});

test('does not invoke loader for explicit card mode', () => {
  const f = fixture();
  let calls = 0;

  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input(f, CARD_PROPOSAL),
    () => {
      calls += 1;
      return f.workbook;
    },
  );

  assert.equal(calls, 0);
  assert.equal(check(evidence, 'preview')?.status, 'passed');
});

test('converts loader exceptions into blocked preview Evidence', () => {
  const f = fixture();

  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input(f),
    () => {
      throw new Error('fixture loader failed');
    },
  );

  assert.equal(
    check(evidence, 'preview')?.evidenceCode,
    'PREVIEW_WORKBOOK_LOAD_FAILED',
  );
  assert.equal(
    bindExecutableProposalAuthorityEvidence(
      f.envelope,
      TABLE_PROPOSAL,
      evidence,
    ).authorityStatus,
    'blocked',
  );
});

test('detects source changes performed during Workbook load', () => {
  const f = fixture();

  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input(f),
    (absolutePath) => {
      fs.appendFileSync(absolutePath, '2,changed\n');
      return f.workbook;
    },
  );

  assert.equal(
    check(evidence, 'source-identity')?.evidenceCode,
    'SOURCE_CHANGED_DURING_PREVIEW',
  );
  assert.equal(check(evidence, 'source-identity')?.status, 'failed');
  assert.equal(
    bindExecutableProposalAuthorityEvidence(
      f.envelope,
      TABLE_PROPOSAL,
      evidence,
    ).authorityStatus,
    'blocked',
  );
});

test('rejects simultaneous preloaded WorkbookData and workbookLoader', () => {
  const f = fixture();

  assert.throws(
    () => runExecutableProposalAuthorityRevalidation({
      ...input(f),
      workbook: f.workbook,
      workbookLoader: () => f.workbook,
    }),
    /either preloaded WorkbookData or workbookLoader/,
  );
});

test('production default loader can validate the CSV proposal in a normal dependency environment', async () => {
  const f = fixture();

  const evidence =
    await runExecutableProposalAuthorityEvidenceWithDefaultLoader(
      input(f),
    );

  assert.equal(check(evidence, 'preview')?.status, 'passed');
  assert.equal(
    check(evidence, 'source-identity')?.evidenceCode,
    'SOURCE_DIGEST_MATCHED',
  );
  assert.equal(
    bindExecutableProposalAuthorityEvidence(
      f.envelope,
      TABLE_PROPOSAL,
      evidence,
    ).authorityStatus,
    'satisfied',
  );
});
