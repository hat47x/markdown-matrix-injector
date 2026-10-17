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
  /** Workbook read failures named by `workbookLoader` before SheetJS guesses at the cause. */
  workbookEmpty: { file: string };
  workbookPasswordProtected: { file: string };
  workbookNotWorkbook: { file: string };
  workbookDamaged: { file: string; reason: string };
  /** CSV byte-decode failures named by `workbookLoader`'s `decodeCsv`. */
  csvUtf16: Record<string, never>;
  csvInvalidUtf8: Record<string, never>;
  csvUnreadableEncoding: Record<string, never>;
  binding: {
    kind: 'table' | 'name';
    declared: string;
    status: 'ok' | 'narrower' | 'missing' | 'moved' | 'changed' | 'not-a-range';
    current?: string;
    referenced?: string;
  };
  /** How many rows continued below the reference when it was written, against now (`x-below`, issue #521). */
  belowChanged: {
    expected: number;
    actual: number;
    grew: boolean;
  };
}

export type MessageId = keyof MessageParamsMap;

/** One locale's wording. Every id the English table defines may be left out of another locale (it then falls back). */
export type MessageTable = { [K in MessageId]: (params: MessageParamsMap[K]) => string };
