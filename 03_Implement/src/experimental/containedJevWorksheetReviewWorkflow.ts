import type {
  AuthorityWorkbookLoader,
} from './authorityRevalidationAdapter.js';
import {
  prepareContainedUnifiedReviewWithProviderAndDefaultReaders,
  prepareContainedUnifiedReviewWithProviderReaderAndLoader,
  type ContainedUnifiedReviewInput,
  type ContainedUnifiedReviewSnapshotReader,
} from './containedUnifiedReviewWorkflow.js';
import type {
  JevSystemOneTransport,
} from './jevChoiceJudgmentProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  createJevWorksheetReviewRouteProvider,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import type {
  UnifiedHumanReviewViewModelV1,
} from './unifiedHumanReviewViewModel.js';

export type ContainedJevWorksheetReviewInput = Omit<
  ContainedUnifiedReviewInput<WorksheetReviewRouteChoice>,
  'judgmentFactory'
> & {
  allowExternalJev: true;
  jevModel?: string;
  jevProviderId?: string;
};

export function prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
  input: ContainedJevWorksheetReviewInput,
  transport: JevSystemOneTransport,
  snapshotReader: ContainedUnifiedReviewSnapshotReader,
  workbookLoader: AuthorityWorkbookLoader,
): Promise<UnifiedHumanReviewViewModelV1<WorksheetReviewRouteChoice>> {
  assertExternalJevConsent(input);

  const provider = createJevWorksheetReviewRouteProvider(
    transport,
    {
      ...(input.jevModel === undefined
        ? {}
        : { model: input.jevModel }),
      ...(input.jevProviderId === undefined
        ? {}
        : { providerId: input.jevProviderId }),
    },
  );

  return prepareContainedUnifiedReviewWithProviderReaderAndLoader(
    {
      ...baseInput(input),
      judgmentProvider: provider,
      judgmentQuestion: WORKSHEET_REVIEW_ROUTE_QUESTION,
      allowExternalJudgment: true,
    },
    snapshotReader,
    workbookLoader,
  );
}

export function prepareContainedUnifiedReviewWithJevRouteAndDefaultReaders(
  input: ContainedJevWorksheetReviewInput,
  transport: JevSystemOneTransport,
): Promise<UnifiedHumanReviewViewModelV1<WorksheetReviewRouteChoice>> {
  assertExternalJevConsent(input);

  const provider = createJevWorksheetReviewRouteProvider(
    transport,
    {
      ...(input.jevModel === undefined
        ? {}
        : { model: input.jevModel }),
      ...(input.jevProviderId === undefined
        ? {}
        : { providerId: input.jevProviderId }),
    },
  );

  return prepareContainedUnifiedReviewWithProviderAndDefaultReaders({
    ...baseInput(input),
    judgmentProvider: provider,
    judgmentQuestion: WORKSHEET_REVIEW_ROUTE_QUESTION,
    allowExternalJudgment: true,
  });
}

function assertExternalJevConsent(
  input: ContainedJevWorksheetReviewInput,
): void {
  if (input.allowExternalJev !== true) {
    throw new Error(
      'Contained Jev review requires explicit allowExternalJev=true consent.',
    );
  }
}

function baseInput(
  input: ContainedJevWorksheetReviewInput,
): Omit<
  ContainedUnifiedReviewInput<WorksheetReviewRouteChoice>,
  'judgmentFactory'
> {
  const {
    allowExternalJev: _allowExternalJev,
    jevModel: _jevModel,
    jevProviderId: _jevProviderId,
    ...base
  } = input;

  return base;
}

// Compile-time guards: the Jev convenience path does not expose generic
// provider/question/projector controls.
type _NoJudgmentProvider =
  'judgmentProvider' extends keyof ContainedJevWorksheetReviewInput
    ? never
    : true;
const _noJudgmentProvider: _NoJudgmentProvider = true;
void _noJudgmentProvider;

type _NoJudgmentQuestion =
  'judgmentQuestion' extends keyof ContainedJevWorksheetReviewInput
    ? never
    : true;
const _noJudgmentQuestion: _NoJudgmentQuestion = true;
void _noJudgmentQuestion;

type _NoStateProjector =
  'projectState' extends keyof ContainedJevWorksheetReviewInput
    ? never
    : true;
const _noStateProjector: _NoStateProjector = true;
void _noStateProjector;
