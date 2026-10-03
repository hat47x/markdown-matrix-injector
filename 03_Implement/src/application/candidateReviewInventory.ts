import fs from 'node:fs';

import {
  imageCandidates,
  readExcelImages,
  type ExcelImage,
  type ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';

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
      nodeType: 'object' | 'array';
      childCount: number;
      leafCount: number;
    };

export interface CandidateReviewInventory {
  items: CandidateReviewInventoryItem[];
  imageDiagnostics: ImageDiagnostic[];
}

export function buildCandidateReviewInventory(
  sourcePath: string,
  sourceLabel: string,
): CandidateReviewInventory {
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;

  if (/\.json$/iu.test(sourcePath)) {
    const tree = readJsonTree(
      fs.readFileSync(sourcePath, 'utf8'),
      sourceLabel,
      sourceDigest,
    );
    return {
      items: tree.nodes.map((node) => ({
        kind: 'tree' as const,
        candidate: node.candidate,
        pointer: node.pointer,
        nodeType: node.nodeType,
        childCount: node.childPointers.length,
        leafCount: node.leafValues.length,
      })),
      imageDiagnostics: [],
    };
  }

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

  if (!/\.(xlsx|xlsm)$/iu.test(sourcePath)) {
    return { items: tableItems, imageDiagnostics: [] };
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
    items: [...tableItems, ...imageItems],
    imageDiagnostics: read.diagnostics,
  };
}
