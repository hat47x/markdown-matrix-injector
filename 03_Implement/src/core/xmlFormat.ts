export const XML_SPREADSHEET_SIGNATURES = [
  '<?mso-application progid="Excel.Sheet"?>',
  'urn:schemas-microsoft-com:office:spreadsheet',
] as const;

export function isXmlSpreadsheet2003(text: string): boolean {
  return XML_SPREADSHEET_SIGNATURES.some((signature) =>
    text.includes(signature));
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
