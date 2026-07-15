export type DiagnosticSeverity = 'error';
export type XmlMode = 'none' | 'spreadsheet2003' | 'invalid';
export type DiagnosticCode = 'MMI_FILE_NOT_FOUND' | 'MMI_INVALID_XML' | 'MMI_SHEET_NOT_FOUND' | 'MMI_PATH_OUTSIDE_BOUNDARY';

export interface DiagnosticRange {
  start: number;
  end: number;
}

export interface EmbedDiagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  range: DiagnosticRange;
  source: 'markdown-matrix-injector';
  priority: number;
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
  /** false when file exists but resolves outside the workspace boundary (spec P4). */
  containmentOk?: boolean;
  range?: DiagnosticRange;
}

const DEFAULT_RANGE: DiagnosticRange = { start: 0, end: 0 };
const DIAGNOSTIC_SOURCE = 'markdown-matrix-injector';

const DIAGNOSTIC_PRIORITY: Record<DiagnosticCode, number> = {
  MMI_FILE_NOT_FOUND: 0,
  MMI_PATH_OUTSIDE_BOUNDARY: 0,
  MMI_INVALID_XML: 1,
  MMI_SHEET_NOT_FOUND: 2,
};

export function validateEmbedDiagnostics(input: ValidateEmbedDiagnosticsInput): EmbedDiagnostic[] {
  const diagnostics: EmbedDiagnostic[] = [];
  const fallbackRange = input.range ?? buildRangeFromQuery(input.query.raw);

  if (!input.fileExists) {
    diagnostics.push(
      createDiagnostic(
        'MMI_FILE_NOT_FOUND',
        `Embedded file not found: ${input.query.filepath}`,
        buildSubjectRange(input.query.raw, input.query.filepath, fallbackRange),
      ),
    );
  }

  // Emit containment diagnostic only when the file exists (it was found on disk)
  // but lies outside the workspace boundary — spec P4 Containment MUST.
  // When the file doesn't exist, MMI_FILE_NOT_FOUND already covers it.
  if (input.fileExists && input.containmentOk === false) {
    diagnostics.push(
      createDiagnostic(
        'MMI_PATH_OUTSIDE_BOUNDARY',
        `Source file is outside workspace boundary: ${input.query.filepath}`,
        buildSubjectRange(input.query.raw, input.query.filepath, fallbackRange),
      ),
    );
  }

  if (input.xmlMode === 'invalid') {
    diagnostics.push(
      createDiagnostic(
        'MMI_INVALID_XML',
        'Invalid XML Spreadsheet: only Spreadsheet 2003 XML is supported.',
        buildSubjectRange(input.query.raw, input.query.filepath, fallbackRange),
      ),
    );
  }

  if (input.query.target && input.sheetExists === false) {
    diagnostics.push(
      createDiagnostic(
        'MMI_SHEET_NOT_FOUND',
        `Sheet not found: ${input.query.target}`,
        buildSubjectRange(input.query.raw, input.query.target, fallbackRange),
      ),
    );
  }

  return diagnostics.sort(compareDiagnostics);
}

function createDiagnostic(code: DiagnosticCode, message: string, range: DiagnosticRange): EmbedDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    range,
    source: DIAGNOSTIC_SOURCE,
    priority: DIAGNOSTIC_PRIORITY[code],
  };
}

function compareDiagnostics(left: EmbedDiagnostic, right: EmbedDiagnostic): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  if (left.range.start !== right.range.start) {
    return left.range.start - right.range.start;
  }

  return left.range.end - right.range.end;
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

function buildSubjectRange(raw: string, subject: string, fallbackRange: DiagnosticRange): DiagnosticRange {
  if (!raw || !subject) {
    return fallbackRange;
  }

  const start = raw.indexOf(subject);
  if (start === -1) {
    return fallbackRange;
  }

  return {
    start,
    end: start + subject.length - 1,
  };
}
