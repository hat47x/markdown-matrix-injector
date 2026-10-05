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
import { readYamlTree } from '../adapters/yamlTreeAdapter.js';
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
import { decodeYamlUtf8 } from '../core/yamlFormat.js';

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

  if (/\.ya?ml$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readYamlTree(
      decodeYamlUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
    );
    return {
      items: tree.nodes.map((node) => ({
        kind: 'tree' as const,
        candidate: node.candidate,
        pointer: node.pointer,
        format: 'yaml' as const,
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
    items: [...tableItems, ...imageItems, ...hierarchyItems],
    imageDiagnostics: read.diagnostics,
    ...(tabularHierarchyAbstention
      ? { tabularHierarchyAbstention }
      : {}),
  };
}
