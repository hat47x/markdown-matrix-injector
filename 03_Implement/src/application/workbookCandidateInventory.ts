import fs from 'node:fs';

import {
  imageCandidates,
  readExcelImages,
  shapeCandidates,
  type ImageReadResult,
  type TableRect,
} from '../adapters/excelImageAdapter.js';
import {
  readExcelChoiceLists,
  type ChoiceListReadResult,
} from '../adapters/excelChoiceListAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import {
  readTabularHierarchy,
  type TabularHierarchyConfig,
  type TabularHierarchyResult,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import {
  loadWorkbook,
  type WorkbookData,
} from '../core/workbookLoader.js';
import { detectTableRegions } from '../importAssist/tableRegions.js';

export interface WorkbookTableCandidate {
  candidate: Candidate;
  sheet: string;
  range: string;
  title?: string;
}

export interface WorkbookHierarchyCandidates {
  sheetName: string;
  result: TabularHierarchyResult;
}

export interface WorkbookCandidateInventoryOptions {
  tabularHierarchy?: TabularHierarchyConfig;
  /** Omit to apply the configured hierarchy to every sheet. */
  hierarchySheets?: readonly string[];
  /** Skip base Candidate generation when a host only needs hierarchy review. */
  hierarchyOnly?: boolean;
}

export interface WorkbookCandidateInventory {
  sourceDigest: string;
  workbook: WorkbookData;
  isPackage: boolean;
  tableItems: readonly WorkbookTableCandidate[];
  tablesBySheet: Readonly<Record<string, readonly TableRect[]>>;
  imageRead: ImageReadResult;
  choiceRead: ChoiceListReadResult;
  imageCandidateList: readonly Candidate[];
  shapeCandidateList: readonly Candidate[];
  hierarchies: readonly WorkbookHierarchyCandidates[];
  candidates: readonly Candidate[];
}

function emptyImageRead(sourcePath: string): ImageReadResult {
  return {
    images: [],
    shapes: [],
    snapshotHints: [],
    diagnostics: /\.xls$/iu.test(sourcePath)
      ? [{
          code: 'MMI_IMAGE_PACKAGE_UNSUPPORTED',
          severity: 'warning',
          message: 'binary .xls: embedded pictures are not read',
        }]
      : [],
    skipped: { shapes: 0, charts: 0 },
  };
}

/**
 * Build deterministic workbook Candidates once for all hosts.
 *
 * CLI and VS Code may render or act on the result differently, but Candidate
 * identity, provenance and source-derived Evidence must come from this shared
 * Application snapshot.
 */
export function collectWorkbookCandidates(
  sourcePath: string,
  sourceLabel: string,
  options: WorkbookCandidateInventoryOptions = {},
): WorkbookCandidateInventory {
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const workbook = loadWorkbook({ absolutePath: sourcePath });

  const requestedHierarchySheets = options.tabularHierarchy
    ? options.hierarchySheets ?? Object.keys(workbook.sheets)
    : [];
  for (const sheetName of requestedHierarchySheets) {
    if (!workbook.sheets[sheetName]) {
      throw new Error(`Hierarchy review sheet not found: ${sheetName}`);
    }
  }
  const hierarchies = options.tabularHierarchy
    ? requestedHierarchySheets.map((sheetName) => ({
        sheetName,
        result: readTabularHierarchy({
          source: sourceLabel,
          sourceDigest,
          sheetName,
          sheet: workbook.sheets[sheetName],
          config: options.tabularHierarchy!,
        }),
      }))
    : [];

  if (options.hierarchyOnly) {
    const empty = emptyImageRead(sourcePath);
    return {
      sourceDigest,
      workbook,
      isPackage: /\.(xlsx|xlsm)$/iu.test(sourcePath),
      tableItems: [],
      tablesBySheet: {},
      imageRead: empty,
      choiceRead: { lists: [], diagnostics: [] },
      imageCandidateList: [],
      shapeCandidateList: [],
      hierarchies,
      candidates: hierarchies.flatMap(({ result }) => result.candidates),
    };
  }

  const detected = Object.entries(workbook.sheets).map(
    ([name, sheet]) => ({
      name,
      regions: detectTableRegions(
        name,
        sheet,
        { maxValueSample: 0 },
      ),
    }),
  );
  const tablesBySheet: Record<string, TableRect[]> = Object.fromEntries(
    detected.map(({ name, regions }) => [
      name,
      regions.map((region) => ({
        a1: region.a1,
        startRow: region.range.startRow,
        startCol: region.range.startCol,
        endRow: region.range.endRow,
        endCol: region.range.endCol,
      })),
    ]),
  );

  const tableItems: WorkbookTableCandidate[] = Object.entries(
    workbook.sheets,
  ).flatMap(([sheetName, sheet]) =>
    tableCandidates({
      source: sourceLabel,
      sourceDigest,
      sheetName,
      sheet,
    }).map((candidate) => {
      const title = candidate.claims.find(
        (claim) => claim.aspect === 'title',
      )?.value;
      return {
        candidate,
        sheet: sheetName,
        range: candidate.locator.range ?? '',
        ...(typeof title === 'string' ? { title } : {}),
      };
    }));

  const isPackage = /\.(xlsx|xlsm)$/iu.test(sourcePath);
  const packageBytes = isPackage
    ? fs.readFileSync(sourcePath)
    : undefined;
  const imageRead = packageBytes
    ? readExcelImages(packageBytes)
    : emptyImageRead(sourcePath);
  const choiceRead = packageBytes
    ? readExcelChoiceLists(
        packageBytes,
        sourceLabel,
        sourceDigest,
        workbook,
      )
    : { lists: [], diagnostics: [] };

  const imageCandidateList = imageCandidates({
    source: sourceLabel,
    sourceDigest,
    images: imageRead.images,
    tablesBySheet,
  });
  const shapeCandidateList = shapeCandidates({
    source: sourceLabel,
    sourceDigest,
    shapes: imageRead.shapes,
  });

  return {
    sourceDigest,
    workbook,
    isPackage,
    tableItems,
    tablesBySheet,
    imageRead,
    choiceRead,
    imageCandidateList,
    shapeCandidateList,
    hierarchies,
    candidates: [
      ...tableItems.map((item) => item.candidate),
      ...imageCandidateList,
      ...shapeCandidateList,
      ...choiceRead.lists.map((item) => item.candidate),
      ...hierarchies.flatMap(({ result }) => result.candidates),
    ],
  };
}
