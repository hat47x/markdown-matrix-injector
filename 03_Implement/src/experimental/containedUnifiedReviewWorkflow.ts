import type {
  AuthorityRevalidationIssuer,
} from './authorityRevalidationReceipt.js';
import type {
  AuthorityWorkbookLoader,
} from './authorityRevalidationAdapter.js';
import {
  createCognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';
import {
  createContainedCognitiveObservation,
  type ContainedCognitiveObservationInput,
} from './cognitiveSourceObservation.js';
import type {
  CognitiveObservation,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentOutcome,
} from './closedChoiceJudgment.js';
import {
  prepareExecutableProposalDeterministicReviewWithDefaultLoader,
  prepareExecutableProposalDeterministicReviewWithLoader,
} from './executableProposalDeterministicReviewWorkflow.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
  type FlyWorksheetFormatPerceptionOutcome,
} from './flyWorksheetFormatPerceptionProvider.js';
import {
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
} from './formatProfile.js';
import type {
  UnifiedHumanReviewViewModelV1,
} from './unifiedHumanReviewViewModel.js';
import type {
  XlsxFormatSnapshotResult,
} from './xlsxFormatSnapshotReader.js';
import {
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from './worksheetFormatPrototype.js';

export type ContainedUnifiedReviewSnapshotReader = (
  absolutePath: string,
  sheetName?: string,
) => XlsxFormatSnapshotResult;

export interface ContainedUnifiedReviewJudgmentContext {
  observation: CognitiveObservation<{
    kind: 'worksheet-format';
    sheetName: string;
  }>;
  perception: FlyWorksheetFormatPerceptionOutcome;
}

export type ContainedUnifiedReviewJudgmentFactory<
  TChoice extends string = string,
> = (
  context: ContainedUnifiedReviewJudgmentContext,
) => ClosedChoiceJudgmentOutcome<TChoice>;

export interface ContainedUnifiedReviewInput<
  TChoice extends string = string,
> {
  observationId: string;
  sourceKind: string;
  markdownFilePath: string;
  sourcePath: string;
  workspaceRoot?: string;
  sheetName?: string;
  approvedProfiles: readonly FormatProfileV1[];
  rawNotation: string;
  issuer: AuthorityRevalidationIssuer;
  uriScheme?: string;
  judgmentFactory?: ContainedUnifiedReviewJudgmentFactory<TChoice>;
}

interface PreparedContainedReview<TChoice extends string> {
  envelope: ReturnType<typeof createCognitiveReviewEnvelope<TChoice>>;
  snapshot: XlsxFormatSnapshotResult['snapshot'];
}

export function prepareContainedUnifiedReviewWithReaderAndLoader<
  TChoice extends string,
>(
  input: ContainedUnifiedReviewInput<TChoice>,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
  workbookLoader: AuthorityWorkbookLoader,
): UnifiedHumanReviewViewModelV1<TChoice> {
  const prepared = prepareContainedReview(input, snapshotReader);

  return prepareExecutableProposalDeterministicReviewWithLoader(
    {
      envelope: prepared.envelope,
      rawNotation: input.rawNotation,
      markdownFilePath: input.markdownFilePath,
      ...(input.workspaceRoot === undefined
        ? {}
        : { workspaceRoot: input.workspaceRoot }),
      issuer: { ...input.issuer },
      ...(input.uriScheme === undefined
        ? {}
        : { uriScheme: input.uriScheme }),
      deterministicReview: {
        observationSnapshot: prepared.snapshot,
        approvedProfiles: input.approvedProfiles,
      },
    },
    workbookLoader,
  );
}

export async function prepareContainedUnifiedReviewWithDefaultReaders<
  TChoice extends string,
>(
  input: ContainedUnifiedReviewInput<TChoice>,
): Promise<UnifiedHumanReviewViewModelV1<TChoice>> {
  const { readXlsxFormatSnapshot } = await import(
    './xlsxFormatSnapshotReader.js'
  );

  const prepared = prepareContainedReview(
    input,
    (absolutePath, sheetName) =>
      readXlsxFormatSnapshot({
        absolutePath,
        ...(sheetName === undefined ? {} : { sheetName }),
      }),
  );

  return prepareExecutableProposalDeterministicReviewWithDefaultLoader({
    envelope: prepared.envelope,
    rawNotation: input.rawNotation,
    markdownFilePath: input.markdownFilePath,
    ...(input.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: input.workspaceRoot }),
    issuer: { ...input.issuer },
    ...(input.uriScheme === undefined
      ? {}
      : { uriScheme: input.uriScheme }),
    deterministicReview: {
      observationSnapshot: prepared.snapshot,
      approvedProfiles: input.approvedProfiles,
    },
  });
}

