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
  createCognitiveReviewPresentation,
  type CognitiveReviewPresentationV1,
} from '../src/experimental/cognitiveReviewPresentation.js';
import {
  runExecutableProposalAuthorityEvidence,
} from '../src/experimental/executableProposalAuthorityEvidence.js';
import {
  EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
  createExecutableProposalVerifiedReviewSurface,
} from '../src/experimental/executableProposalVerifiedReviewSurface.js';
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
  '![[../data/release.csv#Sheet1|A1:B2?header=first&mode=card]]';

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

function fixture(rawNotation = TABLE_PROPOSAL) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-proposal-surface-'));
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
      purpose: 'Proposal surface fixture',
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
  const presentation = createCognitiveReviewPresentation(envelope);

  const workbook: WorkbookData = {
    sheets: {
      Sheet1: sheetSourceFromMatrix([
        ['ID', 'State'],
        ['1', 'ready'],
      ]),
    },
  };

  const evidence = runExecutableProposalAuthorityEvidence({
    envelope,
    rawNotation,
    markdownFilePath,
    workspaceRoot: root,
    workbook,
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.experimental.authority-adapter',
      componentVersion: '1',
      runId: 'run-proposal-surface',
    },
  });

  return {
    envelope,
    presentation,
    evidence,
    rawNotation,
  };
}

test('creates a satisfied human-review surface bound to the exact proposal identity', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();
  const surface = createExecutableProposalVerifiedReviewSurface(
    envelope,
    presentation,
    rawNotation,
    evidence,
  );

  assert.equal(
    surface.schemaVersion,
    EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
  );
  assert.equal(surface.audience, 'human-review');
  assert.equal(surface.proposal.role, 'executable-proposal-identity');
  assert.equal(surface.proposal.digest, evidence.proposal.digest);
  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  assert.equal(surface.review.authority.disposition, 'review-only');
  assert.equal(surface.review.authority.writeAuthority, 'none');
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');
});

test('rejects Evidence reuse for another proposal on the same source', () => {
  const { envelope, presentation, evidence } = fixture(TABLE_PROPOSAL);

  assert.throws(
    () => createExecutableProposalVerifiedReviewSurface(
      envelope,
      presentation,
      CARD_PROPOSAL,
      evidence,
    ),
    /proposal digest does not match/,
  );
});

test('creates a blocked surface while preserving exact proposal identity', () => {
  const invalidProposal =
    '![[../data/release.csv#Sheet1|A1:B2?mode=rocket]]';
  const { envelope, presentation, evidence } = fixture(invalidProposal);

  const surface = createExecutableProposalVerifiedReviewSurface(
    envelope,
    presentation,
    invalidProposal,
    evidence,
  );

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'blocked',
  );
  assert.equal(surface.proposal.digest, evidence.proposal.digest);
  assert.equal(surface.review.perception.classification, 'matched');
});

test('rejects Presentation source identity tampering', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();
  const tampered = {
    ...presentation,
    authority: {
      ...presentation.authority,
      sourceDigest: 'sha256:other-source',
    },
  } as CognitiveReviewPresentationV1;

  assert.throws(
    () => createExecutableProposalVerifiedReviewSurface(
      envelope,
      tampered,
      rawNotation,
      evidence,
    ),
    /Presentation source digest does not match/,
  );
});

test('rejects Evidence source identity tampering', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();

  assert.throws(
    () => createExecutableProposalVerifiedReviewSurface(
      envelope,
      presentation,
      rawNotation,
      {
        ...evidence,
        sourceDigest: 'sha256:other-source',
      },
    ),
    /source digest does not match/,
  );
});

test('does not mutate Envelope, Presentation, or Evidence inputs', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();
  const envelopeBefore = structuredClone(envelope);
  const presentationBefore = structuredClone(presentation);
  const evidenceBefore = structuredClone(evidence);

  createExecutableProposalVerifiedReviewSurface(
    envelope,
    presentation,
    rawNotation,
    evidence,
  );

  assert.deepEqual(envelope, envelopeBefore);
  assert.deepEqual(presentation, presentationBefore);
  assert.deepEqual(evidence, evidenceBefore);
});

test('surface serialization keeps digests but excludes raw proposal and raw worksheet payload', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();
  const surface = createExecutableProposalVerifiedReviewSurface(
    envelope,
    presentation,
    rawNotation,
    evidence,
  );

  const serialized = JSON.stringify(surface);
  assert.equal(serialized.includes(surface.proposal.digest), true);
  assert.equal(serialized.includes(rawNotation), false);
  assert.equal(serialized.includes('mode=table'), false);
  assert.equal(serialized.includes('../data/release.csv'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('"apply":'), false);
});

test('Authority satisfaction never adds Cognitive approval semantics', () => {
  const { envelope, presentation, evidence, rawNotation } = fixture();
  const surface = createExecutableProposalVerifiedReviewSurface(
    envelope,
    presentation,
    rawNotation,
    evidence,
  );

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  const review = JSON.stringify(surface.review);
  assert.equal(review.includes('accepted'), false);
  assert.equal(review.includes('auto-apply'), false);
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');
});
