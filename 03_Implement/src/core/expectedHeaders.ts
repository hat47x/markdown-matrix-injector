/**
 * `x-headers` -- the headers a reference expected to find when it was written
 * (ADR-0022, option B). It is an experimental key: renderers that do not know
 * it ignore it (spec P5), so it never changes what is displayed. It only lets
 * a checker notice that the table underneath has moved, e.g. a column was
 * inserted in Excel and `columns=C,T` now points at a different column.
 *
 *   ![[./設計.xlsx#権限|A1:F13?header=first&columns=A,C&x-headers=操作ID,申請者]]
 *
 * The value lists the displayed header row in order. A comma inside a header is
 * written `\,`, and a backslash `\\`.
 */
import type { EmbedQuery } from '../parser/embedSyntax.js';
import { buildLogicalTable } from './renderTable.js';
import type { WorkbookData } from './workbookLoader.js';

export const EXPECTED_HEADERS_PARAM = 'x-headers';

/** Split `a,b\,c` into `['a', 'b,c']`. */
export function parseHeaderList(value: string): string[] {
  const headers: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\' && (value[i + 1] === ',' || value[i + 1] === '\\')) {
      current += value[i + 1];
      i += 1;
    } else if (ch === ',') {
      headers.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  headers.push(current);
  return headers;
}

/** Inverse of `parseHeaderList`, for writing the value into a reference (still to be query-encoded). */
export function formatHeaderList(headers: readonly string[]): string {
  return headers.map((header) => header.replace(/\\/g, '\\\\').replace(/,/g, '\\,')).join(',');
}

/** Characters that would end or change a query value; everything else (Japanese, commas) stays readable. */
export function encodeHeaderListForQuery(value: string): string {
  return value.replace(/[%&+=#|[\]?\s]/gu, (ch) => encodeURIComponent(ch));
}

const normalize = (value: string | undefined): string => (value ?? '').replace(/\s+/gu, ' ').trim();

export interface HeaderMismatch {
  /** 1-based position among the displayed columns. */
  position: number;
  expected?: string;
  actual?: string;
}

export interface ExpectedHeadersResult {
  /** `not-checkable`: the table has no header row to compare with. */
  status: 'ok' | 'mismatch' | 'not-checkable';
  expected: string[];
  actual: string[];
  mismatches: HeaderMismatch[];
}

/** Compare the reference's `x-headers` with the table it resolves to now. `undefined` when the key is absent. */
export function checkExpectedHeaders(query: EmbedQuery, workbook: WorkbookData): ExpectedHeadersResult | undefined {
  const raw = query.params.get(EXPECTED_HEADERS_PARAM);
  if (raw === null) return undefined;
  const expected = parseHeaderList(raw).map(normalize);
  const headers = buildLogicalTable(query, workbook).headers;
  if (!headers) return { status: 'not-checkable', expected, actual: [], mismatches: [] };
  const actual = headers.map(normalize);
  const mismatches: HeaderMismatch[] = [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
    if (expected[i] !== actual[i]) {
      mismatches.push({
        position: i + 1,
        ...(expected[i] !== undefined ? { expected: expected[i] } : {}),
        ...(actual[i] !== undefined ? { actual: actual[i] } : {}),
      });
    }
  }
  return { status: mismatches.length === 0 ? 'ok' : 'mismatch', expected, actual, mismatches };
}

/** One readable sentence for a diagnostic; at most three columns are spelled out. */
export function describeHeaderMismatch(result: ExpectedHeadersResult): string {
  if (result.status === 'not-checkable') {
    return '`x-headers`は見出しの行と比べますが、この参照には見出しの行がありません。`header=first`（または行番号）を指定してください。';
  }
  const shown = result.mismatches.slice(0, 3).map((item) =>
    `${item.position}列目: 期待「${item.expected ?? '（なし）'}」→ 実際「${item.actual ?? '（なし）'}」`);
  const rest = result.mismatches.length > 3 ? ` ほか${result.mismatches.length - 3}列` : '';
  return `見出しが、参照を書いたときと違います（${shown.join('、')}${rest}）。正本の列の挿入・削除・並べ替えで、参照が別の列を指している可能性があります。`;
}
