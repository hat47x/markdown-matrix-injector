/**
 * DeliveryManifestRecord represents one manifest row.
 * sourcePath: original file path, sheet: referenced sheet name, range: referenced cell range,
 * reason: why the file was treated as an attachment, caption: display caption, id: embed anchor id.
 */
export type DeliveryManifestRecord = {
  sourcePath: string;
  sheet: string;
  range: string;
  reason: string;
  caption: string;
  id: string;
};

const HEADER_COLUMNS: ReadonlyArray<keyof DeliveryManifestRecord> = [
  'sourcePath',
  'sheet',
  'range',
  'reason',
  'caption',
  'id',
];

function escapeCsvField(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

export function generateDeliveryManifest(records: ReadonlyArray<DeliveryManifestRecord>): string {
  const header = HEADER_COLUMNS.join(',');

  if (records.length === 0) {
    return header;
  }

  const rows = records.map((record) =>
    HEADER_COLUMNS.map((column) => escapeCsvField(record[column])).join(','),
  );

  return [header, ...rows].join('\n');
}
