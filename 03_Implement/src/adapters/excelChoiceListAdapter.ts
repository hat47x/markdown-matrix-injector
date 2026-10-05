import { SaxesParser, type SaxesTagNS } from 'saxes';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
  type Claim,
} from '../core/candidate.js';
import { parseRangeToCellRange, rangeDimensions } from '../core/tableGeometry.js';
import type { WorkbookData } from '../core/workbookLoader.js';
import { readZip, ZipError, type ZipEntry } from '../core/zipReader.js';

export const CHOICE_LIST_ADAPTER_ALGORITHM =
  'mmi.excel-data-validation-list';
export const CHOICE_LIST_ADAPTER_VERSION = '2';
export const CHOICE_LIST_MAX_REFERENCED_CELLS = 10_000;

const SPREADSHEET_NS =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const X14_NS =
  'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
const XM_NS =
  'http://schemas.microsoft.com/office/excel/2006/main';

export type ChoiceListSourceKind =
  | 'inline'
  | 'range'
  | 'formula'
  | 'missing';

export interface ChoiceListResolvedSource {
  sheet: string;
  range: string;
}

export interface ExcelChoiceList {
  ordinal: number;
  sheet: string;
  range: string;
  formula1?: string;
  sourceKind: ChoiceListSourceKind;
  choices?: readonly string[];
  resolvedSource?: ChoiceListResolvedSource;
  allowBlank: boolean;
  candidate: Candidate;
}

export type ChoiceListDiagnosticCode =
  | 'MMI_CHOICE_LIST_NOT_A_PACKAGE'
  | 'MMI_CHOICE_LIST_PACKAGE_UNSUPPORTED'
  | 'MMI_CHOICE_LIST_WORKBOOK_MISSING'
  | 'MMI_CHOICE_LIST_WORKSHEET_MISSING'
  | 'MMI_CHOICE_LIST_XML_UNREADABLE'
  | 'MMI_CHOICE_LIST_RANGE_MISSING'
  | 'MMI_CHOICE_LIST_FORMULA_MISSING';

export interface ChoiceListDiagnostic {
  code: ChoiceListDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  sheet?: string;
  part?: string;
}

export interface ChoiceListReadResult {
  lists: ExcelChoiceList[];
  diagnostics: ChoiceListDiagnostic[];
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

interface WorkbookSheet {
  name: string;
  part: string;
}

interface RawListValidation {
  sqref: string;
  formula1: string;
  allowBlank: boolean;
}

type XmlAttribute = {
  local: string;
  uri: string;
  name: string;
  value: string;
};

function xmlText(entry: ZipEntry): string {
  return entry.read().toString('utf8').replace(/^\uFEFF/u, '');
}

function attributes(tag: SaxesTagNS): XmlAttribute[] {
  return Object.values(tag.attributes) as unknown as XmlAttribute[];
}

function attribute(
  tag: SaxesTagNS,
  local: string,
  uri?: string,
): string | undefined {
  return attributes(tag).find(
    (item) =>
      item.local === local
      && (uri === undefined || item.uri === uri),
  )?.value;
}

function resolveTarget(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = ownerPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') base.pop();
    else if (segment !== '.' && segment !== '') base.push(segment);
  }
  return base.join('/');
}

function relationshipsOf(
  zip: Map<string, ZipEntry>,
  part: string,
): Relationship[] {
  const directory = part.split('/').slice(0, -1).join('/');
  const filename = part.split('/').at(-1) ?? '';
  const relsPart =
    `${directory ? `${directory}/` : ''}_rels/${filename}.rels`;
  const entry = zip.get(relsPart);
  if (!entry) return [];

  const relationships: Relationship[] = [];
  const parser = new SaxesParser<{ xmlns: true }>({ xmlns: true });
  parser.on('opentag', (tag: SaxesTagNS) => {
    if (tag.local !== 'Relationship') return;
    const id = attribute(tag, 'Id') ?? '';
    const type = attribute(tag, 'Type') ?? '';
    const target = attribute(tag, 'Target') ?? '';
    const external = attribute(tag, 'TargetMode') === 'External';
    if (!id || !type || !target) return;
    relationships.push({
      id,
      type,
      target: external ? target : resolveTarget(part, target),
      external,
    });
  });
  parser.write(xmlText(entry)).close();
  return relationships;
}

