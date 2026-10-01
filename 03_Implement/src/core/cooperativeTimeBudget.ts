export interface CooperativeTimeBudget {
  /** Accounts for work and checks the wall clock at the configured cadence. */
  consume(units?: number): void;
  /** Performs an immediate wall-clock check regardless of cadence. */
  check(): void;
}

export interface CooperativeTimeBudgetOptions {
  limitMs: number;
  checkEveryUnits?: number;
  now?: () => number;
}

export class CooperativeTimeBudgetExceededError extends Error {
  readonly code = 'MMI_TABLE_TIME_BUDGET_EXCEEDED' as const;

  constructor(
    readonly elapsedMs: number,
    readonly limitMs: number,
  ) {
    super(
      'Table work exceeded its cooperative time budget (' + formatMs(elapsedMs) + 'ms > ' +
        formatMs(limitMs) + 'ms). Reduce the range or use card mode.',
    );
    this.name = 'CooperativeTimeBudgetExceededError';
  }
}

/**
 * Cooperative deadline for synchronous table work.
 *
 * This is intentionally not called a strict timeout: JavaScript cannot
 * pre-empt an individual synchronous SheetJS parse or a slow cellAt call.
 * Instead, bounded loops call consume(), so MMI can stop between work units.
 * A worker/process boundary is still required for a true wall-clock cap over
 * non-cooperative third-party code.
 */
export function createCooperativeTimeBudget(options: CooperativeTimeBudgetOptions): CooperativeTimeBudget {
  if (!Number.isFinite(options.limitMs) || options.limitMs < 0) {
    throw new Error('limitMs must be a finite non-negative number.');
  }
  const checkEveryUnits = options.checkEveryUnits ?? 256;
  if (!Number.isInteger(checkEveryUnits) || checkEveryUnits < 1) {
    throw new Error('checkEveryUnits must be an integer >= 1.');
  }

  const now = options.now ?? Date.now;
  const startedAt = now();
  let pendingUnits = 0;

  const check = (): void => {
    const elapsedMs = Math.max(0, now() - startedAt);
    if (elapsedMs > options.limitMs) {
      throw new CooperativeTimeBudgetExceededError(elapsedMs, options.limitMs);
    }
  };

  return {
    consume(units = 1): void {
      if (!Number.isFinite(units) || units < 0) {
        throw new Error('work units must be a finite non-negative number.');
      }
      pendingUnits += units;
      if (pendingUnits >= checkEveryUnits) {
        pendingUnits %= checkEveryUnits;
        check();
      }
    },
    check,
  };
}

function formatMs(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
