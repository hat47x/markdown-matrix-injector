import type { LogicalTable } from './renderTable.js';

export function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, '<br>');
}

export function logicalTableToGfm(table: LogicalTable): string {
  const width = Math.max(
    table.headers?.length ?? 0,
    ...table.bodyRows.map((row) => row.length),
    1,
  );
  const pad = (row: string[]) =>
    Array.from(
      { length: width },
      (_, index) => escapeMarkdownTableCell(row[index] ?? ''),
    );
  const header = table.headers
    ? pad(table.headers)
    : Array.from({ length: width }, () => '');
  const rows = [
    header,
    Array.from({ length: width }, () => '---'),
    ...table.bodyRows.map(pad),
  ];
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}