function workbookSheets(
  zip: Map<string, ZipEntry>,
): WorkbookSheet[] {
  const workbookPart = 'xl/workbook.xml';
  const workbook = zip.get(workbookPart);
  if (!workbook) return [];

  const worksheetRelations = new Map(
    relationshipsOf(zip, workbookPart)
      .filter(
        (relationship) =>
          !relationship.external
          && relationship.type.endsWith('/worksheet'),
      )
      .map((relationship) => [
        relationship.id,
        relationship.target,
      ]),
  );

  const sheets: WorkbookSheet[] = [];
  const parser = new SaxesParser<{ xmlns: true }>({ xmlns: true });
  parser.on('opentag', (tag: SaxesTagNS) => {
    if (
      tag.local !== 'sheet'
      || tag.uri !== SPREADSHEET_NS
    ) {
      return;
    }
    const name = attribute(tag, 'name') ?? '';
    const relationshipId =
      attribute(tag, 'id', OFFICE_REL_NS)
      ?? attributes(tag).find(
        (item) => item.name === 'r:id',
      )?.value;
    const part = relationshipId
      ? worksheetRelations.get(relationshipId)
      : undefined;
    if (name && part) sheets.push({ name, part });
  });
  parser.write(xmlText(workbook)).close();
  return sheets;
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function parseWorksheetListValidations(
  xml: string,
): RawListValidation[] {
  const raw: RawListValidation[] = [];
  const parser = new SaxesParser<{ xmlns: true }>({ xmlns: true });

  let current:
    | {
        namespace: string;
        type: string;
        sqref: string;
        formula1: string;
        allowBlank: boolean;
      }
    | undefined;
  let capture: 'formula1' | 'sqref' | undefined;

  const append = (value: string): void => {
    if (!current || !capture) return;
    current[capture] += value;
  };

  parser.on('opentag', (tag: SaxesTagNS) => {
    if (
      tag.local === 'dataValidation'
      && (tag.uri === SPREADSHEET_NS || tag.uri === X14_NS)
    ) {
      current = {
        namespace: tag.uri,
        type: attribute(tag, 'type') ?? '',
        sqref: attribute(tag, 'sqref') ?? '',
        formula1: '',
        allowBlank: parseBoolean(attribute(tag, 'allowBlank')),
      };
      capture = undefined;
      return;
    }
    if (!current) return;

    if (
      current.namespace === SPREADSHEET_NS
      && tag.uri === SPREADSHEET_NS
      && tag.local === 'formula1'
    ) {
      capture = 'formula1';
      return;
    }
    if (
      current.namespace === X14_NS
      && tag.uri === XM_NS
      && tag.local === 'f'
    ) {
      capture = 'formula1';
      return;
    }
    if (
      current.namespace === X14_NS
      && tag.uri === XM_NS
      && tag.local === 'sqref'
    ) {
      current.sqref = '';
      capture = 'sqref';
    }
  });
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', (tag: SaxesTagNS) => {
    if (!current) return;
    if (
      (capture === 'formula1'
        && (
          tag.local === 'formula1'
          || (tag.local === 'f' && tag.uri === XM_NS)
        ))
      || (
        capture === 'sqref'
        && tag.local === 'sqref'
        && tag.uri === XM_NS
      )
    ) {
      capture = undefined;
    }

    if (
      tag.local === 'dataValidation'
      && tag.uri === current.namespace
    ) {
      if (current.type === 'list') {
        raw.push({
          sqref: current.sqref.trim(),
          formula1: current.formula1.trim(),
          allowBlank: current.allowBlank,
        });
      }
      current = undefined;
      capture = undefined;
    }
  });

  parser.write(xml).close();
  return raw;
}

export function inlineChoiceValues(
  formula1: string,
): string[] | undefined {
  const formula = formula1.trim();
  if (
    formula.length < 2
    || formula[0] !== '"'
    || formula.at(-1) !== '"'
  ) {
    return undefined;
  }
  const body = formula.slice(1, -1).replace(/""/gu, '"');
  return body.split(',');
}

interface ChoiceSourceResolution {
  sourceKind: ChoiceListSourceKind;
  choices?: string[];
  resolvedSource?: ChoiceListResolvedSource;
}

