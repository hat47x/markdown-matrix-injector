import {
  candidateProblem,
  type Candidate,
} from '../core/candidate.js';
import type {
  CandidateReviewInventoryItem,
} from './candidateReviewInventory.js';
import {
  candidateReviewSessionKey,
} from './candidateReviewSession.js';

export interface CandidateReviewProviderContext {
  sourcePath: string;
  sourceLabel: string;
  sourceDigest: string;
}

export interface CandidateReviewProviderLane {
  /** Stable provider id; must match Candidate provenance.run.provider. */
  providerId: string;
  collect(
    context: CandidateReviewProviderContext,
  ): Promise<readonly CandidateReviewInventoryItem[]>;
}

export interface CandidateReviewProviderFailure {
  providerId: string;
  message: string;
}

export interface CandidateReviewProviderRefreshSummary {
  completedProviders: readonly string[];
  failedProviders: readonly CandidateReviewProviderFailure[];
  cachedItemCount: number;
}

function contextKey(context: CandidateReviewProviderContext): string {
  return [
    context.sourceLabel,
    context.sourceDigest,
  ].join('\u0000');
}

/**
 * Memory-only cache for provider-dependent review Candidates.
 *
 * Source digest is part of the key, so a changed source never reuses provider
 * output from older bytes. Nothing is persisted and no provider result is
 * promoted into Authority data.
 */
export class CandidateReviewProviderCache {
  private readonly byContext = new Map<
    string,
    Map<string, readonly CandidateReviewInventoryItem[]>
  >();

  get(
    context: CandidateReviewProviderContext,
  ): CandidateReviewInventoryItem[] {
    const lanes = this.byContext.get(contextKey(context));
    if (!lanes) return [];
    return deduplicateItems(
      [...lanes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, items]) => items),
    );
  }

  replace(
    context: CandidateReviewProviderContext,
    providerId: string,
    items: readonly CandidateReviewInventoryItem[],
  ): void {
    let lanes = this.byContext.get(contextKey(context));
    if (!lanes) {
      lanes = new Map();
      this.byContext.set(contextKey(context), lanes);
    }
    lanes.set(providerId, [...items]);
  }

  clear(): void {
    this.byContext.clear();
  }
}

export interface CandidateReviewProviderRefresh {
  /** Already-computed provider Candidates. Safe to use synchronously. */
  cachedItems: CandidateReviewInventoryItem[];
  /**
   * Background refresh. Callers deliberately do not need to await this before
   * opening or continuing a review session.
   */
  settled: Promise<CandidateReviewProviderRefreshSummary>;
}

export function startCandidateReviewProviderRefresh(
  context: CandidateReviewProviderContext,
  lanes: readonly CandidateReviewProviderLane[],
  cache: CandidateReviewProviderCache,
): CandidateReviewProviderRefresh {
  const cachedItems = cache.get(context);

  const settled = Promise.all(
    lanes.map(async (lane) => {
      try {
        const items = await lane.collect(context);
        const validated = validateProviderItems(
          context,
          lane.providerId,
          items,
        );
        cache.replace(context, lane.providerId, validated);
        return {
          providerId: lane.providerId,
          ok: true as const,
        };
      } catch (error) {
        return {
          providerId: lane.providerId,
          ok: false as const,
          message: error instanceof Error
            ? error.message
            : String(error),
        };
      }
    }),
  ).then((results) => ({
    completedProviders: results
      .filter((result) => result.ok)
      .map((result) => result.providerId),
    failedProviders: results.flatMap((result) =>
      result.ok
        ? []
        : [{
            providerId: result.providerId,
            message: result.message,
          }]),
    cachedItemCount: cache.get(context).length,
  }));

  return { cachedItems, settled };
}

function validateProviderItems(
  context: CandidateReviewProviderContext,
  providerId: string,
  items: readonly CandidateReviewInventoryItem[],
): CandidateReviewInventoryItem[] {
  if (!providerId.trim()) {
    throw new Error('Candidate review provider id must not be empty');
  }

  const seen = new Set<string>();
  const validated: CandidateReviewInventoryItem[] = [];
  for (const item of items) {
    const candidate = item.candidate;
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `Invalid Candidate from provider ${providerId}: ${problem}`,
      );
    }
    if (candidate.execution !== 'provider-dependent') {
      throw new Error(
        `Provider ${providerId} returned a non-provider-dependent Candidate`,
      );
    }
    const run = candidate.provenance.run;
    if (
      run.execution !== 'provider-dependent'
      || run.provider !== providerId
    ) {
      throw new Error(
        `Provider ${providerId} Candidate provenance does not match the lane`,
      );
    }
    if (
      candidate.locator.source !== context.sourceLabel
      || candidate.locator.sourceDigest !== context.sourceDigest
    ) {
      throw new Error(
        `Provider ${providerId} Candidate does not match the current source snapshot`,
      );
    }
    if (candidate.status === 'abstained') {
      continue;
    }

    const key = candidateReviewSessionKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    validated.push(item);
  }
  return validated;
}

function deduplicateItems(
  items: readonly CandidateReviewInventoryItem[],
): CandidateReviewInventoryItem[] {
  const seen = new Set<string>();
  const out: CandidateReviewInventoryItem[] = [];
  for (const item of items) {
    const key = candidateReviewSessionKey(item.candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Provider identity is part of a review-session key for provider-dependent
 * Candidates. Two providers may make the same semantic proposal, but their
 * Evidence and scores must remain separately reviewable rather than being
 * silently combined.
 */
export function candidateReviewProviderIdentity(
  candidate: Candidate,
): string {
  if (
    candidate.execution !== 'provider-dependent'
    || candidate.provenance.run.execution !== 'provider-dependent'
  ) {
    return '';
  }
  const run = candidate.provenance.run;
  return [
    run.provider,
    run.model,
    run.artifactVersion,
  ].join('\u0000');
}
