/**
 * Product-facing workbook import materialization.
 *
 * Tables stay Linked to the source workbook so they keep following edits.
 * Embedded images are Extracted as ordinary Markdown assets and recorded in
 * the shared import ledger. Non-table regions stay as review notes in the
 * existing import draft. The source workbook is never modified.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { imageCandidates, readExcelImages } from '../adapters/excelImageAdapter.js';
import { extractImages, type ExtractProblem, type ExtractedImage } from '../cli/extract.js';
import {
  DEFAULT_LEDGER_FILE,
  assessLedger,
  readLedger,
} from '../core/importLedger.js';
import {
  DEFAULT_REVIEW_DECISIONS_FILE,
  deferredDecisionForCandidate,
  readReviewDecisions,
  rejectedDecisionForCandidate,
} from '../core/candidateReviewDecisions.js';
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
  /** Review decisions consulted before automatic image adoption. */
  reviewDecisionsPath?: string;
  /**
   * Reuse prepared workbook data. When workbook/structure is supplied,
   * preparedSourceDigest is required so stale prepared data cannot bypass the
   * one-source-snapshot guarantee.
   */
  workbook?: WorkbookData;
  /** Reuse prepared author-declared workbook structure. */
  structure?: WorkbookStructure;
  /** Source digest from which injected workbook/structure data was prepared. */
  preparedSourceDigest?: string;
}

export interface ImportSkippedImage {
  ordinal: number;
  sheet: string;
  name?: string;
  decision: 'rejected' | 'deferred';
  code: 'MMI_IMPORT_REVIEW_REJECTED' | 'MMI_IMPORT_REVIEW_DEFERRED';
  message: string;
}

export interface WorkbookImportMaterialization {
  markdown: string;
  /** Source bytes used consistently for this materialization. */
  sourceDigest: string;
  ledgerPath: string;
  imageOutDir: string;
  reviewDecisionsPath: string;
  /** Snapshot used to prevent a review decision race during commit. */
  reviewDecisionsSnapshot?: string;
  extractedImages: ExtractedImage[];
  imageProblems: ExtractProblem[];
  reviewSkippedImages: ImportSkippedImage[];
}

export interface WorkbookImportPaths {
  draftPath: string;
  ledgerPath: string;
  imageOutDir: string;
  reviewDecisionsPath: string;
}

