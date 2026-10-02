import fs from 'node:fs';

import {
  imageCandidates,
  readExcelImages,
  type ExcelImage,
  type ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
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
