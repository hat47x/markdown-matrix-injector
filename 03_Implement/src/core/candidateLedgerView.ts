import type { Candidate } from './candidate.js';
import { classify, type Ledger, type LedgerState } from './importLedger.js';

export type CandidateLedgerFilter = 'all' | 'unimported' | 'exclude-imported';

export interface CandidateLedgerViewItem {
  candidate: Candidate;
  ledgerState: LedgerState;
}

/**
 * Join discovered Candidates with the project import ledger without mutating
 * either side. Content equality at a different occurrence stays actionable:
 * it is duplicate evidence, not inherited review state (ADR-0021 D3).
 */
export function candidateLedgerView(
  candidates: readonly Candidate[],
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  filter: CandidateLedgerFilter = 'all',
): CandidateLedgerViewItem[] {
  const joined = candidates.map((candidate) => ({
    candidate,
    ledgerState: classify(ledger, ledgerPath, absoluteSource, candidate),
  }));

  switch (filter) {
    case 'unimported':
      return joined.filter(({ ledgerState }) =>
        ledgerState === 'unimported' || ledgerState === 'duplicate');
    case 'exclude-imported':
      return joined.filter(({ ledgerState }) => ledgerState !== 'imported');
    case 'all':
      return joined;
  }
}
