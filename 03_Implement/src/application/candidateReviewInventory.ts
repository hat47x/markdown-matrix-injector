import fs from 'node:fs';

import type {
  FlatTextTreeMethod,
} from '../adapters/flatTextTreeStructuralizer.js';
import {
  imageCandidates,
  readExcelImages,
  shapeCandidates,
  type ExcelDrawingShape,
  type ExcelImage,
  type ImageDiagnostic,
  type TableRect,
} from '../adapters/excelImageAdapter.js';
import {
  readExcelChoiceLists,
  type ChoiceListDiagnostic,
  type ExcelChoiceList,
} from '../adapters/excelChoiceListAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import {
  readTabularHierarchy,
  type TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import { detectTableRegions } from '../importAssist/tableRegions.js';
import type { Candidate } from '../core/candidate.js';
import {
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
} from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import {
  collectStandaloneTreeCandidates,
} from './sourceCandidateInventory.js';

export type CandidateReviewInventoryItem =
  | {
      kind: 'table';
      candidate: Candidate;
      sheet: string;
      range: string;
      title?: string;
    }
  | {
      kind: 'image';
      candidate: Candidate;
      image: ExcelImage;
    }
  | {
      kind: 'choice-list';
      candidate: Candidate;
      choiceList: ExcelChoiceList;
    }
  | {
      kind: 'shape';
      candidate: Candidate;
      shape: ExcelDrawingShape;
    }
  | {
      kind: 'tree';
      candidate: Candidate;
      pointer: string;
      format: 'json' | 'yaml' | 'xml' | 'text' | 'tabular';
      nodeType:
        | 'object'
        | 'array'
        | 'element'
        | 'text-node'
        | 'table-node';
      childCount: number;
      leafCount: number;
      method?: FlatTextTreeMethod | TabularHierarchyConfig['mode'];
      sheet?: string;
      tabularHierarchy?: TabularHierarchyConfig;
    };

export interface CandidateReviewInventory {
  items: CandidateReviewInventoryItem[];
  imageDiagnostics: ImageDiagnostic[];
  choiceListDiagnostics?: ChoiceListDiagnostic[];
  tabularHierarchyAbstention?: {
    reasonCode: string;
    evidence: string[];
  };
}

export interface CandidateReviewInventoryOptions {
  tabularHierarchy?: {
    sheet: string;
    config: TabularHierarchyConfig;
  };
  hierarchyOnly?: boolean;
}

