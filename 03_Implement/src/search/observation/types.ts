/**
 * Records of the local search-demand observation (design: 02_Architecture/search-observation.md,
 * issue-0207). One record per search session. By construction a record holds features of the
 * request, never the request: the only way text enters is the explicit `includeText` opt-in.
 */
export const OBSERVATION_SCHEMA = 'mmi.search-observation/v1';

export const REQUEST_CLASSES = [
  'found',
  'unsupported-op',
  'notation',
  'abbreviation',
  'description',
  'no-such-table',
  'other',
] as const;
export type RequestClass = (typeof REQUEST_CLASSES)[number];

export const OUTCOMES = ['picked-candidate', 'picked-near-miss', 'picked-after-edit', 'cancelled'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type AliasResult = 'none' | 'offered-declined' | 'offered-accepted';

export type SearchStatus = 'candidates' | 'unsupported' | 'no-match' | 'needs-more-input';

export interface ObservationRecord {
  schema: typeof OBSERVATION_SCHEMA;
  /** Local date, `YYYY-MM-DD`. No time of day is kept. */
  at: string;
  /** Searches executed in the session (more than one means the person edited the request). */
  queries: number;
  final: {
    status: SearchStatus;
    class: RequestClass;
    /** Runs of kanji / katakana / Latin / digits in the request. */
    tokens: number;
    latinWords: number;
    question: boolean;
    /** Present only when the person turned `includeText` on. */
    text?: string;
  };
  outcome: Outcome;
  /** The candidate chosen; its table name is deliberately not kept. */
  picked?: { rank: number; fit?: number; basis: string };
  alias: AliasResult;
  /** How long the search box was open. */
  ms: number;
}
