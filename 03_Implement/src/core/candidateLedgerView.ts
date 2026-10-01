import type { Candidate } from './candidate.js';
import {
  assessLedger,
  lineageCandidates,
  type Ledger,
  type LedgerState,
  type LineageCandidate,
} from './importLedger.js';

export type CandidateLedgerFilter = 'all' | 'unimported' | 'exclude-imported';

export interface CandidateLedgerViewItem {
  candidate: Candidate;
  ledgerState: LedgerState;
  staleClaims?: string[];
  lineageCandidates: LineageCandidate[];
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
  const joined = candidates.map((candidate) => {
    const assessment = assessLedger(ledger, ledgerPath, absoluteSource, candidate);
    return {
      candidate,
      ledgerState: assessment.state,
      ...(assessment.staleClaims ? { staleClaims: assessment.staleClaims } : {}),
      lineageCandidates: lineageCandidates(ledger, ledgerPath, absoluteSource, candidate),
    };
  });

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
