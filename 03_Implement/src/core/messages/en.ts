import { capNames, similarNames } from './helpers.js';
import type { AllowedValues, MessageTable } from './types.js';

const quoted = (names: readonly string[], more: number): string =>
  names.map((name) => `"${name}"`).join(', ') + (more > 0 ? ` and ${more} more` : '');

function allowed(values: AllowedValues): string {
  switch (values.kind) {
    case 'enum':
      return values.values.join(' / ');
    case 'header':
      return 'first / none / a row number';
    case 'columns':
      return 'comma-separated column letters, e.g. A,C';
    case 'formatColumn':
      return 'column:format, e.g. E:json';
    default:
      return 'at least one character';
  }
}

const bindingLabel = (kind: 'table' | 'name', declared: string): string =>
  `${kind === 'table' ? 'Excel table' : 'Defined name'} "${declared}"`;

/** The reference wording. A locale that leaves an id out falls back to this table, so it must be complete. */
export const enMessages: MessageTable = {
  sheetNotFound: ({ sheet, available }) => {
    const base = `Sheet not found: ${sheet}`;
    if (!available || available.length === 0) return base;
    const similar = similarNames(sheet, available);
    if (similar.length > 0) {
      const { shown, more } = capNames(similar);
      return `${base}. The sheet may have been renamed; similar names: ${quoted(shown, more)}`;
    }
    const { shown, more } = capNames(available);
    return `${base}. Sheets in this workbook: ${quoted(shown, more)}`;
  },
  sourceNotResolved: ({ path }) => `Unable to resolve source file: ${path}`,
  fileNotFound: ({ path }) => `Embedded file not found: ${path}`,
  outsideBoundary: ({ path, boundary }) =>
    `Source file is outside workspace boundary: ${path}` + (boundary ? ` (boundary: ${boundary})` : ''),
  invalidXml: () => 'Invalid XML Spreadsheet: only Spreadsheet 2003 XML is supported.',
  tableTooLarge: ({ cellCount, limit }) =>
    `Reference too large to render as a table (${cellCount} cells exceeds the ` +
    `${limit}-cell limit). mode=table does not lift this limit -- narrow ` +
    'the range or split the reference.',
  timeBudgetExceeded: ({ elapsed, limit }) =>
    `Table work exceeded its cooperative time budget (${elapsed}ms > ${limit}ms). Reduce the range or use card mode.`,
  headersNotCheckable: () =>
    '`x-headers` is compared with the header row, but this reference has no header row. Specify `header=first` (or a row number).',
  headersMismatch: ({ shown, more }) => {
    const items = shown.map(
      (item) => `column ${item.position}: expected "${item.expected ?? '(none)'}" -> actual "${item.actual ?? '(none)'}"`,
    );
    const rest = more > 0 ? ` and ${more} more column(s)` : '';
    return (
      `The headers differ from when the reference was written (${items.join('; ')}${rest}). ` +
      'A column may have been inserted, deleted or reordered in the source, so the reference may point at a different column.'
    );
  },
  unknownParam: ({ key, suggestion }) => `"${key}" is not a known parameter and is ignored. Did you mean "${suggestion}"?`,
  invalidParam: ({ key, value, allowed: values, suggestion }) =>
    `The value "${value}" is not valid for ${key} (${allowed(values)}). It is ignored.` +
    (suggestion !== undefined ? ` Did you mean "${suggestion}"?` : ''),
  workbookEmpty: ({ file }) =>
    `Cannot read ${file}: the file is empty. It may still be saving or syncing; wait until it finishes, then refresh the preview.`,
  workbookPasswordProtected: ({ file }) =>
    `Cannot read ${file}: the file looks password-protected. MMI reads only unprotected saved workbooks; remove the password or reference an unprotected copy.`,
  workbookNotWorkbook: ({ file }) =>
    `Cannot read ${file}: the content is not an Excel workbook. Check that it was saved as an Excel Workbook (.xlsx).`,
  workbookDamaged: ({ file, reason }) =>
    `Cannot read ${file}: the file is damaged or still being written (${reason}). Save it again in Excel, then refresh the preview.`,
  csvUtf16: () => 'Save the CSV as UTF-8 or CP932. UTF-16 is not supported.',
  csvInvalidUtf8: () => 'The CSV UTF-8 data is invalid.',
  csvUnreadableEncoding: () => 'Cannot read the CSV as UTF-8 or CP932. Check the encoding of the file.',
  binding: ({ kind, declared, status, current, referenced }) => {
    const label = bindingLabel(kind, declared);
    switch (status) {
      case 'missing':
        return `${label} is not in the source now (it may have been deleted or renamed). The reference's range is still the value taken from its old definition.`;
      case 'not-a-range':
        return `${label} does not point at a range, or cannot be compared with this reference's range.`;
      case 'moved':
        return `${label} has moved to a different sheet than the reference's (now ${current}).`;
      case 'changed':
        return `The current range of ${label} is ${current}, which no longer matches the reference's ${referenced}. Rows or columns may have been added or removed.`;
      case 'narrower':
        return `The current range of ${label} is ${current}, and the reference's ${referenced} is a part of it. Review the range unless the narrowing is intended.`;
      default:
        return `${label} matches.`;
    }
  },
  belowChanged: ({ expected, actual, grew }) =>
    grew
      ? `${actual} row(s) with values now continue below the reference; ${expected} when the reference was written. ` +
        'A row may have been inserted inside the range, so the last row the reference shows may no longer be the one that was chosen. ' +
        'Review the range, then update `x-below` (or remove the key) if the change is intended.'
      : `${actual} row(s) with values now continue below the reference; ${expected} when the reference was written. ` +
        'Rows below the range may have been removed or moved. ' +
        'Review the range, then update `x-below` (or remove the key) if the change is intended.',
};
