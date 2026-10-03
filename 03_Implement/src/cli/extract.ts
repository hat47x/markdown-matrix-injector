/**
 * `mmi extract`: write chosen workbook images to an assets folder and print
 * Markdown that references them, with provenance (issue-0194).
 *
 * Read-only toward the source: the workbook is only read. It writes only
 * files named after the image's own digest inside `outDir`, so the same
 * picture is one file however many places use it, and a re-run is a no-op.
 * An existing file with that name but different bytes is never overwritten.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { imageCandidates, readExcelImages, readImageBytes, type ExcelImage, type ImageDiagnostic } from '../adapters/excelImageAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';

import { toGfmTable } from '../core/markdownTable.js';
import { claimBasisOf, entryFor, placeOf, recordEntries, type LedgerEntry } from '../core/importLedger.js';
import type { Candidate } from '../core/candidate.js';
import { buildLogicalTable } from '../core/renderTable.js';
import {
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
} from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import { parseEmbedSyntax, type EmbedQuery } from '../parser/embedSyntax.js';

export interface ExtractCandidateExclusion {
  code: string;
  message: string;
}

export interface ExtractSkippedImage {
  ordinal: number;
  sheet: string;
  name?: string;
  code: string;
  message: string;
}

export interface ExtractOptions {
  sourcePath: string;
  /** `all` or a 1-based image number as printed by `inspect`. */
  selection: string;
  outDir: string;
  /** Optional frozen source snapshot shared with a larger import transaction. */
  sourceBytes?: Uint8Array;
  /**
   * Optional product-policy gate. Returning a reason keeps the Candidate out
   * of this extraction without turning the human decision into an error.
   */
  excludeCandidate?: (
    candidate: Candidate,
    image: ExcelImage,
  ) => ExtractCandidateExclusion | undefined;
  /** Markdown references are written relative to this document's folder (default: current directory). */
  fromDocument?: string;
  /** Source as it should be written in provenance (default: relative to the document folder). */
  sourceLabel?: string;
  /** When set, each extracted picture is recorded in this import ledger (issue-0195). */
  ledgerPath?: string;
  /** Operation recorded as the review/import basis. */
  basis?: string;
}

export interface ExtractedImage {
  ordinal: number;
  sheet: string;
  anchor?: string;
  digest: string;
  file: string;
  /** `written`, or `unchanged` when the same bytes were already there. */
  status: 'written' | 'unchanged';
  reference: string;
  /** Human-visible Markdown alt text generated from source metadata. */
  altText: string;
  markdown: string;
}

export interface ExtractProblem {
  ordinal?: number;
  sheet?: string;
  code: string;
  message: string;
}

export interface ExtractResult {
  extracted: ExtractedImage[];
  problems: ExtractProblem[];
  /** Intentionally omitted by a caller-supplied Candidate policy. */
  skipped?: ExtractSkippedImage[];
  /** Raw package diagnostics from the same image parse used for extraction. */
  diagnostics?: ImageDiagnostic[];
}

export interface FinalizeReviewedImageOptions {
  sourcePath: string;
  ledgerPath: string;
  extracted: ExtractedImage;
  /** Candidate shown to the reviewer before the human edit. */
  candidate: Candidate;
  altText: string;
  fromDocument?: string;
  sourceLabel?: string;
  basis?: string;
}

export interface FinalizedReviewedImage extends ExtractedImage {
  reviewState: 'accepted' | 'modified';
}

export interface FinalizeReviewedImageResult {
  extracted?: FinalizedReviewedImage;
  problems: ExtractProblem[];
}

export interface ExtractTableOptions {
  sourcePath: string;
  sheet: string;
  range: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
}

export interface ExtractedTable {
  sheet: string;
  range: string;
  digest: string;
  candidateFingerprint: string;
  file: string;
  status: 'written' | 'unchanged';
  markdown: string;
}

export interface ExtractTableResult {
  extracted?: ExtractedTable;
  problems: ExtractProblem[];
}

export interface FinalizeReviewedTableOptions {
  sourcePath: string;
  outDir: string;
  ledgerPath: string;
  extracted: ExtractedTable;
  editedMarkdown: string;
  fromDocument?: string;
  sourceLabel?: string;
  basis?: string;
}

export interface FinalizedReviewedTable extends ExtractedTable {
  reviewState: 'accepted' | 'modified';
}

