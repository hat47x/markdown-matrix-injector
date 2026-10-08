export const SEARCH_OBSERVATION_SCHEMA = 'mmi.search-observation/v1' as const;
export const SEARCH_OBSERVATION_STORE_SCHEMA = 'mmi.search-observation-store/v1' as const;
export const SEARCH_OBSERVATION_CLASSIFIER_VERSION = 1 as const;

export type SearchObservationClass =
  | 'found'
  | 'unsupported-op'
  | 'notation'
  | 'abbreviation'
  | 'description'
  | 'no-such-table'
  | 'other';

export type SearchObservationOutcome =
  | 'picked-candidate'
  | 'picked-near-miss'
  | 'picked-after-edit'
  | 'cancelled';

export type SearchObservationAlias =
  | 'none'
  | 'offered-declined'
  | 'offered-accepted';

export interface SearchObservationFinal {
  status: 'candidates' | 'unsupported' | 'no-match' | 'needs-more-input';
  class: SearchObservationClass;
  tokens: number;
  latinWords: number;
  question: boolean;
  /** Present only after explicit includeText opt-in. */
  text?: string;
}

export interface SearchObservationPicked {
  rank: number;
  fit?: number;
  basis: 'name' | 'paraphrase' | 'semantic' | 'glossary' | 'near-miss';
}

export interface SearchObservationRecord {
  schema: typeof SEARCH_OBSERVATION_SCHEMA;
  classifierVersion: typeof SEARCH_OBSERVATION_CLASSIFIER_VERSION;
  /** Local calendar date only; no time-of-day. */
  at: string;
  queries: number;
  final: SearchObservationFinal;
  outcome: SearchObservationOutcome;
  picked?: SearchObservationPicked;
  alias: SearchObservationAlias;
  ms: number;
}

export interface SearchObservationStoreV1 {
  schema: typeof SEARCH_OBSERVATION_STORE_SCHEMA;
  records: SearchObservationRecord[];
}
