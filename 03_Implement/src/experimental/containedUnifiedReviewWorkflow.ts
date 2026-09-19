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
import {
  assertCognitiveObservation,
  type CognitiveObservation,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentOutcome,
  ClosedChoiceQuestion,
} from './closedChoiceJudgment.js';
import {
  runClosedChoiceJudgmentProvider,
  type ClosedChoiceJudgmentProvider,
} from './closedChoiceJudgmentProvider.js';
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

export const WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION =
  'worksheet-format-review-route-v1' as const;

export type ContainedUnifiedReviewSnapshotReader = (
  absolutePath: string,
  sheetName?: string,
) => XlsxFormatSnapshotResult;

export interface WorksheetFormatSourceObservationPayload {
  kind: 'worksheet-format';
  sheetName: string;
}

export interface ContainedUnifiedReviewJudgmentContext {
  observation: CognitiveObservation<WorksheetFormatSourceObservationPayload>;
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

export interface WorksheetFormatReviewRoutePayload {
  kind: 'worksheet-format-review-route';
  sheetName: string;
  classification: 'matched' | 'ambiguous' | 'novel';
  candidateIds: readonly string[];
  winnerPrototypeId?: string;
  noveltyScore: number;
}

export type ContainedUnifiedReviewProviderInput<
  TChoice extends string = string,
> = Omit<
  ContainedUnifiedReviewInput<TChoice>,
  'judgmentFactory'
> & {
  judgmentProvider: ClosedChoiceJudgmentProvider<TChoice>;
  judgmentQuestion: ClosedChoiceQuestion<TChoice>;
  allowExternalJudgment?: boolean;
};

interface PreparedContainedPerception {
  observation: CognitiveObservation<WorksheetFormatSourceObservationPayload>;
  perception: FlyWorksheetFormatPerceptionOutcome;
  snapshot: XlsxFormatSnapshotResult['snapshot'];
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
    toDeterministicWorkflowInput(
      input,
      prepared.envelope,
      prepared.snapshot,
    ),
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