export function buildCandidateReviewInventory(
  sourcePath: string,
  sourceLabel: string,
  options: CandidateReviewInventoryOptions = {},
): CandidateReviewInventory {
  const standaloneTree = collectStandaloneTreeCandidates(
    sourcePath,
    sourceLabel,
  );
  if (standaloneTree) {
    return {
      items: standaloneTree.nodes
        .filter((node) => node.candidate.status !== 'abstained')
        .map((node) => ({
          kind: 'tree' as const,
          candidate: node.candidate,
          pointer: node.pointer,
          format: node.format,
          nodeType: node.nodeType,
          childCount: node.childPointers.length,
          leafCount: node.leafValues.length,
          ...(node.method ? { method: node.method } : {}),
        })),
      imageDiagnostics: [],
    };
  }

  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const workbook = loadWorkbook({ absolutePath: sourcePath });

  const hierarchyItems: CandidateReviewInventoryItem[] = [];
  let tabularHierarchyAbstention:
    | CandidateReviewInventory['tabularHierarchyAbstention']
    | undefined;
  if (options.tabularHierarchy) {
    const sheet = workbook.sheets[options.tabularHierarchy.sheet];
    if (!sheet) {
      throw new Error(
        `Hierarchy review sheet not found: ${options.tabularHierarchy.sheet}`,
      );
    }
    const hierarchy = readTabularHierarchy({
      source: sourceLabel,
      sourceDigest,
      sheetName: options.tabularHierarchy.sheet,
      sheet,
      config: options.tabularHierarchy.config,
    });
    if (hierarchy.status !== 'inferred') {
      tabularHierarchyAbstention = {
        reasonCode: hierarchy.reasonCode,
        evidence: hierarchy.candidates[0]?.claims
          .flatMap((claim) => claim.evidence ?? [])
          .map((evidence) =>
            evidence.detail
              ? `${evidence.code}: ${evidence.detail}`
              : evidence.code)
          ?? [],
      };
    } else {
      const byKey = new Map(
        hierarchy.nodes.map((node) => [node.key, node]),
      );
      const leafCountOf = (key: string): number => {
        const node = byKey.get(key);
        if (!node) {
          throw new Error(`Hierarchy node not found: ${key}`);
        }
        return node.childKeys.length === 0
          ? 1
          : node.childKeys.reduce(
              (count, childKey) => count + leafCountOf(childKey),
              0,
            );
      };
      hierarchyItems.push(
        ...hierarchy.nodes.map((node) => ({
          kind: 'tree' as const,
          candidate: node.candidate,
          pointer: node.structuralPath,
          format: 'tabular' as const,
          nodeType: 'table-node' as const,
          childCount: node.childKeys.length,
          leafCount: leafCountOf(node.key),
          method: options.tabularHierarchy!.config.mode,
          sheet: options.tabularHierarchy!.sheet,
          tabularHierarchy: options.tabularHierarchy!.config,
        })),
      );
    }
  }

  if (options.hierarchyOnly) {
    return {
      items: hierarchyItems,
      imageDiagnostics: [],
      ...(tabularHierarchyAbstention
        ? { tabularHierarchyAbstention }
        : {}),
    };
  }

  const tableItems: CandidateReviewInventoryItem[] = Object.entries(
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
        kind: 'table' as const,
        candidate,
        sheet: sheetName,
        range: candidate.locator.range ?? '',
        ...(typeof title === 'string' ? { title } : {}),
      };
    }),
  );

  if (!/\.(xlsx|xlsm)$/iu.test(sourcePath)) {
    return {
      items: [...tableItems, ...hierarchyItems],
      imageDiagnostics: [],
      ...(tabularHierarchyAbstention
        ? { tabularHierarchyAbstention }
        : {}),
    };
  }

  const packageBytes = fs.readFileSync(sourcePath);
  const read = readExcelImages(packageBytes);
  // Candidate identity must not depend on which host asked for it. CLI inspect
  // already supplies the detected table geometry to imageCandidates so that
  // the inferred nearby-table Claim is stable. Review inventory must use the
  // same detector/evidence instead of silently dropping that Claim.
  const tablesBySheet: Record<string, TableRect[]> = Object.fromEntries(
    Object.entries(workbook.sheets).map(([sheetName, sheet]) => [
      sheetName,
      detectTableRegions(
        sheetName,
        sheet,
        { maxValueSample: 0 },
      ).map((region) => ({
        a1: region.a1,
        startRow: region.range.startRow,
        startCol: region.range.startCol,
        endRow: region.range.endRow,
        endCol: region.range.endCol,
      })),
    ]),
  );
  const choiceRead = readExcelChoiceLists(
    packageBytes,
    sourceLabel,
    sourceDigest,
    workbook,
  );
  const imageCandidateList = imageCandidates({
    source: sourceLabel,
    sourceDigest,
    images: read.images,
    tablesBySheet,
  });
  const imageItems: CandidateReviewInventoryItem[] =
    imageCandidateList.map((candidate, index) => ({
      kind: 'image' as const,
      candidate,
      image: read.images[index],
    }));
  const shapeCandidateList = shapeCandidates({
    source: sourceLabel,
    sourceDigest,
    shapes: read.shapes,
  });
  const shapeItems: CandidateReviewInventoryItem[] =
    shapeCandidateList.map((candidate, index) => ({
      kind: 'shape' as const,
      candidate,
      shape: read.shapes[index],
    }));
  const choiceItems: CandidateReviewInventoryItem[] =
    choiceRead.lists.map((choiceList) => ({
      kind: 'choice-list' as const,
      candidate: choiceList.candidate,
      choiceList,
    }));

  return {
    items: [
      ...tableItems,
      ...imageItems,
      ...shapeItems,
      ...choiceItems,
      ...hierarchyItems,
    ],
    imageDiagnostics: read.diagnostics,
    choiceListDiagnostics: choiceRead.diagnostics,
    ...(tabularHierarchyAbstention
      ? { tabularHierarchyAbstention }
      : {}),
  };
}
