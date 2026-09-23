import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkbookData } from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import type { CognitiveObservation } from '../src/experimental/cognitiveContract.js';
import {
  createCognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  prepareExecutableProposalVerifiedReviewWithDefaultLoader,
  prepareExecutableProposalVerifiedReviewWithLoader,
} from '../src/experimental/executableProposalVerifiedReviewWorkflow.js';
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

const TABLE =
  '![[../data/release.csv#Sheet1|A1:B2?header=first&mode=table]]';
const CARD = '![[../data/release.csv?mode=card]]';

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
    merges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }],
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-workflow-'));
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
      purpose: 'Verified review workflow fixture',
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
      Sheet1: sheetSourceFromMatrix([
        ['ID', 'State'],
        ['1', 'ready'],
      ]),
    },
  };

  const base = {
    envelope,
    markdownFilePath,
    workspaceRoot: root,
    issuer: {
      kind: 'authority-plane' as const,
      componentId: 'mmi.experimental.review-workflow',
      componentVersion: '1',
      runId: 'run-review-workflow',
    },
  };

  return { root, sourcePath, envelope, workbook, base };
}

test('returns a satisfied verified surface through the single safe workflow', () => {
  const f = fixture();
  const surface = prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: TABLE },
    () => f.workbook,
  );

  assert.equal(surface.authorityVerification.verificationStatus, 'satisfied');
  assert.equal(surface.review.authority.disposition, 'review-only');
  assert.equal(surface.review.authority.writeAuthority, 'none');
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');
  assert.match(surface.proposal.digest, /^sha256:[0-9a-f]{64}$/u);
});

test('returns a blocked review surface for invalid known parameters', () => {
  const f = fixture();
  const invalid =
    '![[../data/release.csv#Sheet1|A1:B2?mode=rocket]]';
  const surface = prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: invalid },
    () => f.workbook,
  );

  assert.equal(surface.authorityVerification.verificationStatus, 'blocked');
  assert.ok(
    surface.authorityVerification.failedChecks.includes('parameter-schema'),
  );
});

test('explicit card proposal does not invoke the Workbook loader', () => {
  const f = fixture();
  let calls = 0;

  const surface = prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: CARD },
    () => {
      calls += 1;
      return f.workbook;
    },
  );

  assert.equal(calls, 0);
  assert.equal(surface.authorityVerification.verificationStatus, 'satisfied');
});

test('source change during load becomes a blocked surface', () => {
  const f = fixture();

  const surface = prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: TABLE },
    (absolutePath) => {
      fs.appendFileSync(absolutePath, '2,changed\n');
      return f.workbook;
    },
  );

  assert.equal(surface.authorityVerification.verificationStatus, 'blocked');
  assert.ok(
    surface.authorityVerification.failedChecks.includes('source-identity'),
  );
});

test('workflow does not mutate the Cognitive Review Envelope', () => {
  const f = fixture();
  const before = structuredClone(f.envelope);

  prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: TABLE },
    () => f.workbook,
  );

  assert.deepEqual(f.envelope, before);
});

test('serialized workflow surface does not retain raw Notation or worksheet payload', () => {
  const f = fixture();
  const surface = prepareExecutableProposalVerifiedReviewWithLoader(
    { ...f.base, rawNotation: TABLE },
    () => f.workbook,
  );
  const serialized = JSON.stringify(surface);

  assert.equal(serialized.includes(TABLE), false);
  assert.equal(serialized.includes('mode=table'), false);
  assert.equal(serialized.includes('../data/release.csv'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('"apply":'), false);
});

test('default-loader workflow validates CSV in a normal dependency environment', async () => {
  const f = fixture();
  const surface =
    await prepareExecutableProposalVerifiedReviewWithDefaultLoader({
      ...f.base,
      rawNotation: TABLE,
    });

  assert.equal(surface.authorityVerification.verificationStatus, 'satisfied');
});
