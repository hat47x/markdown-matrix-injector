export type DiagnosticSeverity = 'error';
export type XmlMode = 'none' | 'spreadsheet2003' | 'invalid';

export interface DiagnosticRange {
  start: number;
  end: number;
}

export interface EmbedDiagnostic {
  severity: DiagnosticSeverity;
  code: 'MMI_FILE_NOT_FOUND' | 'MMI_INVALID_XML' | 'MMI_SHEET_NOT_FOUND';
  message: string;
  range: DiagnosticRange;
}

export interface DiagnosticsQuery {
  raw: string;
  filepath: string;
  target?: string;
}

export interface ValidateEmbedDiagnosticsInput {
  query: DiagnosticsQuery;
  fileExists: boolean;
  sheetExists?: boolean;
  xmlMode?: XmlMode;
  range?: DiagnosticRange;
}

const DEFAULT_RANGE: DiagnosticRange = { start: 0, end: 0 };

const DIAGNOSTIC_PRIORITY = {
  MMI_FILE_NOT_FOUND: 0,
  MMI_INVALID_XML: 1,
  MMI_SHEET_NOT_FOUND: 2,
} as const;

export function validateEmbedDiagnostics(input: ValidateEmbedDiagnosticsInput): EmbedDiagnostic[] {
  const range = input.range ?? buildRangeFromQuery(input.query.raw);
  const diagnostics: EmbedDiagnostic[] = [];

  if (!input.fileExists) {
    diagnostics.push({
      severity: 'error',
      code: 'MMI_FILE_NOT_FOUND',
      message: `Embedded file not found: ${input.query.filepath}`,
      range,
    });
  }

  if (input.xmlMode === 'invalid') {
    diagnostics.push({
      severity: 'error',
      code: 'MMI_INVALID_XML',
      message: 'Invalid XML Spreadsheet: only Spreadsheet 2003 XML is supported.',
      range,
    });
  }

  if (input.query.target && input.sheetExists === false) {
    diagnostics.push({
      severity: 'error',
      code: 'MMI_SHEET_NOT_FOUND',
      message: `Sheet not found: ${input.query.target}`,
      range,
    });
  }

  return diagnostics.sort((left, right) => DIAGNOSTIC_PRIORITY[left.code] - DIAGNOSTIC_PRIORITY[right.code]);
}

function buildRangeFromQuery(raw: string): DiagnosticRange {
  if (!raw) {
    return DEFAULT_RANGE;
  }

  return {
    start: 0,
    end: Math.max(raw.length - 1, 0),
  };
}
