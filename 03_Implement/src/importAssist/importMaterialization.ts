/**
 * Product-facing workbook import materialization.
 *
 * Tables stay Linked to the source workbook so they keep following edits.
 * Embedded images are Extracted as ordinary Markdown assets and recorded in
 * the shared import ledger. Non-table regions stay as review notes in the
 * existing import draft. The source workbook is never modified.
 */
import fs from 'node:fs';
import path from 'node:path';

import { readExcelImages } from '../adapters/excelImageAdapter.js';
import { extractImages, type ExtractProblem, type ExtractedImage } from '../cli/extract.js';
import { DEFAULT_LEDGER_FILE } from '../core/importLedger.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { analyzeWorkbookForImport, renderImportDraft, type ImportDraftAsset, type ImportDraftProblem } from './importDraft.js';
import { readWorkbookStructure, type WorkbookStructure } from './workbookStructure.js';

export interface WorkbookImportMaterializeOptions {
  sourcePath: string;
  draftPath: string;
  /** Shared project ledger. Defaults next to the draft. */
  ledgerPath?: string;
  /** Extracted images. Defaults to assets/<workbook-name>/ next to the draft. */
  imageOutDir?: string;
  /** Reuse an already loaded workbook. */
  workbook?: WorkbookData;
  /** Reuse already-read author-declared workbook structure. */
  structure?: WorkbookStructure;
}

export interface WorkbookImportMaterialization {
  markdown: string;
  ledgerPath: string;
  imageOutDir: string;
  extractedImages: ExtractedImage[];
  imageProblems: ExtractProblem[];
}

/**
 * Builds a usable modernization draft in one operation.
 *
 * For non-OOXML inputs this still produces the existing table/reference draft;
 * image extraction is simply skipped.
 */
export function materializeWorkbookImport(
  options: WorkbookImportMaterializeOptions,
): WorkbookImportMaterialization {
  const sourcePath = path.resolve(options.sourcePath);
  const draftPath = path.resolve(options.draftPath);
  const draftDir = path.dirname(draftPath);
  const workbook = options.workbook ?? loadWorkbook({ absolutePath: sourcePath });
  const structure = options.structure ?? readStructureOptional(sourcePath, workbook);
  const ledgerPath = path.resolve(options.ledgerPath ?? path.join(draftDir, DEFAULT_LEDGER_FILE));

  const baseName = path.basename(sourcePath).replace(/\.[^.]+$/u, '');
  const imageOutDir = path.resolve(
    options.imageOutDir ?? path.join(draftDir, 'assets', safePathSegment(baseName)),
  );
  const referencePath = relativeReference(draftPath, sourcePath);

  let extractedImages: ExtractedImage[] = [];
  let imageProblems: ExtractProblem[] = [];
  if (/\.(xlsx|xlsm)$/iu.test(sourcePath)) {
    const extracted = extractImages({
      sourcePath,
      selection: 'all',
      outDir: imageOutDir,
      fromDocument: draftPath,
      sourceLabel: referencePath,
      ledgerPath,
    });
    extractedImages = extracted.extracted;
    const packageWarnings: ExtractProblem[] = readExcelImages(fs.readFileSync(sourcePath)).diagnostics
      .filter((diagnostic) =>
        diagnostic.severity === 'warning'
        // Non-extractable media is represented with an ordinal by extractImages.
        && diagnostic.code !== 'MMI_IMAGE_UNSUPPORTED_FORMAT')
      .map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.sheet ? { sheet: diagnostic.sheet } : {}),
      }));
    imageProblems = distinctProblems([
      ...extracted.problems.filter((problem) => problem.code !== 'MMI_IMAGE_NONE'),
      ...packageWarnings,
    ]);
  }

  const assets: ImportDraftAsset[] = extractedImages.map((image) => ({
    ordinal: image.ordinal,
    sheet: image.sheet,
    markdown: image.markdown,
  }));
  const problems: ImportDraftProblem[] = imageProblems.map((problem) => ({
    code: problem.code,
    message: problem.message,
    ...(problem.sheet ? { sheet: problem.sheet } : {}),
    ...(problem.ordinal ? { ordinal: problem.ordinal } : {}),
  }));

  const analyzed = analyzeWorkbookForImport(
    path.basename(sourcePath),
    referencePath,
    workbook,
    {
      ...(structure ? { structure } : {}),
      assets,
      assetProblems: problems,
    },
  );

  return {
    markdown: renderImportDraft(analyzed),
    ledgerPath,
    imageOutDir,
    extractedImages,
    imageProblems,
  };
}


function distinctProblems(problems: readonly ExtractProblem[]): ExtractProblem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = [
      problem.code,
      problem.sheet ?? '',
      problem.ordinal ?? '',
      problem.message,
    ].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readStructureOptional(
  sourcePath: string,
  workbook: WorkbookData,
): WorkbookStructure | undefined {
  try {
    return readWorkbookStructure(sourcePath, workbook);
  } catch {
    return undefined;
  }
}

function relativeReference(draftPath: string, sourcePath: string): string {
  let relative = path.relative(path.dirname(draftPath), sourcePath).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function safePathSegment(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/[. ]+$/gu, '')
    .trim();
  return cleaned || 'workbook';
}
