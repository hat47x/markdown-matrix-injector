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
  EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION,
  bindExecutableProposalAuthorityEvidence,
  createExecutableProposalIdentity,
  runExecutableProposalAuthorityEvidence,
} from '../src/experimental/executableProposalAuthorityEvidence.js';
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

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-proposal-evidence-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  const sourcePath = path.join(data, 'release.csv');
  const sourceBytes = Buffer.from('ID,State\n1,ready\n', 'utf8');
  fs.writeFileSync(sourcePath, sourceBytes);
  const sourceDigest = sha256(sourceBytes);

  const rawPrototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Proposal evidence fixture',
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

  return {
    root,
    markdownFilePath,
    envelope,
    workbook,
  };
}

function evidenceFor(
  rawNotation = TABLE_PROPOSAL,
) {
  const f = fixture();
  const evidence = runExecutableProposalAuthorityEvidence({
    envelope: f.envelope,
    rawNotation,
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
    workbook: f.workbook,
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.experimental.authority-adapter',
      componentVersion: '1',
      runId: 'run-proposal-evidence',
    },
  });
  return { ...f, evidence };
}

test('binds a satisfied Receipt to the exact executable proposal identity', () => {
  const { envelope, evidence } = evidenceFor();
  const binding = bindExecutableProposalAuthorityEvidence(
    envelope,
    TABLE_PROPOSAL,
    evidence,
  );

  assert.equal(
    evidence.schemaVersion,
    EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION,
  );
  assert.equal(evidence.proposal.algorithm, 'sha256');
  assert.equal(
    evidence.proposal.representation,
    'mmi-notation-trimmed-utf8-v1',
  );
  assert.equal(binding.authorityStatus, 'satisfied');
  assert.equal(binding.proposal.digest, evidence.proposal.digest);
});

test('rejects Receipt/Evidence reuse for a different proposal on the same source', () => {
  const { envelope, evidence } = evidenceFor(TABLE_PROPOSAL);

  assert.throws(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      CARD_PROPOSAL,
      evidence,
    ),
    /proposal digest does not match/,
  );
});

test('leading and trailing whitespace do not change proposal identity', () => {
  assert.deepEqual(
    createExecutableProposalIdentity(TABLE_PROPOSAL),
    createExecutableProposalIdentity(`  \n${TABLE_PROPOSAL}\n  `),
  );

  const { envelope, evidence } = evidenceFor(TABLE_PROPOSAL);
  assert.doesNotThrow(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      `  ${TABLE_PROPOSAL}  `,
      evidence,
    ),
  );
});

test('internal notation changes produce a different proposal identity', () => {
  const table = createExecutableProposalIdentity(TABLE_PROPOSAL);
  const card = createExecutableProposalIdentity(CARD_PROPOSAL);

  assert.notEqual(table.digest, card.digest);
});

test('preserves proposal identity even when Authority validation is blocked', () => {
  const invalidProposal =
    '![[../data/release.csv#Sheet1|A1:B2?mode=rocket]]';
  const { envelope, evidence } = evidenceFor(invalidProposal);
  const binding = bindExecutableProposalAuthorityEvidence(
    envelope,
    invalidProposal,
    evidence,
  );

  assert.equal(binding.authorityStatus, 'blocked');
  assert.equal(
    evidence.receipt.checks
      .find((check) => check.check === 'parameter-schema')
      ?.status,
    'failed',
  );
  assert.equal(
    binding.proposal.digest,
    createExecutableProposalIdentity(invalidProposal).digest,
  );
});

test('rejects Evidence source identity tampering', () => {
  const { envelope, evidence } = evidenceFor();

  assert.throws(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      TABLE_PROPOSAL,
      {
        ...evidence,
        sourceDigest: 'sha256:other-source',
      },
    ),
    /source digest does not match/,
  );

  assert.throws(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      TABLE_PROPOSAL,
      {
        ...evidence,
        receipt: {
          ...evidence.receipt,
          sourceDigest: 'sha256:other-source',
        },
      },
    ),
    /source digest does not match/,
  );
});

test('rejects non-executable Receipt scope and schema tampering', () => {
  const { envelope, evidence } = evidenceFor();

  assert.throws(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      TABLE_PROPOSAL,
      {
        ...evidence,
        receipt: {
          ...evidence.receipt,
          scope: 'review-evidence',
        },
      },
    ),
    /requires an executable-proposal Receipt/,
  );

  assert.throws(
    () => bindExecutableProposalAuthorityEvidence(
      envelope,
      TABLE_PROPOSAL,
      {
        ...evidence,
        schemaVersion: 'other-schema' as never,
      },
    ),
    /Unsupported executable proposal Authority Evidence schema/,
  );
});

test('Evidence serialization contains proposal digest but not raw Notation', () => {
  const { evidence } = evidenceFor();
  const serialized = JSON.stringify(evidence);

  assert.equal(serialized.includes(evidence.proposal.digest), true);
  assert.equal(serialized.includes(TABLE_PROPOSAL), false);
  assert.equal(serialized.includes('mode=table'), false);
  assert.equal(serialized.includes('../data/release.csv'), false);
});

test('proposal identity is deterministic across repeated creation', () => {
  const left = createExecutableProposalIdentity(TABLE_PROPOSAL);
  const right = createExecutableProposalIdentity(TABLE_PROPOSAL);

  assert.deepEqual(left, right);
});