export function directChoiceRangeReference(
  formula1: string,
  currentSheet: string,
): ChoiceListResolvedSource | undefined {
  let formula = formula1.trim();
  if (formula.startsWith('=')) formula = formula.slice(1).trim();
  if (
    !formula
    || formula.startsWith('"')
    || formula.includes('[')
    || formula.includes(']')
  ) {
    return undefined;
  }

  const separator = formula.lastIndexOf('!');
  let sheet = currentSheet;
  let rangeToken = formula;
  if (separator >= 0) {
    const sheetToken = formula.slice(0, separator).trim();
    rangeToken = formula.slice(separator + 1).trim();
    if (!sheetToken) return undefined;
    if (sheetToken.startsWith("'")) {
      if (!sheetToken.endsWith("'") || sheetToken.length < 2) {
        return undefined;
      }
      sheet = sheetToken.slice(1, -1).replace(/''/gu, "'");
    } else {
      if (/['"]/u.test(sheetToken)) return undefined;
      sheet = sheetToken;
    }
  }

  const range = rangeToken.replace(/\$/gu, '');
  if (
    !/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/iu.test(range)
  ) {
    return undefined;
  }
  return { sheet, range: range.toUpperCase() };
}

function resolveWorkbookSheet(
  workbook: WorkbookData,
  requestedName: string,
): { name: string; sheet: WorkbookData['sheets'][string] } | undefined {
  const exact = workbook.sheets[requestedName];
  if (exact) return { name: requestedName, sheet: exact };

  const matches = Object.keys(workbook.sheets).filter(
    (name) => name.toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
  );
  if (matches.length !== 1) return undefined;
  const name = matches[0];
  return { name, sheet: workbook.sheets[name] };
}

function sourceKindOf(
  formula1: string,
  currentSheet: string,
  workbook?: WorkbookData,
): ChoiceSourceResolution {
  if (!formula1) return { sourceKind: 'missing' };

  const inline = inlineChoiceValues(formula1);
  if (inline) return { sourceKind: 'inline', choices: inline };

  const reference = directChoiceRangeReference(formula1, currentSheet);
  if (!reference || !workbook) return { sourceKind: 'formula' };

  const resolved = resolveWorkbookSheet(workbook, reference.sheet);
  if (!resolved) return { sourceKind: 'formula' };

  let parsedRange;
  try {
    parsedRange = parseRangeToCellRange(reference.range);
  } catch {
    return { sourceKind: 'formula' };
  }

  const dimensions = rangeDimensions(parsedRange);
  if (
    dimensions.cellCount < 1
    || dimensions.cellCount > CHOICE_LIST_MAX_REFERENCED_CELLS
    || (dimensions.rowCount > 1 && dimensions.columnCount > 1)
  ) {
    return { sourceKind: 'formula' };
  }

  const choices: string[] = [];
  if (dimensions.rowCount === 1) {
    for (
      let col = parsedRange.startCol;
      col <= parsedRange.endCol;
      col += 1
    ) {
      choices.push(
        resolved.sheet.cellAt(parsedRange.startRow, col)?.text ?? '',
      );
    }
  } else {
    for (
      let row = parsedRange.startRow;
      row <= parsedRange.endRow;
      row += 1
    ) {
      choices.push(
        resolved.sheet.cellAt(row, parsedRange.startCol)?.text ?? '',
      );
    }
  }

  return {
    sourceKind: 'range',
    choices,
    resolvedSource: {
      sheet: resolved.name,
      range: reference.range,
    },
  };
}

function candidateFor(
  source: string,
  sourceDigest: string,
  sheet: string,
  range: string,
  validation: RawListValidation,
  parsed: ChoiceSourceResolution,
): Candidate {
  const claims: Claim[] = [
    {
      aspect: 'location',
      value: range,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'data-validation-sqref',
    },
    {
      aspect: 'validation-type',
      value: 'list',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'data-validation-type',
    },
    {
      aspect: 'allow-blank',
      value: String(validation.allowBlank),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'data-validation-attribute',
    },
    ...(validation.formula1
      ? [{
          aspect: 'validation-source',
          value: validation.formula1,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'data-validation-formula1',
        }]
      : [{
          aspect: 'validation-source',
          status: 'abstained' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'data-validation-formula1-missing',
        }]),
    ...(parsed.resolvedSource
      ? [{
          aspect: 'choice-source-location',
          value: `${parsed.resolvedSource.sheet}!${parsed.resolvedSource.range}`,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'data-validation-direct-range-reference',
        }]
      : []),
    ...(parsed.choices
      ? [{
          aspect: 'choices',
          value: parsed.choices,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: parsed.sourceKind === 'range'
            ? 'data-validation-range-values'
            : 'data-validation-inline-list',
        }]
      : [{
          aspect: 'choices',
          status: 'abstained' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: parsed.sourceKind === 'formula'
            ? 'data-validation-formula-unresolved'
            : 'data-validation-formula1-missing',
          ...(validation.formula1
            ? {
                evidence: [{
                  code: 'formula1',
                  detail: validation.formula1,
                }],
              }
            : {}),
        }]),
  ];

  const fingerprintMaterial = parsed.choices
    ? parsed.resolvedSource
      ? [
          'range',
          parsed.resolvedSource.sheet,
          parsed.resolvedSource.range,
          ...parsed.choices,
        ]
      : ['inline', ...parsed.choices]
    : [parsed.sourceKind, validation.formula1];

  const candidate: Candidate = {
    kind: 'choice-list',
    locator: {
      source,
      sourceDigest,
      sheet,
      range,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: CHOICE_LIST_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          format: 'xlsx-data-validation',
          sourceKind: parsed.sourceKind,
        },
        implementationVersion: CHOICE_LIST_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'excel-data-validation-list-v1',
      JSON.stringify(fingerprintMaterial),
    ),
    scores: [],
  };

  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(
      `invalid choice-list Candidate at ${sheet}!${range}: ${problem}`,
    );
  }
  return candidate;
}

