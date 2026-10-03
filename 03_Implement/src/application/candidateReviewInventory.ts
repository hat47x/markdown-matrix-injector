import fs from 'node:fs';

import {
  imageCandidates,
  readExcelImages,
  type ExcelImage,
  type ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { readXmlTree } from '../adapters/xmlTreeAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate } from '../core/candidate.js';
import {
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
} from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003,
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
      format: 'json' | 'xml';
      nodeType: 'object' | 'array' | 'element';
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
  if (/\.json$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readJsonTree(
      sourceBytes.toString('utf8'),
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
    const classificationText = sourceBytes.toString('utf8');
    if (!isXmlSpreadsheet2003(classificationText)) {
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
