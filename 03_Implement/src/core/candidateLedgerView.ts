import type { Candidate } from './candidate.js';
import type { ImportLedger, LedgerMatch } from './importLedger.js';
import { matchLedger } from './importLedger.js';

export type CandidateLedgerFilter = 'all' | 'unimported' | 'exclude-exact';

export interface CandidateLedgerView {
  candidate: Candidate;
  ledger: LedgerMatch;
}

/**
 * Join discovered Candidates with the project import ledger without mutating
 * either side. `same-content` remains visible: equal bytes at another
 * occurrence are evidence, not permission to inherit review state.
 */
export function candidateLedgerView(
  candidates: readonly Candidate[],
  ledger: ImportLedger,
  filter: CandidateLedgerFilter = 'all',
): CandidateLedgerView[] {
  const joined = candidates.map((candidate) => ({ candidate, ledger: matchLedger(candidate, ledger) }));
  switch (filter) {
    case 'unimported':
      // Changed occurrences need review again, and same-content occurrences
      // have never themselves been reviewed, so both remain actionable.
      return joined.filter(({ ledger: match }) => match.state !== 'exact-occurrence');
    case 'exclude-exact':
      // Today exact means exact occurrence. This named mode is kept separate
      // from `unimported` so future review/freshness states can diverge without
      // changing CLI semantics silently.
      return joined.filter(({ ledger: match }) => match.state !== 'exact-occurrence');
    case 'all':
      return joined;
  }
}
