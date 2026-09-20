import type {
  ClosedChoiceJudgmentProvider,
  RunClosedChoiceJudgmentProviderOptions,
} from './closedChoiceJudgmentProvider.js';
import {
  runClosedChoiceJudgmentProvider,
} from './closedChoiceJudgmentProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION,
  createWorksheetReviewRouteEvaluationPacket,
  evaluateWorksheetReviewRouteEvaluationResponse,
  type WorksheetReviewRouteEvaluationReportV1,
  type WorksheetReviewRouteEvaluationResponseV1,
} from './worksheetReviewRouteEvaluationPacket.js';
import {
  createWorksheetReviewRouteEvaluationObservation,
} from './worksheetReviewRouteEvaluationObservation.js';
import {
  evaluateWorksheetReviewRouteReadiness,
  type WorksheetReviewRouteEvaluationReadinessPolicyV1,
  type WorksheetReviewRouteEvaluationReadinessV1,
} from './worksheetReviewRouteReadiness.js';

export type RunWorksheetReviewRouteEvaluationOptions =
  RunClosedChoiceJudgmentProviderOptions;

export type WorksheetReviewRouteEvaluationRunResultV1 =
  | {
      status: 'blocked';
      readiness: WorksheetReviewRouteEvaluationReadinessV1;
    }
  | {
      status: 'completed';
      readiness: WorksheetReviewRouteEvaluationReadinessV1;
      response: WorksheetReviewRouteEvaluationResponseV1;
      report: WorksheetReviewRouteEvaluationReportV1;
    };

export async function runWorksheetReviewRouteEvaluation(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  readinessPolicy:
    WorksheetReviewRouteEvaluationReadinessPolicyV1,
  provider:
    ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice>,
  options: RunWorksheetReviewRouteEvaluationOptions = {},
): Promise<WorksheetReviewRouteEvaluationRunResultV1> {
  if (
    readinessPolicy.requireProjectionForAllAdjudicated
      !== true
  ) {
    throw new Error(
      'Worksheet review-route evaluation runner requires requireProjectionForAllAdjudicated=true.',
    );
  }

  const readiness =
    evaluateWorksheetReviewRouteReadiness(
      corpus,
      readinessPolicy,
    );

  if (!readiness.ready) {
    return {
      status: 'blocked',
      readiness,
    };
  }

  const packet =
    createWorksheetReviewRouteEvaluationPacket(corpus);
  const outcomes: Array<
    WorksheetReviewRouteEvaluationResponseV1['outcomes'][number]
  > = [];

  for (const entry of packet.cases) {
    const observation =
      createWorksheetReviewRouteEvaluationObservation(entry);
    const outcome =
      await runClosedChoiceJudgmentProvider(
        provider,
        observation,
        WORKSHEET_REVIEW_ROUTE_QUESTION,
        options,
      );

    outcomes.push({
      caseId: entry.id,
      caseDigest: entry.caseDigest,
      outcome,
    });
  }

  const response: WorksheetReviewRouteEvaluationResponseV1 = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    outcomes,
  };

  return {
    status: 'completed',
    readiness,
    response,
    report:
      evaluateWorksheetReviewRouteEvaluationResponse(
        corpus,
        response,
      ),
  };
}