export interface FinalizeReviewedTableResult {
  extracted?: FinalizedReviewedTable;
  problems: ExtractProblem[];
}

const EXTENSION: Record<string, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', svg: 'svg' };

const sha256 = (data: Buffer): string => `sha256:${createHash('sha256').update(data).digest('hex')}`;

function provenanceValue(text: string): string {
  return text
    .replace(/--/gu, '- -')
    .replace(/"/gu, "'")
    .replace(/[\r\n]+/gu, ' ');
}

function normalizeImageAltText(value: string): string {
  return value
    .replace(/[\r\n]+/gu, ' ')
    .replace(/[[\]]/gu, '')
    .trim();
}

function altText(image: ExcelImage): string {
  const raw = image.description ?? image.name ?? `${image.sheet} 画像${image.ordinal}`;
  return normalizeImageAltText(raw);
}

/** Provenance as an HTML comment: invisible in rendered Markdown, greppable, and `--` is escaped so it cannot end the comment early. */
function provenanceComment(source: string, image: ExcelImage): string {
  return `<!-- mmi:extracted source="${provenanceValue(source)}" sheet="${provenanceValue(image.sheet)}"${image.range ? ` anchor="${provenanceValue(image.range)}"` : ''} sha256="${image.digest.slice(7)}" -->`;
}

function tableProvenanceComment(
  source: string,
  sheet: string,
  range: string,
  sourceDigest: string,
  candidateFingerprint: string,
): string {
  return `<!-- mmi:extracted-table source="${provenanceValue(source)}" sheet="${provenanceValue(sheet)}" range="${provenanceValue(range)}" source-sha256="${sourceDigest.slice(7)}" candidate-sha256="${candidateFingerprint.slice(7)}" -->`;
}

export function extractImages(options: ExtractOptions): ExtractResult {
  const result: ExtractResult = {
    extracted: [],
    problems: [],
    skipped: [],
    diagnostics: [],
  };
  const packageBytes = options.sourceBytes ?? fs.readFileSync(options.sourcePath);
  if (!/\.(xlsx|xlsm)$/iu.test(options.sourcePath)) {
    result.problems.push({ code: 'MMI_IMAGE_PACKAGE_UNSUPPORTED', message: 'images can only be extracted from .xlsx / .xlsm workbooks' });
    return result;
  }
  const read = readExcelImages(packageBytes);
  result.diagnostics = [...read.diagnostics];
  for (const diagnostic of read.diagnostics.filter((d) => d.severity === 'error')) {
    result.problems.push({
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.sheet ? { sheet: diagnostic.sheet } : {}),
    });
  }
  if (result.problems.length > 0) return result;

  let chosen: ExcelImage[];
  if (options.selection === 'all') chosen = read.images;
  else {
    const ordinal = Number(options.selection);
    const found = Number.isInteger(ordinal) ? read.images.find((image) => image.ordinal === ordinal) : undefined;
    if (!found) {
      result.problems.push({ code: 'MMI_IMAGE_NOT_FOUND', message: `no image ${options.selection} in the workbook (it has ${read.images.length}; run \`mmi inspect\` to list them)` });
      return result;
    }
    chosen = [found];
  }
  if (chosen.length === 0) {
    result.problems.push({ code: 'MMI_IMAGE_NONE', message: 'the workbook contains no images' });
    return result;
  }

  const documentDirectory = path.dirname(path.resolve(options.fromDocument ?? path.join(process.cwd(), 'x.md')));
  const source = options.sourceLabel ?? (path.relative(documentDirectory, options.sourcePath).split(path.sep).join('/') || path.basename(options.sourcePath));
  // Candidate identity and extracted bytes must describe the same source
  // snapshot. packageBytes is the exact snapshot already used for image parse.
  const sourceDigest = createSourceIdentityFromBytes(packageBytes).digest;
  const candidateByOrdinal = new Map<number, Candidate>();
  if (options.excludeCandidate || options.ledgerPath) {
    const candidates = imageCandidates({
      source,
      sourceDigest,
      images: read.images,
    });
    read.images.forEach((image, index) => {
      candidateByOrdinal.set(image.ordinal, candidates[index]);
    });
  }

  if (options.excludeCandidate) {
    chosen = chosen.filter((image) => {
      const candidate = candidateByOrdinal.get(image.ordinal);
      if (!candidate) return true;
      const exclusion = options.excludeCandidate?.(candidate, image);
      if (!exclusion) return true;
      result.skipped?.push({
        ordinal: image.ordinal,
        sheet: image.sheet,
        ...(image.name ? { name: image.name } : {}),
        code: exclusion.code,
        message: exclusion.message,
      });
      return false;
    });
    if (chosen.length === 0) return result;
  }

  fs.mkdirSync(options.outDir, { recursive: true });
  const outDirectory = fs.realpathSync(options.outDir);
  const sourceReal = fs.realpathSync(options.sourcePath);

  for (const image of chosen) {
    if (!image.extractable) {
      result.problems.push({ ordinal: image.ordinal, sheet: image.sheet, code: 'MMI_IMAGE_UNSUPPORTED_FORMAT', message: `image ${image.ordinal} (${image.name ?? image.sheet}) is ${image.format}; Markdown cannot show it, so it was not extracted` });
      continue;
    }
    let data: Buffer;
    try {
      data = readImageBytes(packageBytes, image);
    } catch (error) {
      result.problems.push({ ordinal: image.ordinal, sheet: image.sheet, code: 'MMI_IMAGE_MEDIA_MISSING', message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const file = path.join(outDirectory, `${image.digest.slice(7, 19)}.${EXTENSION[image.format]}`);
    if (file === sourceReal) {
      result.problems.push({ ordinal: image.ordinal, sheet: image.sheet, code: 'MMI_EXTRACT_TARGET_IS_SOURCE', message: 'refusing to write over the source workbook' });
      continue;
    }
    let status: ExtractedImage['status'] = 'written';
    if (fs.existsSync(file)) {
      if (sha256(fs.readFileSync(file)) !== image.digest) {
        result.problems.push({ ordinal: image.ordinal, sheet: image.sheet, code: 'MMI_EXTRACT_NAME_COLLISION', message: `${file} exists with different content; it was not overwritten` });
        continue;
      }
      status = 'unchanged';
    } else {
      fs.writeFileSync(file, data);
    }
    const relative = path.relative(documentDirectory, file).split(path.sep).join('/');
    const reference = /\s/u.test(relative) ? relative.replace(/ /gu, '%20') : relative;
    const generatedAltText = altText(image);
    result.extracted.push({
      ordinal: image.ordinal,
      sheet: image.sheet,
      ...(image.range ? { anchor: image.range } : {}),
      digest: image.digest,
      file,
      status,
      reference,
      altText: generatedAltText,
      markdown:
        `![${generatedAltText}](${reference})\n`
        + provenanceComment(source, image),
    });
  }
  if (options.ledgerPath && result.extracted.length > 0) {
    const entries: LedgerEntry[] = [];
    for (const item of result.extracted) {
      const image = chosen.find((candidateImage) => candidateImage.ordinal === item.ordinal)!;
      const candidate = candidateByOrdinal.get(item.ordinal)
        ?? imageCandidates({ source, sourceDigest, images: [image] })[0];
      entries.push(entryFor(
        options.ledgerPath,
        options.sourcePath,
        candidate,
        item.file,
        options.basis ?? 'mmi extract',
        {
          mode: 'raw-image-bytes-v1',
          format: image.format,
          reviewMode: 'accepted-reference-v1',
          altText: item.altText,
        },
      ));
    }
    recordEntries(options.ledgerPath, entries);
  }
  return result;
}


function sameCandidateReviewBasis(
  before: Candidate,
  after: Candidate,
): boolean {
  if (
    before.kind !== after.kind
    || before.fingerprint.representation
      !== after.fingerprint.representation
    || before.fingerprint.digest !== after.fingerprint.digest
  ) {
    return false;
  }
  const previous = claimBasisOf(before);
  const current = claimBasisOf(after);
  return previous.length === current.length
    && previous.every((item, index) =>
      item.index === current[index]?.index
      && item.aspect === current[index]?.aspect
      && item.digest === current[index]?.digest);
}

/**
 * Remove only an image asset created by the current unrecorded review draft.
 * Existing content-addressed assets are never removed.
 */
export function discardUnrecordedImageExtraction(
  extracted: ExtractedImage,
): boolean {
  if (
    extracted.status !== 'written'
    || !fs.existsSync(extracted.file)
    || sha256(fs.readFileSync(extracted.file)) !== extracted.digest
  ) {
    return false;
  }
  fs.unlinkSync(extracted.file);
  return true;
}

/**
 * Finalize a human-edited image reference without changing the source image
 * bytes or Candidate epistemic state. The source Candidate is rediscovered
 * before recording so stale review context cannot be adopted silently.
 */
export function finalizeReviewedImageExtraction(
  options: FinalizeReviewedImageOptions,
): FinalizeReviewedImageResult {
  const result: FinalizeReviewedImageResult = { problems: [] };
  if (
    !fs.existsSync(options.extracted.file)
    || sha256(fs.readFileSync(options.extracted.file))
      !== options.extracted.digest
  ) {
    result.problems.push({
      code: 'MMI_IMAGE_REVIEW_ASSET_CHANGED',
      message:
        'extracted image asset changed during review; reopen Candidate review',
    });
    return result;
  }

  let read: ReturnType<typeof readExcelImages>;
  try {
    read = readExcelImages(fs.readFileSync(options.sourcePath));
  } catch (error) {
    result.problems.push({
      code: 'MMI_IMAGE_REVIEW_STALE',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
  const fatal = read.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (fatal) {
    result.problems.push({
      code: 'MMI_IMAGE_REVIEW_STALE',
      message: fatal.message,
      ...(fatal.sheet ? { sheet: fatal.sheet } : {}),
    });
    return result;
  }

  const documentDirectory = path.dirname(
    path.resolve(
      options.fromDocument ?? path.join(process.cwd(), 'x.md'),
    ),
  );
  const source = options.sourceLabel
    ?? (
      path.relative(documentDirectory, options.sourcePath)
        .split(path.sep)
        .join('/')
      || path.basename(options.sourcePath)
    );
  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const currentCandidates = imageCandidates({
    source,
    sourceDigest,
    images: read.images,
  });
  const reviewedPlace = placeOf(options.candidate);
  const currentIndex = currentCandidates.findIndex(
    (candidate) =>
      candidate.locator.sheet === options.candidate.locator.sheet
      && placeOf(candidate) === reviewedPlace,
  );
  const currentCandidate = currentCandidates[currentIndex];
  const currentImage = read.images[currentIndex];
  if (
    !currentCandidate
    || !currentImage
    || !sameCandidateReviewBasis(options.candidate, currentCandidate)
    || currentImage.digest !== options.extracted.digest
  ) {
    result.problems.push({
      code: 'MMI_IMAGE_REVIEW_STALE',
      message:
        'image Candidate changed during review; reopen Candidate review before adopting the edited description',
    });
    return result;
  }

  const reviewedAltText = normalizeImageAltText(options.altText);
  const reviewState: FinalizedReviewedImage['reviewState'] =
    reviewedAltText === options.extracted.altText
      ? 'accepted'
      : 'modified';
  const markdown =
    `![${reviewedAltText}](${options.extracted.reference})\n`
    + provenanceComment(source, currentImage);

  recordEntries(options.ledgerPath, [
    entryFor(
      options.ledgerPath,
      options.sourcePath,
      currentCandidate,
      options.extracted.file,
      options.basis ?? 'MMI Candidate review UI',
      {
        mode: 'raw-image-bytes-v1',
        format: currentImage.format,
        reviewMode:
          reviewState === 'modified'
            ? 'modified-reference-v1'
            : 'accepted-reference-v1',
        altText: reviewedAltText,
      },
      reviewState,
    ),
  ]);

  result.extracted = {
    ...options.extracted,
    altText: reviewedAltText,
    markdown,
    reviewState,
  };
  return result;
}

export function extractTable(options: ExtractTableOptions): ExtractTableResult {
  const result: ExtractTableResult = { problems: [] };
  const workbook = loadWorkbook({ absolutePath: options.sourcePath });
  const sheet = workbook.sheets[options.sheet];
  if (!sheet) {
    result.problems.push({
      code: 'MMI_TABLE_SHEET_NOT_FOUND',
      message: `sheet not found: ${options.sheet}`,
    });
    return result;
  }

  const documentDirectory = path.dirname(
    path.resolve(options.fromDocument ?? path.join(process.cwd(), 'x.md')),
  );
  const source = options.sourceLabel
    ?? (
      path.relative(documentDirectory, options.sourcePath)
        .split(path.sep)
        .join('/')
      || path.basename(options.sourcePath)
    );
  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const candidates = tableCandidates({
    source,
    sourceDigest,
    sheetName: options.sheet,
    sheet,
  });
  const candidate = candidates.find(
    (item) => item.locator.range === options.range,
  );
  if (!candidate) {
    result.problems.push({
      code: 'MMI_TABLE_CANDIDATE_NOT_FOUND',
      message:
        `no table Candidate ${options.sheet}!${options.range}; run \`mmi inspect\` to list detected table Candidates`,
    });
    return result;
  }

  const headerClaim = candidate.claims.find(
    (claim) => claim.aspect === 'header',
  );
  const headerMode = headerClaim?.status === 'inferred'
    && Array.isArray(headerClaim.value)
    ? 'first'
    : 'none';
  // The candidate's own reference decides how the table is shown (header, merged-grid columns).
  const params = new URLSearchParams(parseEmbedSyntax(candidate.reference ?? '')?.params);
  params.set('header', headerMode);
  const query: EmbedQuery = {
    filepath: source,
    target: options.sheet,
    range: options.range,
    params,
    raw: candidate.reference ?? '',
  };

  let tableMarkdown: string;
  try {
    tableMarkdown = toGfmTable(buildLogicalTable(query, workbook));
  } catch (error) {
    result.problems.push({
      code: 'MMI_TABLE_EXTRACT_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const assetText =
    tableMarkdown
    + '\n'
    + tableProvenanceComment(
      source,
      options.sheet,
      options.range,
      sourceDigest,
      candidate.fingerprint.digest,
    )
    + '\n';
  const data = Buffer.from(assetText, 'utf8');
  const digest = sha256(data);

  fs.mkdirSync(options.outDir, { recursive: true });
  const outDirectory = fs.realpathSync(options.outDir);
  const sourceReal = fs.realpathSync(options.sourcePath);
  const file = path.join(outDirectory, `table-${digest.slice(7, 19)}.md`);
  if (file === sourceReal) {
    result.problems.push({
      code: 'MMI_EXTRACT_TARGET_IS_SOURCE',
      message: 'refusing to write over the source document',
    });
    return result;
  }

  let status: ExtractedTable['status'] = 'written';
  if (fs.existsSync(file)) {
    if (sha256(fs.readFileSync(file)) !== digest) {
      result.problems.push({
        code: 'MMI_EXTRACT_NAME_COLLISION',
        message: `${file} exists with different content; it was not overwritten`,
      });
      return result;
    }
    status = 'unchanged';
  } else {
    fs.writeFileSync(file, data);
  }

  result.extracted = {
    sheet: options.sheet,
    range: options.range,
    digest,
    candidateFingerprint: candidate.fingerprint.digest,
    file,
    status,
    markdown: assetText.trimEnd(),
  };

  if (options.ledgerPath) {
    recordEntries(options.ledgerPath, [
      entryFor(
        options.ledgerPath,
        options.sourcePath,
        candidate,
        file,
        'mmi extract --table',
        {
          mode: 'gfm-table-v1',
          header: headerMode,
        },
      ),
    ]);
  }

  return result;
}

/**
 * Delete only an unrecorded table asset created by this extraction call and
 * only while its bytes still match the returned digest. Existing or edited
 * files are never removed.
 */
export function discardUnrecordedTableExtraction(
  extracted: ExtractedTable,
): boolean {
  if (
    extracted.status !== 'written'
    || !fs.existsSync(extracted.file)
    || sha256(fs.readFileSync(extracted.file)) !== extracted.digest
  ) {
    return false;
  }
  fs.unlinkSync(extracted.file);
  return true;
}

/**
 * Finalize a human-reviewed table derivative without rewriting the source or
 * changing the Candidate's epistemic state. The current source Candidate is
 * re-read before recording, so a review cannot silently bind to changed input.
 */
export function finalizeReviewedTableExtraction(
  options: FinalizeReviewedTableOptions,
): FinalizeReviewedTableResult {
  const result: FinalizeReviewedTableResult = { problems: [] };
  const workbook = loadWorkbook({ absolutePath: options.sourcePath });
  const sheet = workbook.sheets[options.extracted.sheet];
  if (!sheet) {
    result.problems.push({
      code: 'MMI_TABLE_REVIEW_STALE',
      message: `sheet changed during review: ${options.extracted.sheet}`,
    });
    return result;
  }

  const documentDirectory = path.dirname(
    path.resolve(
      options.fromDocument ?? path.join(process.cwd(), 'x.md'),
    ),
  );
  const source = options.sourceLabel
    ?? (
      path.relative(documentDirectory, options.sourcePath)
        .split(path.sep)
        .join('/')
      || path.basename(options.sourcePath)
    );
  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const candidate = tableCandidates({
    source,
    sourceDigest,
    sheetName: options.extracted.sheet,
    sheet,
  }).find(
    (item) => item.locator.range === options.extracted.range,
  );
  if (
    !candidate
    || candidate.fingerprint.digest
      !== options.extracted.candidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TABLE_REVIEW_STALE',
      message:
        'table Candidate changed during review; reopen Candidate review before adopting the edited output',
    });
    return result;
  }

  const body = options.editedMarkdown
    .replace(
      /\s*<!-- mmi:extracted-table[\s\S]*?-->\s*$/u,
      '',
    )
    .trimEnd();
  if (body.trim().length === 0) {
    result.problems.push({
      code: 'MMI_TABLE_REVIEW_EMPTY',
      message: 'reviewed table output must not be empty',
    });
    return result;
  }

  const provenance = tableProvenanceComment(
    source,
    options.extracted.sheet,
    options.extracted.range,
    sourceDigest,
    candidate.fingerprint.digest,
  );
  const assetText = `${body}\n${provenance}\n`;
  const data = Buffer.from(assetText, 'utf8');
  const digest = sha256(data);
  const originalBody = options.extracted.markdown
    .replace(
      /\s*<!-- mmi:extracted-table[\s\S]*?-->\s*$/u,
      '',
    )
    .trimEnd();
  const reviewState: FinalizedReviewedTable['reviewState'] =
    body === originalBody ? 'accepted' : 'modified';

  fs.mkdirSync(options.outDir, { recursive: true });
  const outDirectory = fs.realpathSync(options.outDir);
  const sourceReal = fs.realpathSync(options.sourcePath);
  const file = path.join(
    outDirectory,
    `table-${digest.slice(7, 19)}.md`,
  );
  if (file === sourceReal) {
    result.problems.push({
      code: 'MMI_EXTRACT_TARGET_IS_SOURCE',
      message: 'refusing to write over the source document',
    });
    return result;
  }

  let status: ExtractedTable['status'];
  if (
    path.resolve(file) === path.resolve(options.extracted.file)
  ) {
    status = options.extracted.status;
  } else if (fs.existsSync(file)) {
    if (sha256(fs.readFileSync(file)) !== digest) {
      result.problems.push({
        code: 'MMI_EXTRACT_NAME_COLLISION',
        message:
          `${file} exists with different content; it was not overwritten`,
      });
      return result;
    }
    status = 'unchanged';
  } else {
    fs.writeFileSync(file, data);
    status = 'written';
  }

  if (
    path.resolve(file) !== path.resolve(options.extracted.file)
    && options.extracted.status === 'written'
    && fs.existsSync(options.extracted.file)
    && sha256(fs.readFileSync(options.extracted.file))
      === options.extracted.digest
  ) {
    fs.unlinkSync(options.extracted.file);
  }

  const headerClaim = candidate.claims.find(
    (claim) => claim.aspect === 'header',
  );
  const headerMode = headerClaim?.status === 'inferred'
    && Array.isArray(headerClaim.value)
    ? 'first'
    : 'none';
  recordEntries(options.ledgerPath, [
    entryFor(
      options.ledgerPath,
      options.sourcePath,
      candidate,
      file,
      options.basis ?? 'MMI Candidate review UI',
      {
        mode: 'gfm-table-v1',
        header: headerMode,
        reviewMode:
          reviewState === 'modified'
            ? 'modified-output-v1'
            : 'accepted-output-v1',
      },
      reviewState,
    ),
  ]);

  result.extracted = {
    ...options.extracted,
    digest,
    file,
    status,
    markdown: assetText.trimEnd(),
    reviewState,
  };
  return result;
}

export function formatImageDiagnostics(diagnostics: readonly ImageDiagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}${d.sheet ? ` [${d.sheet}]` : ''}: ${d.message}`);
}
