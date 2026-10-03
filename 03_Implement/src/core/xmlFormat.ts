export const XML_SPREADSHEET_SIGNATURES = [
  '<?mso-application progid="Excel.Sheet"?>',
  'urn:schemas-microsoft-com:office:spreadsheet',
] as const;

export function isXmlSpreadsheet2003(text: string): boolean {
  return XML_SPREADSHEET_SIGNATURES.some((signature) =>
    text.includes(signature));
}