function prepareContainedReview<TChoice extends string>(
  input: ContainedUnifiedReviewInput<TChoice>,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
): PreparedContainedReview<TChoice> {
  const prototypes = input.approvedProfiles.map((profile) =>
    formatProfileToWorksheetPrototype(
      profile,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
  );

  let snapshotResult: XlsxFormatSnapshotResult | undefined;

  const observationInput: ContainedCognitiveObservationInput = {
    id: input.observationId,
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    sourceKind: input.sourceKind,
    markdownFilePath: input.markdownFilePath,
    sourcePath: input.sourcePath,
    ...(input.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: input.workspaceRoot }),
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
  };

  const observed = createContainedCognitiveObservation(
    observationInput,
    (resolvedPath) => {
      snapshotResult = snapshotReader(
        resolvedPath,
        input.sheetName,
      );
      assertSnapshotResult(snapshotResult);
      return {
        kind: 'worksheet-format' as const,
        sheetName: snapshotResult.sheetName,
      };
    },
  );

  if (snapshotResult === undefined) {
    throw new Error(
      'Contained unified review snapshot reader did not produce a result.',
    );
  }

  const match = matchWorksheetFormatSnapshot(
    snapshotResult.snapshot,
    prototypes,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const perception = adaptWorksheetFormatMatchToCognitiveOutcome(
    observed.observation,
    match,
  );

  const judgment = input.judgmentFactory?.({
    observation: observed.observation,
    perception,
  });

  const envelope = createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: input.approvedProfiles,
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ...(judgment === undefined ? {} : { judgment }),
  });

  return {
    envelope,
    snapshot: snapshotResult.snapshot,
  };
}

function assertSnapshotResult(
  result: XlsxFormatSnapshotResult,
): void {
  if (result.sheetName.trim().length === 0) {
    throw new Error(
      'Contained unified review snapshot reader must return a non-empty sheet name.',
    );
  }
  if (!result.snapshot || !Array.isArray(result.snapshot.cells)) {
    throw new Error(
      'Contained unified review snapshot reader returned an invalid snapshot.',
    );
  }
  if (
    result.snapshot.merges !== undefined
    && !Array.isArray(result.snapshot.merges)
  ) {
    throw new Error(
      'Contained unified review snapshot reader returned invalid merges.',
    );
  }
}

// Compile-time guards: callers cannot inject prepared observation/review state
// or select a source profile different from the Profile-backed analysis path.
type _NoObservationSnapshot =
  'observationSnapshot' extends keyof ContainedUnifiedReviewInput
    ? never
    : true;
const _noObservationSnapshot: _NoObservationSnapshot = true;
void _noObservationSnapshot;

type _NoPreparedEnvelope =
  'envelope' extends keyof ContainedUnifiedReviewInput
    ? never
    : true;
const _noPreparedEnvelope: _NoPreparedEnvelope = true;
void _noPreparedEnvelope;

type _NoSourceProfile =
  'sourceProfile' extends keyof ContainedUnifiedReviewInput
    ? never
    : true;
const _noSourceProfile: _NoSourceProfile = true;
void _noSourceProfile;
