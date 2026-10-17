/**
 * Source Adapter: cell hyperlinks from .xlsx/.xlsm.
 *
 * A worksheet states each hyperlink explicitly: the cell reference, and either
 * an external relationship target or an in-workbook `location`. This adapter
 * only reports what the package says. It never follows, opens or resolves a
 * link target, and it does not judge whether the target exists.
 */
import { createHash } from 'node:crypto';

import type { Candidate, Claim } from '../core/candidate.js';
import { candidateProblem, fingerprintOf } from '../core/candidate.js';
import { readZip, ZipError, type ZipEntry } from '../core/zipReader.js';
import {
  attributes,
  entryText,
  relationshipsOf,
  workbookSheets,
  type Relationship,
} from './excelNoteAdapter.js';

export const LINK_ADAPTER_ALGORITHM = 'mmi.excel-hyperlink-reader';
export const LINK_ADAPTER_VERSION = '1';

export type LinkDiagnosticCode =
  | 'MMI_LINK_PACKAGE_UNREADABLE'
  | 'MMI_LINK_SHEET_UNREADABLE'
  | 'MMI_LINK_TARGET_MISSING'
  | 'MMI_LINK_REF_MISSING';

export interface LinkDiagnostic {
  code: LinkDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  sheet?: string;
  part?: string;
  cell?: string;
}

/** `external-url` has a URI scheme, `external-path` is another file, `workbook-location` stays inside the workbook. */
export type LinkTargetKind = 'external-url' | 'external-path' | 'workbook-location';

export interface ExcelLink {
  ordinal: number;
  sheet: string;
  /** A1 cell or range exactly as written in the worksheet. */
  ref: string;
  targetKind: LinkTargetKind;
  /** Relationship target for external links, `location` for in-workbook links. */
  target: string;
  /** Sub-location (fragment/bookmark) of an external target, when stated. */
  location?: string;
  display?: string;
  tooltip?: string;
  /** Digest of target, location and display, independent of cell position. */
  contentDigest: string;
}

export interface LinkReadResult {
  links: ExcelLink[];
  diagnostics: LinkDiagnostic[];
}

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\\)/iu;