export function workbookImportPaths(
  options: Pick<
    WorkbookImportMaterializeOptions,
    'sourcePath' | 'draftPath' | 'ledgerPath' | 'imageOutDir' | 'reviewDecisionsPath'
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
  const reviewDecisionsPath = path.resolve(
    options.reviewDecisionsPath
      ?? path.join(path.dirname(ledgerPath), DEFAULT_REVIEW_DECISIONS_FILE),
  );
  assertImportPathRoles(
    sourcePath,
    draftPath,
    ledgerPath,
    imageOutDir,
    reviewDecisionsPath,
  );
  return { draftPath, ledgerPath, imageOutDir, reviewDecisionsPath };
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
    if (
      result.reviewDecisionsSnapshot
      && optionalFileSnapshot(paths.reviewDecisionsPath)
        !== result.reviewDecisionsSnapshot
    ) {
      throw new Error(
        'MMI_IMPORT_REVIEW_DECISIONS_CHANGED: review decisions changed during import; run the import again',
      );
    }
    // 'wx' closes the check/write race: another process cannot be overwritten.
    draftWriteStarted = true;
    fs.writeFileSync(
      paths.draftPath,
      result.markdown,
      { encoding: 'utf8', flag: 'wx' },
    );
    if (readSourceFileIdentity(path.resolve(options.sourcePath)).digest !== result.sourceDigest) {
      throw new Error(
        'MMI_IMPORT_SOURCE_CHANGED: source changed while committing import; run the import again',
      );
    }
    if (
      result.reviewDecisionsSnapshot
      && optionalFileSnapshot(paths.reviewDecisionsPath)
        !== result.reviewDecisionsSnapshot
    ) {
      throw new Error(
        'MMI_IMPORT_REVIEW_DECISIONS_CHANGED: review decisions changed while committing import; run the import again',
      );
    }
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
  if (options.workbook || options.structure) {
    if (!options.preparedSourceDigest) {
      throw new Error(
        'MMI_IMPORT_PREPARED_SOURCE_DIGEST_REQUIRED: prepared workbook/structure needs its source digest',
      );
    }
    if (options.preparedSourceDigest !== sourceDigest) {
      throw new Error(
        'MMI_IMPORT_PREPARED_SOURCE_STALE: prepared workbook/structure does not match current source snapshot',
      );
    }
  }
  const paths = workbookImportPaths(options);
  const { draftPath, ledgerPath, imageOutDir, reviewDecisionsPath } = paths;
  const workbook = options.workbook
    ?? loadWorkbookFromBytes(sourcePath, sourceBytes);
  const structure = options.structure
    ?? readStructureOptional(sourcePath, sourceBytes, workbook);
  const referencePath = relativeReference(draftPath, sourcePath);

  // Complete all read-only workbook analysis before writing assets or ledger.
  // If the workbook cannot be analyzed, the import fails with no side effects.
  const analyzedBase = analyzeWorkbookForImport(
    path.basename(sourcePath),
    referencePath,
    workbook,
    {
      ...(structure ? { structure } : {}),
    },
  );

  let extractedImages: ExtractedImage[] = [];
  let imageProblems: ExtractProblem[] = [];
  let reviewSkippedImages: ImportSkippedImage[] = [];
  let reviewDecisionsSnapshot: string | undefined;

  if (/\.(xlsx|xlsm)$/iu.test(sourcePath)) {
    // Review decisions are a control input to automatic adoption. Freeze them
    // before any asset/ledger writes, just like the source workbook snapshot.
    reviewDecisionsSnapshot = optionalFileSnapshot(reviewDecisionsPath);
    const reviewDecisions = readReviewDecisions(reviewDecisionsPath);
    if (optionalFileSnapshot(reviewDecisionsPath) !== reviewDecisionsSnapshot) {
      throw new Error(
        'MMI_IMPORT_REVIEW_DECISIONS_CHANGED: review decisions changed while being read; run the import again',
      );
    }
    // A malformed existing ledger must also fail before this import writes.
    const ledger = readLedger(ledgerPath);
    const imageRead = readExcelImages(sourceBytes);
    const imageCandidateList = imageCandidates({
      source: referencePath,
      sourceDigest,
      images: imageRead.images,
    });

    const fatalProblems: ExtractProblem[] = imageRead.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.sheet ? { sheet: diagnostic.sheet } : {}),
      }));
    const packageWarnings: ExtractProblem[] = imageRead.diagnostics
      .filter((diagnostic) =>
        diagnostic.severity === 'warning'
        // Non-extractable media is represented with an ordinal by extractImages.
        && diagnostic.code !== 'MMI_IMAGE_UNSUPPORTED_FORMAT')
      .map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.sheet ? { sheet: diagnostic.sheet } : {}),
      }));

    const extractionProblems: ExtractProblem[] = [];
    if (fatalProblems.length === 0) {
      for (let index = 0; index < imageRead.images.length; index += 1) {
        const image = imageRead.images[index];
        const candidate = imageCandidateList[index];
        const ledgerAssessment = assessLedger(
          ledger,
          ledgerPath,
          sourcePath,
          candidate,
        );
        const rejected = rejectedDecisionForCandidate(
          reviewDecisions,
          reviewDecisionsPath,
          sourcePath,
          candidate,
        );
        const deferred = rejected
          ? undefined
          : deferredDecisionForCandidate(
              reviewDecisions,
              reviewDecisionsPath,
              sourcePath,
              candidate,
            );
        const reviewDecision = rejected ?? deferred;
        const adoptedAt = ledgerAssessment.state === 'imported'
          ? ledgerAssessment.entry?.reviewedAt
          : undefined;
        const reviewWins = Boolean(
          reviewDecision
          && (
            !adoptedAt
            || reviewDecision.reviewedAt >= adoptedAt
          ),
        );
        if (reviewDecision && reviewWins) {
          const decision = rejected ? 'rejected' as const : 'deferred' as const;
          reviewSkippedImages.push({
            ordinal: image.ordinal,
            sheet: image.sheet,
            ...(image.name ? { name: image.name } : {}),
            decision,
            code: decision === 'rejected'
              ? 'MMI_IMPORT_REVIEW_REJECTED'
              : 'MMI_IMPORT_REVIEW_DEFERRED',
            message: decision === 'rejected'
              ? '同一Candidateに、採用履歴より新しい却下判断があります。'
              : '同一Candidateに、採用履歴より新しい保留判断があります。',
          });
          continue;
        }

        const extracted = extractImages({
          sourcePath,
          selection: String(image.ordinal),
          outDir: imageOutDir,
          fromDocument: draftPath,
          sourceLabel: referencePath,
          ledgerPath,
          basis: 'mmi import',
          sourceBytes,
        });
        extractedImages.push(...extracted.extracted);
        extractionProblems.push(
          ...extracted.problems.filter(
            (problem) => problem.code !== 'MMI_IMAGE_NONE',
          ),
        );
      }
    }

    imageProblems = distinctProblems([
      ...fatalProblems,
      ...extractionProblems,
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

  const analyzed = {
    ...analyzedBase,
    assets,
    assetProblems: problems,
    reviewSkippedAssets: reviewSkippedImages,
  };

  return {
    markdown: renderImportDraft(analyzed),
    sourceDigest,
    ledgerPath,
    imageOutDir,
    reviewDecisionsPath,
    ...(reviewDecisionsSnapshot ? { reviewDecisionsSnapshot } : {}),
    extractedImages,
    imageProblems,
    reviewSkippedImages,
  };
}




function assertImportPathRoles(
  sourcePath: string,
  draftPath: string,
  ledgerPath: string,
  imageOutDir: string,
  reviewDecisionsPath: string,
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
  if (
    reviewDecisionsPath === sourcePath
    || reviewDecisionsPath === draftPath
    || reviewDecisionsPath === ledgerPath
  ) {
    throw new Error(
      'MMI_IMPORT_OUTPUT_CONFLICT: review decisions must be separate from source, draft and ledger',
    );
  }
  if (containsPath(imageOutDir, reviewDecisionsPath)) {
    throw new Error(
      'MMI_IMPORT_OUTPUT_CONFLICT: image asset root must not contain review decisions',
    );
  }
}


function optionalFileSnapshot(filePath: string): string {
  if (!fs.existsSync(filePath)) return 'absent';
  const bytes = fs.readFileSync(filePath);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
