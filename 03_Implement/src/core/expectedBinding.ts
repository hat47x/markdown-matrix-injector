/**
 * `x-table` / `x-name` -- the Excel table or defined name a reference was
 * taken from (ADR-0022, option B). Experimental keys: renderers that do not
 * know them ignore them (spec P5), so they never change what is displayed.
 * They let a checker notice that the declaration the range came from has moved
 * or changed, e.g. an Excel table grew by ten rows and the reference still
 * ends where it used to.
 *
 *   ![[./設計.xlsx#権限|A1:F13?header=first&x-table=T_権限]]
 *   ![[./設計.xlsx#権限|A1:F13?x-name=権限一覧]]
 *
 * The check compares the reference's sheet and range with the declaration's
 * current definition. It reads structure only, never values.
 */
import type { EmbedQuery } from '../parser/embedSyntax.js';
import type { WorkbookStructure } from '../importAssist/workbookStructure.js';
import { cellRangeToA1, parseRangeToCellRange } from './tableGeometry.js';
import type { CellRange } from './sheetSource.js';

export const EXPECTED_TABLE_PARAM = 'x-table';
export const EXPECTED_NAME_PARAM = 'x-name';

export type BindingKind = 'table' | 'name';

export interface BindingResult {
  kind: BindingKind;
  declared: string;
  /**
   * `ok`: same sheet and range. `narrower`: the reference is a part of the declaration (a row limit or
   * a cut-off the author may have chosen). `missing` / `moved` / `changed`: the declaration is gone, on
   * another sheet, or no longer covers the reference.
   */
  status: 'ok' | 'narrower' | 'missing' | 'moved' | 'changed' | 'not-a-range';
  /** The declaration's current A1 range, when it has one. */
  current?: string;
  referenced?: string;
}

const same = (a: CellRange, b: CellRange): boolean =>
  a.startRow === b.startRow && a.startCol === b.startCol && a.endRow === b.endRow && a.endCol === b.endCol;

const contains = (outer: CellRange, inner: CellRange): boolean =>
  inner.startRow >= outer.startRow && inner.endRow <= outer.endRow && inner.startCol >= outer.startCol && inner.endCol <= outer.endCol;

const fold = (value: string): string => value.normalize('NFKC').toLowerCase();

/** Compare each `x-table` / `x-name` of the reference with the declaration as it is now. Empty when neither key is present. */
export function checkExpectedBindings(query: EmbedQuery, structure: WorkbookStructure): BindingResult[] {
  const results: BindingResult[] = [];
  const sheet = query.target;
  let referenced: CellRange | undefined;
  try {
    referenced = query.range ? parseRangeToCellRange(query.range) : undefined;
  } catch {
    referenced = undefined;
  }

  const judge = (kind: BindingKind, declared: string, found: { sheet?: string; range?: CellRange; withoutTotals?: CellRange } | undefined): BindingResult => {
    if (!found) return { kind, declared, status: 'missing' };
    if (!found.range || !found.sheet) return { kind, declared, status: 'not-a-range' };
    const current = cellRangeToA1(found.range);
    if (!referenced || sheet === undefined) return { kind, declared, status: 'not-a-range', current };
    const base = { kind, declared, current, referenced: query.range };
    if (fold(found.sheet) !== fold(sheet)) return { ...base, status: 'moved' };
    // A selection normally leaves the totals row out of an Excel table; either way matches the declaration.
    if (same(found.range, referenced) || (found.withoutTotals && same(found.withoutTotals, referenced))) return { ...base, status: 'ok' };
    return { ...base, status: contains(found.range, referenced) ? 'narrower' : 'changed' };
  };

  const table = query.params.get(EXPECTED_TABLE_PARAM);
  if (table !== null) {
    const found = structure.tables.find((item) => fold(item.name) === fold(table));
    results.push(judge('table', table, found && {
      sheet: found.sheet,
      range: found.range,
      ...(found.totalsRowCount > 0 ? { withoutTotals: { ...found.range, endRow: found.range.endRow - found.totalsRowCount } } : {}),
    }));
  }
  const name = query.params.get(EXPECTED_NAME_PARAM);
  if (name !== null) {
    // A sheet-scoped name is found by the sheet the reference points at first.
    const candidates = structure.names.filter((item) => fold(item.name) === fold(name));
    const found = candidates.find((item) => item.scope !== undefined && sheet !== undefined && fold(item.scope) === fold(sheet))
      ?? candidates.find((item) => item.scope === undefined)
      ?? candidates[0];
    results.push(judge('name', name, found && found.kind !== 'broken' ? { sheet: found.sheet, range: found.range } : undefined));
  }
  return results;
}

const LABEL: Record<BindingKind, string> = { table: 'Excelテーブル', name: '名前' };

/** One readable sentence per binding that is not `ok`; `narrower` is informational. */
export function describeBinding(result: BindingResult): string {
  const label = `${LABEL[result.kind]}「${result.declared}」`;
  switch (result.status) {
    case 'missing':
      return `${label}は、いま正本にありません（削除または改名された可能性があります）。参照の範囲は、これの定義から取った値のままです。`;
    case 'not-a-range':
      return `${label}は、範囲を指していないか、この参照の範囲と比べられません。`;
    case 'moved':
      return `${label}は、参照のシートとは別のシートへ移っています（現在 ${result.current}）。`;
    case 'changed':
      return `${label}の現在の範囲は ${result.current} で、参照の ${result.referenced} と合いません。行や列が増減した可能性があります。`;
    case 'narrower':
      return `${label}の現在の範囲は ${result.current} で、参照の ${result.referenced} はその一部です。意図した絞り込みでなければ、範囲を見直してください。`;
    default:
      return `${label}と一致しています。`;
  }
}

/** Severity of one binding in a diagnostic. `ok` produces none. */
export function bindingSeverity(result: BindingResult): 'warning' | 'information' | undefined {
  if (result.status === 'ok') return undefined;
  return result.status === 'narrower' || result.status === 'not-a-range' ? 'information' : 'warning';
}
