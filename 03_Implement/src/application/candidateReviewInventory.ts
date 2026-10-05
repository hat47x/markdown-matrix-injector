import fs from 'node:fs';

import {
  DEFAULT_FLAT_TEXT_TREE_METHODS,
  decodeFlatTextUtf8,
  readFlatTextTree,
  type FlatTextTreeMethod,
} from '../adapters/flatTextTreeStructuralizer.js';
import {
  imageCandidates,
  readExcelImages,
  type ExcelImage,
  type ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { readXmlTree } from '../adapters/xmlTreeAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import {
  readTabularHierarchy,
  type TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { decodeJsonUtf8 } from '../core/jsonFormat.js';
import {
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
} from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003Bytes,
} from '../core/xmlFormat.js';

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
      kind: 'tree';
      candidate: Candidate;
      pointer: string;
      format: 'json' | 'xml' | 'text';
      nodeType: 'object' | 'array' | 'element' | 'text-node';
      childCount: number;
      leafCount: number;
      method?: FlatTextTreeMethod;
    }
  | {
      kind: 'tree';
      candidate: Candidate;
      pointer: string;
      format: 'tabular';
      nodeType: 'table-node';
      childCount: number;
      leafCount: number;
      sheet: string;
      tabularConfig: TabularHierarchyConfig;
    };

export interface CandidateReviewInventory {
  items: CandidateReviewInventoryItem[];
  imageDiagnostics: ImageDiagnostic[];
}

export interface CandidateReviewInventoryOptions {
  /**
   * Explicit user-supplied hierarchy mappings. No column-name inference is
   * performed here: tabular Tree Candidates exist only for mappings the user
   * asked MMI to interpret.
   */
  tabularHierarchies?: readonly {
    sheet: string;
    config: TabularHierarchyConfig;
  }[];
}

export function buildCandidateReviewInventory(
  sourcePath: string,
  sourceLabel: string,
  options: CandidateReviewInventoryOptions = {},
): CandidateReviewInventory {
  if (/\.json$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readJsonTree(
      decodeJsonUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
    );
    return {
      items: tree.nodes.map((node) => ({
        kind: 'tree' as const,
        candidate: node.candidate,
        pointer: node.pointer,
        format: 'json' as const,
        nodeType: node.nodeType,
        childCount: node.childPointers.length,
        leafCount: node.leafValues.length,
      })),
      imageDiagnostics: [],
    };
  }

  if (/\.xml$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    if (!isXmlSpreadsheet2003Bytes(sourceBytes)) {
      const xml = decodeGenericXmlUtf8(sourceBytes);
      const sourceDigest =
        createSourceIdentityFromBytes(sourceBytes).digest;
      const tree = readXmlTree(xml, sourceLabel, sourceDigest);
      return {
        items: tree.nodes.map((node) => ({
          kind: 'tree' as const,
          candidate: node.candidate,
          pointer: node.path,
          format: 'xml' as const,
          nodeType: 'element' as const,
          childCount: node.childPaths.length,
          leafCount:
            node.attributeValues.length + node.textValues.length,
        })),
        imageDiagnostics: [],
      };
    }
  }

  if (/\.(txt|text|log)$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readFlatTextTree(
      decodeFlatTextUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
      { methods: DEFAULT_FLAT_TEXT_TREE_METHODS },
    );
    return {
      items: tree.hypotheses.flatMap((hypothesis) =>
        hypothesis.status === 'inferred'
          ? hypothesis.nodes.map((node) => ({
              kind: 'tree' as const,
              candidate: node.candidate,
              pointer: node.structuralPath,
              format: 'text' as const,
              nodeType: 'text-node' as const,
              childCount: node.childLines.length,
              leafCount: 1,
              method: hypothesis.method,
            }))
          : []),
      imageDiagnostics: [],
    };
  }

  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const workbook = loadWorkbook({ absolutePath: sourcePath });

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

  const tabularTreeItems: CandidateReviewInventoryItem[] = (
    options.tabularHierarchies ?? []
  ).flatMap(({ sheet: sheetName, config }) => {
    const sheet = workbook.sheets[sheetName];
    if (!sheet) {
      throw new Error(
        `tabular hierarchy sheet ${JSON.stringify(sheetName)} was not found`,
      );
    }
    const hierarchy = readTabularHierarchy({
      source: sourceLabel,
      sourceDigest,
      sheetName,
      sheet,
      config,
    });
    if (hierarchy.status !== 'inferred') {
      throw new Error(
        `tabular hierarchy could not be established on ${sheetName}: ${hierarchy.reasonCode}`,
      );
    }
    return hierarchy.nodes.map((node) => ({
      kind: 'tree' as const,
      candidate: node.candidate,
      pointer: node.structuralPath,
      format: 'tabular' as const,
      nodeType: 'table-node' as const,
      childCount: node.childKeys.length,
      leafCount: node.childKeys.length === 0 ? 1 : 0,
      sheet: sheetName,
      tabularConfig: config,
    }));
  });

  if (!/\.(xlsx|xlsm)$/iu.test(sourcePath)) {
    return {
      items: [...tableItems, ...tabularTreeItems],
      imageDiagnostics: [],
    };
  }

  const read = readExcelImages(fs.readFileSync(sourcePath));
  const imageCandidateList = imageCandidates({
    source: sourceLabel,
    sourceDigest,
    images: read.images,
  });
  const imageItems: CandidateReviewInventoryItem[] =
    imageCandidateList.map((candidate, index) => ({
      kind: 'image' as const,
      candidate,
      image: read.images[index],
    }));

  return {
    items: [...tableItems, ...tabularTreeItems, ...imageItems],
    imageDiagnostics: read.diagnostics,
  };
}