export function readExcelChoiceLists(
  bytes: Uint8Array,
  source: string,
  sourceDigest: string,
  workbook?: WorkbookData,
): ChoiceListReadResult {
  const result: ChoiceListReadResult = {
    lists: [],
    diagnostics: [],
  };

  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(bytes);
  } catch (error) {
    const unsupported =
      error instanceof ZipError && error.code !== 'not-a-zip';
    result.diagnostics.push({
      code: unsupported
        ? 'MMI_CHOICE_LIST_PACKAGE_UNSUPPORTED'
        : 'MMI_CHOICE_LIST_NOT_A_PACKAGE',
      severity: 'error',
      message: error instanceof Error
        ? error.message
        : String(error),
    });
    return result;
  }

  let sheets: WorkbookSheet[];
  try {
    sheets = workbookSheets(zip);
  } catch (error) {
    result.diagnostics.push({
      code: 'MMI_CHOICE_LIST_XML_UNREADABLE',
      severity: 'error',
      message: `workbook XML: ${error instanceof Error ? error.message : String(error)}`,
      part: 'xl/workbook.xml',
    });
    return result;
  }
  if (sheets.length === 0) {
    result.diagnostics.push({
      code: 'MMI_CHOICE_LIST_WORKBOOK_MISSING',
      severity: 'error',
      message: 'workbook has no readable worksheet relationships',
      part: 'xl/workbook.xml',
    });
    return result;
  }

  for (const sheet of sheets) {
    const entry = zip.get(sheet.part);
    if (!entry) {
      result.diagnostics.push({
        code: 'MMI_CHOICE_LIST_WORKSHEET_MISSING',
        severity: 'warning',
        message: `worksheet part is missing: ${sheet.part}`,
        sheet: sheet.name,
        part: sheet.part,
      });
      continue;
    }

    let validations: RawListValidation[];
    try {
      validations = parseWorksheetListValidations(xmlText(entry));
    } catch (error) {
      result.diagnostics.push({
        code: 'MMI_CHOICE_LIST_XML_UNREADABLE',
        severity: 'warning',
        message: error instanceof Error
          ? error.message
          : String(error),
        sheet: sheet.name,
        part: sheet.part,
      });
      continue;
    }

    for (const validation of validations) {
      const ranges = validation.sqref
        .split(/\s+/u)
        .filter(Boolean);
      if (ranges.length === 0) {
        result.diagnostics.push({
          code: 'MMI_CHOICE_LIST_RANGE_MISSING',
          severity: 'warning',
          message: 'list data validation has no sqref',
          sheet: sheet.name,
          part: sheet.part,
        });
        continue;
      }
      if (!validation.formula1) {
        result.diagnostics.push({
          code: 'MMI_CHOICE_LIST_FORMULA_MISSING',
          severity: 'warning',
          message:
            `list data validation at ${ranges.join(' ')} has no formula1`,
          sheet: sheet.name,
          part: sheet.part,
        });
      }

      for (const range of ranges) {
        const parsed = sourceKindOf(
          validation.formula1,
          sheet.name,
          workbook,
        );
        const candidate = candidateFor(
          source,
          sourceDigest,
          sheet.name,
          range,
          validation,
          parsed,
        );
        result.lists.push({
          ordinal: result.lists.length + 1,
          sheet: sheet.name,
          range,
          ...(validation.formula1
            ? { formula1: validation.formula1 }
            : {}),
          sourceKind: parsed.sourceKind,
          ...(parsed.choices ? { choices: parsed.choices } : {}),
          ...(parsed.resolvedSource
            ? { resolvedSource: parsed.resolvedSource }
            : {}),
          allowBlank: validation.allowBlank,
          candidate,
        });
      }
    }
  }

  return result;
}
