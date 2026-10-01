/**
 * First Source Adapter: spreadsheet table regions -> `table-range` Candidates
 * (issue-0193). A pure function of the workbook model and the source digest.
 *
 * Epistemic footing, claim by claim:
 *   location  observed  M0  the range is a physical rectangle of source cells
 *   boundary  inferred  M1  where the table ends comes from rules (blank
 *                           rows/columns, detached or glued titles), not from
 *                           the source -- merged cells are read from `!merges`
 *   title     inferred  M1  a detached or merged first row above the block
 *   header    inferred  M1  only when the first row passes the header rules;
 *                           otherwise the method abstains (no value asserted)
 *
 * Everything is deterministic: the same source bytes, config and
 * implementation version give byte-identical candidates. No provider scores.
 *
 * Lives under src/adapters (not src/core) because it still depends on the
 * region detector in src/search; moving the detector under core is part of
 * the portable-core work (issue-0203).
 */
import type { Candidate, Claim, Evidence } from '../core/candidate.js';
import { fingerprintOf } from '../core/candidate.js';
import type { SheetSource } from '../core/sheetSource.js';
import { sliceRegion } from '../core/tableGeometry.js';
import { DEFAULT_MAX_SCAN_CELLS, detectRegions, type DetectedRegion } from '../search/regionDetector.js';

export const TABLE_ADAPTER_ALGORITHM = 'mmi.table-region-detector';
/** Bump when detection rules change in a way that can change output. */
export const TABLE_ADAPTER_VERSION = '1';

export interface TableAdapterInput {
  /** Source path as it should appear in locators and references. */
  source: string;
  /** SourceIdentity v1 digest of the source file bytes. */
  sourceDigest: string;
  sheetName: string;
  sheet: SheetSource;
  maxScanCells?: number;
}

export function tableCandidates(input: TableAdapterInput): Candidate[] {
  const maxScanCells = input.maxScanCells ?? DEFAULT_MAX_SCAN_CELLS;
  return detectRegions(input.sheetName, input.sheet, { maxScanCells, maxValueSample: 0 }).map((region) =>
    toCandidate(input, region, maxScanCells),
  );
}

function evidenceOf(region: DetectedRegion): Evidence[] {
  return region.reasons.map((code) => ({ code }));
}

function toCandidate(input: TableAdapterInput, region: DetectedRegion, maxScanCells: number): Candidate {
  const headerKnown = region.headerConfidence === 'likely' && region.headers !== undefined;
  const claims: Claim[] = [
    {
      aspect: 'location',
      value: region.a1,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'source-cell-coordinates',
    },
    {
      aspect: 'boundary',
      value: region.a1,
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'blank-row-column-regions',
      evidence: evidenceOf(region),
    },
  ];
  if (region.title !== undefined) {
    claims.push({
      aspect: 'title',
      value: region.title,
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'title-above-block',
      ...(region.titleA1 ? { evidence: [{ code: 'title-cell', detail: region.titleA1 }] } : {}),
    });
  }
  claims.push(
    headerKnown
      ? {
          aspect: 'header',
          value: region.headers as readonly string[],
          status: 'inferred',
          execution: 'deterministic',
          method: 'M1',
          reasonCode: 'header-rules-passed',
        }
      : {
          aspect: 'header',
          status: 'abstained',
          execution: 'deterministic',
          method: 'M1',
          reasonCode: region.headerConfidence === 'uncertain' ? 'header-uncertain' : 'no-header',
        },
  );

  const rows = sliceRegion(input.sheet, region.a1);
  const material = rows.map((row) => row.join('\u001f')).join('\u001e');
  const header = headerKnown ? '?header=first' : '';
  return {
    kind: 'table-range',
    locator: { source: input.source, sourceDigest: input.sourceDigest, sheet: input.sheetName, range: region.a1 },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims,
    provenance: {
      algorithm: TABLE_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: { maxScanCells },
        implementationVersion: TABLE_ADAPTER_VERSION,
      },
    },
    // Displayed cell values of the region, location excluded: a table that moves keeps its fingerprint.
    fingerprint: fingerprintOf('table-display-cells-v1', material),
    scores: [],
    reference: `![[${input.source}#${input.sheetName}|${region.a1}${header}]]`,
  };
}