  return prepareExecutableProposalDeterministicReviewWithDefaultLoader(
    toDeterministicWorkflowInput(
      input,
      prepared.envelope,
      prepared.snapshot,
    ),
  );
}

export async function prepareContainedUnifiedReviewWithProviderReaderAndLoader<
  TChoice extends string,
>(
  input: ContainedUnifiedReviewProviderInput<TChoice>,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
  workbookLoader: AuthorityWorkbookLoader,
): Promise<UnifiedHumanReviewViewModelV1<TChoice>> {
  const prepared = prepareContainedPerception(
    input,
    snapshotReader,
  );
  const judgmentObservation =
    createWorksheetFormatReviewRouteObservation(
      prepared.observation,
      prepared.perception,
    );

  const judgment = await runClosedChoiceJudgmentProvider(
    input.judgmentProvider,
    judgmentObservation,
    input.judgmentQuestion,
    {
      ...(input.allowExternalJudgment === undefined
        ? {}
        : { allowExternal: input.allowExternalJudgment }),
    },
  );

  const envelope = createEnvelope(
    prepared,
    input.approvedProfiles,
    judgment,
  );

  return prepareExecutableProposalDeterministicReviewWithLoader(
    toDeterministicWorkflowInput(
      input,
      envelope,
      prepared.snapshot,
    ),
    workbookLoader,
  );
}

export async function prepareContainedUnifiedReviewWithProviderAndDefaultReaders<
  TChoice extends string,
>(
  input: ContainedUnifiedReviewProviderInput<TChoice>,
): Promise<UnifiedHumanReviewViewModelV1<TChoice>> {
  const { readXlsxFormatSnapshot } = await import(
    './xlsxFormatSnapshotReader.js'
  );

  const prepared = prepareContainedPerception(
    input,
    (absolutePath, sheetName) =>
      readXlsxFormatSnapshot({
        absolutePath,
        ...(sheetName === undefined ? {} : { sheetName }),
      }),
  );
  const judgmentObservation =
    createWorksheetFormatReviewRouteObservation(
      prepared.observation,
      prepared.perception,
    );

  const judgment = await runClosedChoiceJudgmentProvider(
    input.judgmentProvider,
    judgmentObservation,
    input.judgmentQuestion,
    {
      ...(input.allowExternalJudgment === undefined
        ? {}
        : { allowExternal: input.allowExternalJudgment }),
    },
  );

  const envelope = createEnvelope(
    prepared,
    input.approvedProfiles,
    judgment,
  );

  return prepareExecutableProposalDeterministicReviewWithDefaultLoader(
    toDeterministicWorkflowInput(
      input,
      envelope,
      prepared.snapshot,
    ),
  );
}

export function createWorksheetFormatReviewRouteObservation(
  observation: CognitiveObservation<WorksheetFormatSourceObservationPayload>,
  perception: FlyWorksheetFormatPerceptionOutcome,
): CognitiveObservation<WorksheetFormatReviewRoutePayload> {
  const payload = perception.signal.payload;

  const derived: CognitiveObservation<WorksheetFormatReviewRoutePayload> = {
    id: `${observation.id}:review-route`,
    kind: 'worksheet-format-review-route',
    schemaVersion:
      WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
    payload: {
      kind: 'worksheet-format-review-route',
      sheetName: observation.payload.sheetName,
      classification: payload.classification,
      candidateIds: payload.candidates.map(
        (candidate) => candidate.prototypeId,
      ),
      ...(payload.winnerPrototypeId === undefined
        ? {}
        : { winnerPrototypeId: payload.winnerPrototypeId }),
      noveltyScore: payload.noveltyScore,
    },
    provenance: {
      sourceKind: observation.provenance.sourceKind,
      sourceDigest: observation.provenance.sourceDigest,
      ...(observation.provenance.featureVersion === undefined
        ? {}
        : {
            featureVersion:
              observation.provenance.featureVersion,
          }),
      ...(observation.provenance.sourceProfileId === undefined
        ? {}
        : {
            sourceProfileId:
              observation.provenance.sourceProfileId,
          }),
    },
  };

  assertCognitiveObservation(derived);
  if (
    derived.provenance.sourceDigest !==
    perception.observation.sourceDigest
  ) {
    throw new Error(
      'Review-route Observation source digest does not match Perception.',
    );
  }

  return derived;
}

function prepareContainedReview<TChoice extends string>(
  input: ContainedUnifiedReviewInput<TChoice>,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
): PreparedContainedReview<TChoice> {
  const prepared = prepareContainedPerception(
    input,
    snapshotReader,
  );

  const judgment = input.judgmentFactory?.({
    observation: prepared.observation,
    perception: prepared.perception,
  });

  return {
    envelope: createEnvelope(
      prepared,
      input.approvedProfiles,
      judgment,
    ),
    snapshot: prepared.snapshot,
  };
}

function prepareContainedPerception(
  input: Pick<
    ContainedUnifiedReviewInput,
    | 'observationId'
    | 'sourceKind'
    | 'markdownFilePath'
    | 'sourcePath'
    | 'workspaceRoot'
    | 'sheetName'
    | 'approvedProfiles'
  >,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
): PreparedContainedPerception {
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
    (resolvedPath): WorksheetFormatSourceObservationPayload => {
      snapshotResult = snapshotReader(
        resolvedPath,
        input.sheetName,
      );
      assertSnapshotResult(snapshotResult);
      return {
        kind: 'worksheet-format',
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

  return {
    observation: observed.observation,
    perception,
    snapshot: snapshotResult.snapshot,
  };
}

function createEnvelope<TChoice extends string>(
  prepared: PreparedContainedPerception,
  approvedProfiles: readonly FormatProfileV1[],
  judgment?: ClosedChoiceJudgmentOutcome<TChoice>,
): ReturnType<typeof createCognitiveReviewEnvelope<TChoice>> {
  return createCognitiveReviewEnvelope({
    perception: prepared.perception,
    approvedProfiles,
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ...(judgment === undefined ? {} : { judgment }),
  });
}

function toDeterministicWorkflowInput<TChoice extends string>(
  input: Pick<
    ContainedUnifiedReviewInput<TChoice>,
    | 'rawNotation'
    | 'markdownFilePath'
    | 'workspaceRoot'
    | 'issuer'
    | 'uriScheme'
    | 'approvedProfiles'
  >,
  envelope: ReturnType<typeof createCognitiveReviewEnvelope<TChoice>>,
  snapshot: XlsxFormatSnapshotResult['snapshot'],
) {
  return {
    envelope,
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
      observationSnapshot: snapshot,
      approvedProfiles: input.approvedProfiles,
    },
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

type _NoProviderSnapshotInjection =
  'observationSnapshot' extends keyof ContainedUnifiedReviewProviderInput
    ? never
    : true;
const _noProviderSnapshotInjection: _NoProviderSnapshotInjection = true;
void _noProviderSnapshotInjection;

type _NoProviderFactoryInjection =
  'judgmentFactory' extends keyof ContainedUnifiedReviewProviderInput
    ? never
    : true;
const _noProviderFactoryInjection: _NoProviderFactoryInjection = true;
void _noProviderFactoryInjection;