function contentDigest(parts: readonly (string | undefined)[]): string {
  const hash = createHash('sha256');
  parts.forEach((part, index) => {
    if (index > 0) hash.update('\u0000', 'utf8');
    hash.update(part ?? '', 'utf8');
  });
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Read cell hyperlinks from one OOXML package.
 *
 * A damaged worksheet is reported and does not stop other sheets.
 */
export function readExcelLinks(bytes: Uint8Array): LinkReadResult {
  const result: LinkReadResult = { links: [], diagnostics: [] };
  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(bytes);
  } catch (error) {
    result.diagnostics.push({
      code: 'MMI_LINK_PACKAGE_UNREADABLE',
      severity: 'error',
      message: error instanceof ZipError || error instanceof Error
        ? error.message
        : String(error),
    });
    return result;
  }

  for (const sheet of workbookSheets(zip)) {
    const entry = zip.get(sheet.part);
    if (!entry) continue;
    let xml: string;
    let relationships: Relationship[];
    try {
      xml = entryText(entry);
      relationships = relationshipsOf(zip, sheet.part);
    } catch (error) {
      result.diagnostics.push({
        code: 'MMI_LINK_SHEET_UNREADABLE',
        severity: 'warning',
        sheet: sheet.name,
        part: sheet.part,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const block = /<(?:\w+:)?hyperlinks\b[^>]*>([\s\S]*?)<\/(?:\w+:)?hyperlinks>/u
      .exec(xml)?.[1];
    if (block === undefined) continue;
    const byId = new Map(relationships.map((item) => [item.id, item]));

    for (const match of block.matchAll(/<(?:\w+:)?hyperlink\b[^>]*>/gu)) {
      const props = attributes(match[0]);
      const ref = props.ref?.trim();
      if (!ref) {
        result.diagnostics.push({
          code: 'MMI_LINK_REF_MISSING',
          severity: 'warning',
          sheet: sheet.name,
          part: sheet.part,
          message: 'hyperlink has no cell ref',
        });
        continue;
      }
      const relationshipId = Object.entries(props).find(
        ([key]) => key === 'r:id' || key.endsWith(':id'),
      )?.[1];
      const location = props.location?.trim() || undefined;
      let targetKind: LinkTargetKind;
      let target: string;
      if (relationshipId !== undefined) {
        const relationship = byId.get(relationshipId);
        if (!relationship || relationship.target === '') {
          result.diagnostics.push({
            code: 'MMI_LINK_TARGET_MISSING',
            severity: 'warning',
            sheet: sheet.name,
            part: sheet.part,
            cell: ref,
            message:
              `hyperlink ${ref} refers to missing relationship ${relationshipId}`,
          });
          continue;
        }
        target = relationship.target;
        targetKind = URI_SCHEME.test(target) ? 'external-url' : 'external-path';
      } else if (location !== undefined) {
        target = location;
        targetKind = 'workbook-location';
      } else {
        result.diagnostics.push({
          code: 'MMI_LINK_TARGET_MISSING',
          severity: 'warning',
          sheet: sheet.name,
          part: sheet.part,
          cell: ref,
          message: `hyperlink ${ref} has neither a relationship nor a location`,
        });
        continue;
      }
      const display = props.display;
      const tooltip = props.tooltip;
      result.links.push({
        ordinal: result.links.length + 1,
        sheet: sheet.name,
        ref,
        targetKind,
        target,
        ...(targetKind !== 'workbook-location' && location !== undefined
          ? { location }
          : {}),
        ...(display !== undefined ? { display } : {}),
        ...(tooltip !== undefined ? { tooltip } : {}),
        contentDigest: contentDigest([
          targetKind,
          target,
          targetKind !== 'workbook-location' ? location : undefined,
          display,
        ]),
      });
    }
  }
  return result;
}

export interface LinkCandidateInput {
  source: string;
  sourceDigest: string;
  links: readonly ExcelLink[];
}

export function linkCandidates(input: LinkCandidateInput): Candidate[] {
  return input.links.map((link) => {
    const observed = (
      aspect: string,
      value: Claim['value'],
      reasonCode: string,
    ): Claim => ({
      aspect,
      value,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode,
    });
    const claims: Claim[] = [
      observed('location', link.ref, 'hyperlink-ref'),
      observed('target-kind', link.targetKind, 'hyperlink-target-kind'),
      observed('target', link.target, 'hyperlink-target'),
    ];
    if (link.location !== undefined) {
      claims.push(observed('target-location', link.location, 'hyperlink-location'));
    }
    if (link.display !== undefined) {
      claims.push(observed('display', link.display, 'hyperlink-display'));
    }
    if (link.tooltip !== undefined) {
      claims.push(observed('tooltip', link.tooltip, 'hyperlink-tooltip'));
    }
    const candidate: Candidate = {
      kind: 'link',
      locator: {
        source: input.source,
        sourceDigest: input.sourceDigest,
        sheet: link.sheet,
        range: link.ref,
      },
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      claims,
      provenance: {
        algorithm: LINK_ADAPTER_ALGORITHM,
        run: {
          execution: 'deterministic',
          inputDigest: input.sourceDigest,
          config: { sourceModel: 'ooxml-worksheet-hyperlinks' },
          implementationVersion: LINK_ADAPTER_VERSION,
        },
      },
      fingerprint: fingerprintOf(
        'excel-hyperlink-target-display-v1',
        `${link.targetKind}\u0000${link.target}\u0000${link.location ?? ''}\u0000${link.display ?? ''}`,
      ),
      scores: [],
    };
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `invalid Link Candidate at ${link.sheet}!${link.ref}: ${problem}`,
      );
    }
    return candidate;
  });
}
