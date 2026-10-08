import type { Candidate, CompileResult } from '../nlQuery/compiler.js';
import { classifySearchObservation } from './classify.js';
import {
  SEARCH_OBSERVATION_CLASSIFIER_VERSION,
  SEARCH_OBSERVATION_SCHEMA,
  type SearchObservationAlias,
  type SearchObservationOutcome,
  type SearchObservationPicked,
  type SearchObservationRecord,
} from './types.js';

export interface BuildSearchObservationInput {
  finalQuery: string;
  result: CompileResult;
  queries: number;
  outcome: SearchObservationOutcome;
  alias?: SearchObservationAlias;
  picked?: { candidate: Candidate; rank: number; nearMiss?: boolean };
  startedAtMs: number;
  endedAtMs: number;
  localDate: string;
  includeText?: boolean;
}

export function buildSearchObservation(
  input: BuildSearchObservationInput,
): SearchObservationRecord {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.localDate)) {
    throw new Error('search observation localDate must be YYYY-MM-DD');
  }
  if (!Number.isInteger(input.queries) || input.queries < 1) {
    throw new Error('search observation queries must be a positive integer');
  }

  return {
    schema: SEARCH_OBSERVATION_SCHEMA,
    classifierVersion: SEARCH_OBSERVATION_CLASSIFIER_VERSION,
    at: input.localDate,
    queries: input.queries,
    final: classifySearchObservation(
      input.finalQuery,
      input.result,
      input.includeText === true,
    ),
    outcome: input.outcome,
    ...(input.picked ? { picked: pickedOf(input.picked) } : {}),
    alias: input.alias ?? 'none',
    ms: Math.max(0, Math.round(input.endedAtMs - input.startedAtMs)),
  };
}

function pickedOf(input: {
  candidate: Candidate;
  rank: number;
  nearMiss?: boolean;
}): SearchObservationPicked {
  if (!Number.isInteger(input.rank) || input.rank < 1) {
    throw new Error('search observation picked rank must be >= 1');
  }
  return {
    rank: input.rank,
    ...(input.candidate.fit !== undefined ? { fit: input.candidate.fit } : {}),
    basis: input.nearMiss
      ? 'near-miss'
      : input.candidate.basis ?? 'name',
  };
}
