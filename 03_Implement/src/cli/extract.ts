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

import { entryFor, recordEntries, type LedgerEntry } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';

export interface ExtractOptions {
  sourcePath: string;
  /** `all` or a 1-based image number as printed by `inspect`. */
  selection: string;
  outDir: string;
  /** Markdown references are written relative to this document's folder (default: current directory). */
  fromDocument?: string;
  /** Source as it should be written in provenance (default: relative to the document folder). */
  sourceLabel?: string;
  /** When set, each extracted picture is recorded in this import ledger (issue-0195). */
  ledgerPath?: string;
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
}

const EXTENSION: Record<string, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', svg: 'svg' };

const sha256 = (data: Buffer): string => `sha256:${createHash('sha256').update(data).digest('hex')}`;

function altText(image: ExcelImage): string {
  const raw = image.description ?? image.name ?? `${image.sheet} 画像${image.ordinal}`;
  return raw.replace(/[\r\n]+/gu, ' ').replace(/[[\]]/gu, '').trim();
}

/** Provenance as an HTML comment: invisible in rendered Markdown, greppable, and `--` is escaped so it cannot end the comment early. */
function provenanceComment(source: string, image: ExcelImage): string {
  const value = (text: string) => text.replace(/--/gu, '- -').replace(/"/gu, "'").replace(/[\r\n]+/gu, ' ');
  return `<!-- mmi:extracted source="${value(source)}" sheet="${value(image.sheet)}"${image.range ? ` anchor="${image.range}"` : ''} sha256="${image.digest.slice(7)}" -->`;
}

export function extractImages(options: ExtractOptions): ExtractResult {
  const result: ExtractResult = { extracted: [], problems: [] };
  const packageBytes = fs.readFileSync(options.sourcePath);
  if (!/\.(xlsx|xlsm)$/iu.test(options.sourcePath)) {
    result.problems.push({ code: 'MMI_IMAGE_PACKAGE_UNSUPPORTED', message: 'images can only be extracted from .xlsx / .xlsm workbooks' });
    return result;
  }
  const read = readExcelImages(packageBytes);
  for (const diagnostic of read.diagnostics.filter((d) => d.severity === 'error')) {
    result.problems.push({ code: diagnostic.code, message: diagnostic.message });
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
  if (chosen.length === 0) result.problems.push({ code: 'MMI_IMAGE_NONE', message: 'the workbook contains no images' });

  const documentDirectory = path.dirname(path.resolve(options.fromDocument ?? path.join(process.cwd(), 'x.md')));
  const source = options.sourceLabel ?? (path.relative(documentDirectory, options.sourcePath).split(path.sep).join('/') || path.basename(options.sourcePath));
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
    result.extracted.push({
      ordinal: image.ordinal,
      sheet: image.sheet,
      ...(image.range ? { anchor: image.range } : {}),
      digest: image.digest,
      file,
      status,
      reference,
      markdown: `![${altText(image)}](${reference})\n${provenanceComment(source, image)}`,
    });
  }
  if (options.ledgerPath && result.extracted.length > 0) {
    const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
    const entries: LedgerEntry[] = [];
    for (const item of result.extracted) {
      const image = chosen.find((candidateImage) => candidateImage.ordinal === item.ordinal)!;
      const [candidate] = imageCandidates({ source: source, sourceDigest, images: [image] });
      entries.push(entryFor(
        options.ledgerPath,
        options.sourcePath,
        candidate,
        item.file,
        'mmi extract',
        { mode: 'raw-image-bytes-v1', format: image.format },
      ));
    }
    recordEntries(options.ledgerPath, entries);
  }
  return result;
}

export function formatImageDiagnostics(diagnostics: readonly ImageDiagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}${d.sheet ? ` [${d.sheet}]` : ''}: ${d.message}`);
}
