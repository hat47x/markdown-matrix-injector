/** What a value may be, as described in an "invalid parameter value" message. */
export type AllowedValues =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'header' }
  | { kind: 'columns' }
  | { kind: 'formatColumn' }
  | { kind: 'nonEmpty' };

/**
 * Every user-facing message that has a stable identity, with the values it is built from. Messages carry values,
 * not finished sentences, so each locale can order and phrase them its own way.
 */
export interface MessageParamsMap {
  /** `available`, when given, lets the message point at the sheets that do exist (for example after a rename). */
  sheetNotFound: { sheet: string; available?: readonly string[] };
  sourceNotResolved: { path: string };
  fileNotFound: { path: string };
  outsideBoundary: { path: string; boundary?: string };
  invalidXml: Record<string, never>;
  tableTooLarge: { cellCount: number; limit: number };
  timeBudgetExceeded: { elapsed: string; limit: string };
  headersNotCheckable: Record<string, never>;
  headersMismatch: {
    shown: readonly { position: number; expected?: string; actual?: string }[];
    more: number;
  };
  unknownParam: { key: string; suggestion: string };
  invalidParam: { key: string; value: string; allowed: AllowedValues; suggestion?: string };
  binding: {
    kind: 'table' | 'name';
    declared: string;
    status: 'ok' | 'narrower' | 'missing' | 'moved' | 'changed' | 'not-a-range';
    current?: string;
    referenced?: string;
  };
}

export type MessageId = keyof MessageParamsMap;

/** One locale's wording. Every id the English table defines may be left out of another locale (it then falls back). */
export type MessageTable = { [K in MessageId]: (params: MessageParamsMap[K]) => string };
