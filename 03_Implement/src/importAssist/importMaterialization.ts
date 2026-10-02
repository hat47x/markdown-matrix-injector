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
import { extractImages, type ExtractProblem, type ExtractedImage } from '../cli/extract.js';
import { DEFAULT_LEDGER_FILE } from '../core/importLedger.js';
import {
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
} from '../core/sourceIdentity.js';
import {
  loadWorkbookFromBytes,
  type WorkbookData,
} from '../core/workbookLoader.js';
import { analyzeWorkbookForImport, renderImportDraft, type ImportDraftAsset, type ImportDraftProblem } from './importDraft.js';
import {
  readWorkbookStructureFromBytes,
  type WorkbookStructure,
} from './workbookStructure.js';

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
  /** Source bytes used consistently for this materialization. */
  sourceDigest: string;
  ledgerPath: string;
  imageOutDir: string;
  extractedImages: ExtractedImage[];
  imageProblems: ExtractProblem[];
}

export interface WorkbookImportPaths {
  draftPath: string;
  ledgerPath: string;
  imageOutDir: string;
}

export function workbookImportPaths(
  options: Pick<
    WorkbookImportMaterializeOptions,
    'sourcePath' | 'draftPath' | 'ledgerPath' | 'imageOutDir'
  >,
): WorkbookImportPaths {
  const sourcePath = path.resolve(options.sourcePath);
  const draftPath = path.resolve(options.draftPath);
  const draftDir = path.dirname(draftPath);
  const ledgerPath = path.resolve(
    options.ledgerPath ?? path.join(draftDir, DEFAULT_LEDGER_FILE),
  );
  const baseName = path.basename(sourcePath).replace(/\.[^.]+$/u, '');
  const imageOutDir = path.resolve(
    options.imageOutDir
      ?? path.join(draftDir, 'assets', safePathSegment(baseName)),
  );
  assertImportPathRoles(sourcePath, draftPath, ledgerPath, imageOutDir);
  return { draftPath, ledgerPath, imageOutDir };
}

/**
 * Commit the modernization draft and its extracted assets/ledger as one user
 * operation. The source workbook is read-only. If materialization or the final
 * draft write fails, files created by this operation and ledger mutations are
 * rolled back to their previous state.
 */
export function writeWorkbookImportDraft(
  options: WorkbookImportMaterializeOptions,
): WorkbookImportMaterialization {
  const paths = workbookImportPaths(options);
  if (fs.existsSync(paths.draftPath)) {
    throw new Error(
      `MMI_IMPORT_DRAFT_EXISTS: refusing to overwrite existing draft: ${paths.draftPath}`,
    );
  }

  const ledgerBefore = fs.existsSync(paths.ledgerPath)
    ? fs.readFileSync(paths.ledgerPath)
    : undefined;
  const assetDirectoryExisted = fs.existsSync(paths.imageOutDir);
  const assetsBefore = assetDirectoryExisted
    ? new Set(fs.readdirSync(paths.imageOutDir))
    : new Set<string>();

  fs.mkdirSync(path.dirname(paths.draftPath), { recursive: true });

  let draftWriteStarted = false;
  try {
    const result = materializeWorkbookImport({
      ...options,
      draftPath: paths.draftPath,
      ledgerPath: paths.ledgerPath,
      imageOutDir: paths.imageOutDir,
    });
    if (readSourceFileIdentity(path.resolve(options.sourcePath)).digest !== result.sourceDigest) {
      throw new Error(
        'MMI_IMPORT_SOURCE_CHANGED: source changed during import; run the import again',
      );
    }
    // 'wx' closes the check/write race: another process cannot be overwritten.
    draftWriteStarted = true;
    fs.writeFileSync(
      paths.draftPath,
      result.markdown,
      { encoding: 'utf8', flag: 'wx' },
    );
    return result;
  } catch (error) {
    const removeDraft =
      draftWriteStarted
      && !(isNodeError(error) && error.code === 'EEXIST');
    rollbackWorkbookImport(
      paths,
      ledgerBefore,
      assetDirectoryExisted,
      assetsBefore,
      removeDraft,
    );
    throw error;
  }
}

function rollbackWorkbookImport(
  paths: WorkbookImportPaths,
  ledgerBefore: Buffer | undefined,
  assetDirectoryExisted: boolean,
  assetsBefore: ReadonlySet<string>,
  removeDraft: boolean,
): void {
  if (removeDraft) fs.rmSync(paths.draftPath, { force: true });

  if (ledgerBefore) {
    fs.mkdirSync(path.dirname(paths.ledgerPath), { recursive: true });
    fs.writeFileSync(paths.ledgerPath, ledgerBefore);
  } else {
    fs.rmSync(paths.ledgerPath, { force: true });
  }

  if (fs.existsSync(paths.imageOutDir) && fs.statSync(paths.imageOutDir).isDirectory()) {
    for (const name of fs.readdirSync(paths.imageOutDir)) {
      if (!assetsBefore.has(name)) {
        fs.rmSync(path.join(paths.imageOutDir, name), { recursive: true, force: true });
      }
    }
    if (!assetDirectoryExisted && fs.readdirSync(paths.imageOutDir).length === 0) {
      fs.rmSync(paths.imageOutDir, { recursive: true, force: true });
    }
  }
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
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceDigest = createSourceIdentityFromBytes(sourceBytes).digest;
  const paths = workbookImportPaths(options);
  const { draftPath, ledgerPath, imageOutDir } = paths;
  const workbook = options.workbook
    ?? loadWorkbookFromBytes(sourcePath, sourceBytes);
  const structure = options.structure
    ?? readStructureOptional(sourcePath, sourceBytes, workbook);
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
      basis: 'mmi import',
      sourceBytes,
    });
    extractedImages = extracted.extracted;
    const packageWarnings: ExtractProblem[] = (extracted.diagnostics ?? [])
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
    sourceDigest,
    ledgerPath,
    imageOutDir,
    extractedImages,
    imageProblems,
  };
}




function assertImportPathRoles(
  sourcePath: string,
  draftPath: string,
  ledgerPath: string,
  imageOutDir: string,
): void {
  if (draftPath === ledgerPath) {
    throw new Error('MMI_IMPORT_OUTPUT_CONFLICT: draft and ledger must be different files');
  }
  if (sourcePath === ledgerPath) {
    throw new Error('MMI_IMPORT_OUTPUT_CONFLICT: ledger must not replace the source workbook');
  }
  if (containsPath(imageOutDir, draftPath)) {
    throw new Error('MMI_IMPORT_OUTPUT_CONFLICT: image asset root must not contain the draft');
  }
  if (containsPath(imageOutDir, ledgerPath)) {
    throw new Error('MMI_IMPORT_OUTPUT_CONFLICT: image asset root must not contain the ledger');
  }
  if (containsPath(imageOutDir, sourcePath)) {
    throw new Error('MMI_IMPORT_OUTPUT_CONFLICT: image asset root must not contain the source workbook');
  }
}

function containsPath(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === ''
    || (!relative.startsWith('..' + path.sep)
      && relative !== '..'
      && !path.isAbsolute(relative));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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
  sourceBytes: Uint8Array,
  workbook: WorkbookData,
): WorkbookStructure | undefined {
  try {
    return readWorkbookStructureFromBytes(sourcePath, sourceBytes, workbook);
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
