import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import type {
  ClosedChoiceProviderResponse,
} from '../src/experimental/closedChoiceJudgment.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import type {
  WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  createWorksheetReviewRouteEvaluationPlan,
  runWorksheetReviewRouteEvaluationPlan,
} from '../src/experimental/worksheetReviewRouteEvaluationPlan.js';
import {
  createWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_MEDIA_TYPE,
  createWorksheetReviewRouteEvaluationRecordFileName,
  parseCanonicalWorksheetReviewRouteEvaluationRecordJson,
  parseWorksheetReviewRouteEvaluationRecordJson,
  prepareWorksheetReviewRouteEvaluationRecordJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordJsonCodec.js';

const policy = {
  minimumAdjudicatedCases: 2,
  minimumAdjudicatedCaseFamilies: 2,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

function corpus(): WorksheetReviewRouteLabelCorpusV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    purpose: 'independent-ground-truth',
    blinding: {
      providerOutputHidden: true,
      providerIdentityHidden: true,
      modelIdentityHidden: true,
      probabilityHidden: true,
      confidenceHidden: true,
    },
    cases: [
      adjudicated(
        'inspect-case',
        'family-a',
        'inspect',
        'ambiguous',
        2,
        false,
        0.2,
      ),
      adjudicated(
        'routine-case',
        'family-b',
        'routine',
        'matched',
        1,
        true,
        0.05,
      ),
    ],
  };
}

function adjudicated(
  id: string,
  caseFamily: string,
  route: WorksheetReviewRouteChoice,
  classification: 'matched' | 'ambiguous' | 'novel',
  candidateCount: number,
  hasWinner: boolean,
  noveltyScore: number,
): WorksheetReviewRouteLabelCorpusV1['cases'][number] {
  return {
    id,
    evidence: {
      sourceClass: 'replay',
      caseFamily,
      reference: `evidence:${id}`,
      facts: [`Fact ${id}`],
    },
    projectionState: {
      classification,
      candidateCount,
      hasWinner,
      noveltyScore,
    },
    annotations: [
      {
        annotatorRef: `${id}:a`,
        route,
        rationaleCodes: ['R1'],
        annotationReference:
          `annotation:${id}:a`,
      },
      {
        annotatorRef: `${id}:b`,
        route,
        rationaleCodes: ['R2'],
        annotationReference:
          `annotation:${id}:b`,
      },
    ],
    adjudication: {
      adjudicatorRef: `${id}:adj`,
      route,
      rationaleCodes: ['FINAL'],
      adjudicationReference:
        `adjudication:${id}`,
    },
  };
}

function provider():
  ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.route-record-codec.stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      const payload =
        observation.payload as {
          classification: string;
        };
      const choice: WorksheetReviewRouteChoice =
        payload.classification === 'matched'
          ? 'routine'
          : 'inspect';
      return {
        status: 'decision',
        choice,
        probability: 0.9,
        confidence: 0.8,
        distribution: choice === 'inspect'
          ? {
              inspect: 0.9,
              routine: 0.1,
            }
          : {
              inspect: 0.1,
              routine: 0.9,
            },
      };
    },
  };
}

async function record():
  Promise<WorksheetReviewRouteEvaluationRecordV1> {
  const source = corpus();
  const runtimeProvider = provider();
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      runtimeProvider.descriptor,
    );
  const run =
    await runWorksheetReviewRouteEvaluationPlan(
      source,
      plan,
      runtimeProvider,
    );
  assert.equal(run.status, 'completed');
  if (run.status !== 'completed') {
    throw new Error('expected completed planned run');
  }

  return createWorksheetReviewRouteEvaluationRecord(
    source,
    plan,
    run,
  );
}

test('canonical JSON round-trips deterministically and produces a full-digest stable filename', async () => {
  const source = await record();

  const first =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      source,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      structuredClone(source),
    );

  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), false);
  assert.equal(first.includes('\n'), false);
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      first,
    ),
    source,
  );

  const fileName =
    createWorksheetReviewRouteEvaluationRecordFileName(
      source,
    );
  const digestHex =
    source.recordDigest.slice('sha256:'.length);
  assert.equal(
    fileName,
    `worksheet-review-route-evaluation-record-${digestHex}.json`,
  );
  assert.equal(digestHex.length, 64);

  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(
      source,
    );
  assert.deepEqual(artifact, {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_MEDIA_TYPE,
    fileName,
    content: first,
  });
});

test('normalizing parse accepts formatting differences while canonical parse rejects them', async () => {
  const source = await record();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      source,
    );
  const parsed = JSON.parse(canonical) as
    Record<string, unknown>;

  const pretty =
    JSON.stringify(parsed, null, 2);
  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordJson(
      pretty,
    ),
    source,
  );
  assert.throws(
    () => parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      pretty,
    ),
    /not canonical/,
  );

  const reversed =
    JSON.stringify(
      Object.fromEntries(
        Object.entries(parsed).reverse(),
      ),
    );
  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordJson(
      reversed,
    ),
    source,
  );
  assert.throws(
    () => parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      reversed,
    ),
    /not canonical/,
  );

  assert.throws(
    () => parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      `${canonical}\n`,
    ),
    /not canonical/,
  );
});

test('canonical parse rejects duplicate JSON keys even when JSON.parse would resolve them to the same semantic record', async () => {
  const source = await record();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      source,
    );
  const duplicatePurpose =
    canonical.replace(
      '{',
      '{"purpose":"completed-provider-evaluation-record",',
    );

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordJson(
      duplicatePurpose,
    ),
    source,
  );
  assert.throws(
    () => parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      duplicatePurpose,
    ),
    /not canonical/,
  );
});

test('parse rejects invalid JSON and semantic record tampering', async () => {
  const source = await record();
  assert.throws(
    () => parseWorksheetReviewRouteEvaluationRecordJson(
      '{not-json',
    ),
    /JSON is invalid/,
  );

  const tampered = structuredClone(source);
  tampered.recordDigest =
    `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => parseWorksheetReviewRouteEvaluationRecordJson(
      JSON.stringify(tampered),
    ),
    /digest does not match/,
  );

  const metricTamper = structuredClone(source);
  metricTamper.report.summary.decisionAccuracy = 0;
  assert.throws(
    () => parseWorksheetReviewRouteEvaluationRecordJson(
      JSON.stringify(metricTamper),
    ),
    /summary does not match/,
  );
});

test('serialization rejects a non-finite numeric tamper through the record validation boundary', async () => {
  const source = await record();
  const tampered = structuredClone(source);
  tampered.report.summary.decisionAccuracy =
    Number.NaN;

  assert.throws(
    () => serializeWorksheetReviewRouteEvaluationRecordJson(
      tampered,
    ),
    /non-finite|summary does not match|finite value/,
  );
});

test('codec operations do not mutate source records', async () => {
  const source = await record();
  const before = structuredClone(source);

  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      source,
    );
  parseWorksheetReviewRouteEvaluationRecordJson(
    canonical,
  );
  parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
    canonical,
  );
  createWorksheetReviewRouteEvaluationRecordFileName(
    source,
  );
  prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(
    source,
  );

  assert.deepEqual(source, before);
});
