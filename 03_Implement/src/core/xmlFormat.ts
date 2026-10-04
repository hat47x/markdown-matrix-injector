export const XML_SPREADSHEET_SIGNATURES = [
  '<?mso-application progid="Excel.Sheet"?>',
  'urn:schemas-microsoft-com:office:spreadsheet',
] as const;

export function isXmlSpreadsheet2003(text: string): boolean {
  return XML_SPREADSHEET_SIGNATURES.some((signature) =>
    text.includes(signature));
}

/**
 * Classifies XML Spreadsheet 2003 from source bytes without imposing the
 * stricter UTF-8-only rule used by generic XML Tree sources.
 *
 * The signatures are ASCII, so a replacement-tolerant UTF-8 decode is enough
 * for ASCII-compatible encodings. UTF-16 BOMs are handled explicitly.
 */
export function isXmlSpreadsheet2003Bytes(
  bytes: Uint8Array,
): boolean {
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes);
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(bytes);
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return isXmlSpreadsheet2003(text);
}

export function decodeGenericXmlUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'Generic XML Tree sources must be valid UTF-8. Convert the source without modifying the original before inspection.',
    );
  }
}
