import type {
  ClosedChoiceJudgmentProvider,
} from './closedChoiceJudgmentProvider.js';
import {
  createJevChoiceJudgmentProvider,
  type JevChoiceJudgmentProviderConfig,
  type JevSystemOneTransport,
} from './jevChoiceJudgmentProvider.js';
import {
  describeWorksheetReviewRouteChoice,
  type JevWorksheetReviewRouteProviderOptions,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import {
  projectWorksheetReviewRouteEvaluationState,
} from './worksheetReviewRouteEvaluationObservation.js';

export function createJevWorksheetReviewRouteEvaluationProvider(
  transport: JevSystemOneTransport,
  options: JevWorksheetReviewRouteProviderOptions = {},
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  const config:
    JevChoiceJudgmentProviderConfig<WorksheetReviewRouteChoice> = {
      ...(options.model === undefined
        ? {}
        : { model: options.model }),
      ...(options.providerId === undefined
        ? {}
        : { providerId: options.providerId }),
      projectState(observation) {
        return projectWorksheetReviewRouteEvaluationState(
          observation,
        );
      },
      describeChoice(choice) {
        return describeWorksheetReviewRouteChoice(choice);
      },
    };

  return createJevChoiceJudgmentProvider(
    config,
    transport,
  );
}
