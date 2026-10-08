/**
 * Builds the record of one search session. The recorder only watches: it never alters a result,
 * and the record it builds holds no request text unless `includeText` was turned on.
 */
import type { CompileResult } from '../nlQuery/compiler.js';
import { classifyResult } from './classify.js';
import { OBSERVATION_SCHEMA, type AliasResult, type ObservationRecord, type Outcome } from './types.js';

export interface PickedCandidate {
  source: 'candidate' | 'near-miss';
  /** 1-based position in the list the candidate came from. */
  rank: number;
  fit?: number;
  basis?: string;
}

export interface RecorderOptions {
  /** Defaults to false: the request text is not recorded. */
  includeText?: boolean;
  clock?: () => number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Local `YYYY-MM-DD`. */
export function dayOf(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class SearchSessionRecorder {
  private readonly clock: () => number;
  private readonly includeText: boolean;
  private readonly startedAt: number;
  private queries = 0;
  private last: { result: CompileResult; text: string } | undefined;
  private picked: PickedCandidate | undefined;

  constructor(options: RecorderOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.includeText = options.includeText === true;
    this.startedAt = this.clock();
  }

  /** Called with every search that ran in the session. The result is read, never changed. */
  onResult(result: CompileResult, text: string): void {
    this.queries += 1;
    this.last = { result, text };
  }

  onPick(picked: PickedCandidate): void {
    this.picked = picked;
  }

  get hasPick(): boolean {
    return this.picked !== undefined;
  }

  /** `undefined` when no search ran (the box was opened and closed empty): nothing to record. */
  build(alias: AliasResult = 'none'): ObservationRecord | undefined {
    if (!this.last) return undefined;
    const classification = classifyResult(this.last.result);
    const outcome: Outcome = !this.picked
      ? 'cancelled'
      : this.picked.source === 'near-miss'
        ? 'picked-near-miss'
        : this.queries > 1
          ? 'picked-after-edit'
          : 'picked-candidate';
    return {
      schema: OBSERVATION_SCHEMA,
      at: dayOf(this.startedAt),
      queries: this.queries,
      final: {
        status: this.last.result.status,
        class: classification.class,
        tokens: classification.tokens,
        latinWords: classification.latinWords,
        question: classification.question,
        ...(this.includeText ? { text: this.last.text } : {}),
      },
      outcome,
      ...(this.picked
        ? { picked: { rank: this.picked.rank, ...(this.picked.fit !== undefined ? { fit: this.picked.fit } : {}), basis: this.picked.basis ?? 'name' } }
        : {}),
      alias,
      ms: Math.max(0, this.clock() - this.startedAt),
    };
  }
}
