import type {
  FlatTextTreeMethod,
} from '../adapters/flatTextTreeStructuralizer.js';
import type {
  ExcelDrawingShape,
  ExcelImage,
  ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
import type {
  ChoiceListDiagnostic,
  ExcelChoiceList,
} from '../adapters/excelChoiceListAdapter.js';
import type {
  ExcelNote,
  NoteDiagnostic,
} from '../adapters/excelNoteAdapter.js';
import type {
  TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate } from '../core/candidate.js';
import {
  collectWorkbookCandidates,
} from './workbookCandidateInventory.js';
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
      kind: 'note';
      candidate: Candidate;
      note: ExcelNote;
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
  noteDiagnostics?: NoteDiagnostic[];
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

  const workbookInventory = collectWorkbookCandidates(
    sourcePath,
    sourceLabel,
    {
      ...(options.tabularHierarchy
        ? {
            tabularHierarchy: options.tabularHierarchy.config,
            hierarchySheets: [options.tabularHierarchy.sheet],
          }
        : {}),
      ...(options.hierarchyOnly ? { hierarchyOnly: true } : {}),
    },
  );

  const hierarchyItems: CandidateReviewInventoryItem[] = [];
  let tabularHierarchyAbstention:
    | CandidateReviewInventory['tabularHierarchyAbstention']
    | undefined;
  if (options.tabularHierarchy) {
    const hierarchy = workbookInventory.hierarchies[0]?.result;
    if (!hierarchy) {
      throw new Error(
        `Hierarchy review sheet not found: ${options.tabularHierarchy.sheet}`,
      );
    }
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

  const tableItems: CandidateReviewInventoryItem[] =
    workbookInventory.tableItems.map((item) => ({
      kind: 'table' as const,
      candidate: item.candidate,
      sheet: item.sheet,
      range: item.range,
      ...(item.title ? { title: item.title } : {}),
    }));

  const imageItems: CandidateReviewInventoryItem[] =
    workbookInventory.imageCandidateList.map((candidate, index) => ({
      kind: 'image' as const,
      candidate,
      image: workbookInventory.imageRead.images[index],
    }));
  const shapeItems: CandidateReviewInventoryItem[] =
    workbookInventory.shapeCandidateList.map((candidate, index) => ({
      kind: 'shape' as const,
      candidate,
      shape: workbookInventory.imageRead.shapes[index],
    }));
  const choiceItems: CandidateReviewInventoryItem[] =
    workbookInventory.choiceRead.lists.map((choiceList) => ({
      kind: 'choice-list' as const,
      candidate: choiceList.candidate,
      choiceList,
    }));
  const noteItems: CandidateReviewInventoryItem[] =
    workbookInventory.noteCandidateList.map((candidate, index) => ({
      kind: 'note' as const,
      candidate,
      note: workbookInventory.noteRead.notes[index],
    }));

  return {
    items: [
      ...tableItems,
      ...imageItems,
      ...shapeItems,
      ...choiceItems,
      ...noteItems,
      ...hierarchyItems,
    ],
    imageDiagnostics: workbookInventory.isPackage
      ? workbookInventory.imageRead.diagnostics
      : [],
    choiceListDiagnostics:
      workbookInventory.choiceRead.diagnostics,
    noteDiagnostics: workbookInventory.noteRead.diagnostics,
    ...(tabularHierarchyAbstention
      ? { tabularHierarchyAbstention }
      : {}),
  };
}
