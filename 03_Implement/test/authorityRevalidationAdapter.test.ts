import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import type { CognitiveObservation } from '../src/experimental/cognitiveContract.js';
import {
  bindAuthorityRevalidationReceipt,
} from '../src/experimental/authorityRevalidationReceipt.js';
import {
  runExecutableProposalAuthorityRevalidation,
} from '../src/experimental/authorityRevalidationAdapter.js';
import {
  createCognitiveReviewEnvelope,
  type CognitiveReviewEnvelope,
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

interface Fixture {
  root: string;
  markdownFilePath: string;
  sourcePath: string;
  sourceDigest: string;
  workbook: WorkbookData;
  envelope: CognitiveReviewEnvelope;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function worksheetSnapshot(): WorksheetFormatSnapshot {
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

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-authority-adapter-'));
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

  const prototype = createWorksheetFormatPrototype(
    'release-table',
    worksheetSnapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Authority adapter fixture',
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );
  const match = matchWorksheetFormatSnapshot(
    worksheetSnapshot(),
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

  return {
    root,
    markdownFilePath,
    sourcePath,
    sourceDigest,
    workbook: {
      sheets: {
        Sheet1: [
          ['ID', 'State'],
          ['1', 'ready'],
        ],
      },
    },
    envelope,
  };
}

function run(
  fixture: Fixture,
  rawNotation = '![[../data/release.csv#Sheet1|A1:B2?header=first&mode=table]]',
  overrides: Partial<Parameters<typeof runExecutableProposalAuthorityRevalidation>[0]> = {},
) {
  return runExecutableProposalAuthorityRevalidation({
    envelope: fixture.envelope,
    rawNotation,
    markdownFilePath: fixture.markdownFilePath,
    workspaceRoot: fixture.root,
    workbook: fixture.workbook,
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.experimental.authority-adapter',
      componentVersion: '1',
      runId: 'run-test',
    },
    ...overrides,
  } as Parameters<typeof runExecutableProposalAuthorityRevalidation>[0]);
}

function checkStatus(
  receipt: ReturnType<typeof run>,
  check: string,
): string | undefined {
  return receipt.checks.find((entry) => entry.check === check)?.status;
}

function evidenceCode(
  receipt: ReturnType<typeof run>,
  check: string,
): string | undefined {
  return receipt.checks.find((entry) => entry.check === check)?.evidenceCode;
}

test('builds a satisfied executable-proposal receipt from existing Authority primitives', () => {
  const fixture = createFixture();
  const receipt = run(fixture);
  const binding = bindAuthorityRevalidationReceipt(
    fixture.envelope,
    receipt,
  );

  assert.equal(receipt.scope, 'executable-proposal');
  assert.ok(receipt.checks.every((entry) => entry.status === 'passed'));
  assert.equal(binding.status, 'satisfied');
  assert.deepEqual(binding.failedChecks, []);
  assert.equal(
    evidenceCode(receipt, 'source-identity'),
    'SOURCE_DIGEST_MATCHED',
  );
  assert.equal(
    evidenceCode(receipt, 'preview'),
    'READ_ONLY_PREVIEW_RENDERED',
  );
});

test('rejects invalid known parameter vocabulary but preserves the full receipt', () => {
  const fixture = createFixture();
  const receipt = run(
    fixture,
    '![[../data/release.csv#Sheet1|A1:B2?mode=rocket]]',
  );
  const binding = bindAuthorityRevalidationReceipt(
    fixture.envelope,
    receipt,
  );

  assert.equal(checkStatus(receipt, 'parser'), 'passed');
  assert.equal(checkStatus(receipt, 'parameter-schema'), 'failed');
  assert.equal(receipt.checks.length, 8);
  assert.equal(binding.status, 'blocked');
});

test('allows unknown parameters for Notation forward compatibility', () => {
  const fixture = createFixture();
  const receipt = run(
    fixture,
    '![[../data/release.csv#Sheet1|A1:B2?mode=table&futureFlag=1&x-lab=yes]]',
  );

  assert.equal(checkStatus(receipt, 'parameter-schema'), 'passed');
});

test('fails closed when the source file cannot be resolved', () => {
  const fixture = createFixture();
  const receipt = run(
    fixture,
    '![[../data/missing.csv#Sheet1|A1:B2?mode=table]]',
  );
  const binding = bindAuthorityRevalidationReceipt(
    fixture.envelope,
    receipt,
  );

  assert.equal(checkStatus(receipt, 'resolver'), 'failed');
  assert.equal(checkStatus(receipt, 'containment'), 'failed');
  assert.equal(checkStatus(receipt, 'source-existence'), 'failed');
  assert.equal(checkStatus(receipt, 'source-identity'), 'failed');
  assert.equal(checkStatus(receipt, 'preview'), 'failed');
  assert.equal(binding.status, 'blocked');
});

test('records workspace containment violation separately', () => {
  const fixture = createFixture();
  const outside = path.join(path.dirname(fixture.root), 'mmi-authority-outside.csv');
  fs.writeFileSync(outside, 'ID,State\n1,secret\n');

  const receipt = run(
    fixture,
    `![[../../${path.basename(outside)}#Sheet1|A1:B2?mode=table]]`,
  );

  assert.equal(
    evidenceCode(receipt, 'containment'),
    'WORKSPACE_CONTAINMENT_REJECTED',
  );
  assert.equal(checkStatus(receipt, 'containment'), 'failed');
  assert.equal(checkStatus(receipt, 'source-existence'), 'failed');
});

test('blocks when the resolved file digest differs from the Envelope identity', () => {
  const fixture = createFixture();
  fs.appendFileSync(fixture.sourcePath, '2,changed\n');

  const receipt = run(fixture);
  const binding = bindAuthorityRevalidationReceipt(
    fixture.envelope,
    receipt,
  );

  assert.equal(checkStatus(receipt, 'source-identity'), 'failed');
  assert.equal(
    evidenceCode(receipt, 'source-identity'),
    'SOURCE_DIGEST_MISMATCH',
  );
  assert.equal(binding.status, 'blocked');
});

test('fails preview when the requested sheet is unavailable', () => {
  const fixture = createFixture();
  const receipt = run(
    fixture,
    '![[../data/release.csv#Missing|A1:B2?mode=table]]',
  );

  assert.equal(checkStatus(receipt, 'preview'), 'failed');
  assert.equal(
    evidenceCode(receipt, 'preview'),
    'READ_ONLY_PREVIEW_FAILED',
  );
});

test('renders explicit card mode without WorkbookData', () => {
  const fixture = createFixture();
  const receipt = run(
    fixture,
    '![[../data/release.csv?mode=card]]',
    { workbook: undefined },
  );

  assert.equal(checkStatus(receipt, 'preview'), 'passed');
  assert.equal(
    evidenceCode(receipt, 'preview'),
    'READ_ONLY_PREVIEW_RENDERED',
  );
});

test('fails profile compatibility if Envelope profile provenance is tampered', () => {
  const fixture = createFixture();
  const tampered = {
    ...fixture.envelope,
    profiles: fixture.envelope.profiles.map((profile, index) =>
      index === 0
        ? { ...profile, featureVersion: 'worksheet-format-v0' }
        : profile),
  } as CognitiveReviewEnvelope;

  const receipt = run(fixture, undefined, { envelope: tampered });

  assert.equal(checkStatus(receipt, 'profile-compatibility'), 'failed');
  assert.equal(
    evidenceCode(receipt, 'profile-compatibility'),
    'PROFILE_CONTRACT_MISMATCH',
  );
});
