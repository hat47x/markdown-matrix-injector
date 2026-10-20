/**
 * Explicit, reviewed extraction from a Word (.docx) Source Adapter (issue-0531).
 *
 * Only two projections are in scope: one table as a GFM Markdown asset, and
 * one embedded picture as a content-addressed image asset plus Markdown. The
 * source package is read-only. Review-time fingerprints are required so a
 * changed document cannot silently reuse an earlier review.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  readDocx,
  readDocxImageBytes,
  type DocxImage,
  type DocxTable,
} from '../adapters/docxSourceAdapter.js';
import { toGfmTable } from '../core/markdownTable.js';
import { entryFor, recordEntries } from '../core/importLedger.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';

export interface ExtractDocxProblem {
  code: string;
  message: string;
}

export interface ExtractedDocxTable {
  ordinal: number;
  sourceDigest: string;
  candidateFingerprint: string;
  outputDigest: string;
  file: string;
  status: 'written' | 'unchanged';
  markdown: string;
}

export interface ExtractedDocxImage {
  ordinal: number;
  sourceDigest: string;
  candidateFingerprint: string;
  digest: string;
  file: string;
  status: 'written' | 'unchanged';
  altText: string;
  markdown: string;
}

export interface ExtractDocxTableOptions {
  sourcePath: string;
  ordinal: number;
  /** Required review-time fingerprint from `mmi inspect --json`. */
  expectedFingerprint: string;
  workspaceRoot: string;
  outDir: string;
  ledgerPath: string;
  fromDocument?: string;
  sourceLabel?: string;
}

export interface ExtractDocxImageOptions extends ExtractDocxTableOptions {
  /** `all` is intentionally not supported for Word yet: review one picture at a time. */
  ordinal: number;
}

export interface ExtractDocxTableResult {
  extracted?: ExtractedDocxTable;
  problems: ExtractDocxProblem[];
}

export interface ExtractDocxImageResult {
  extracted?: ExtractedDocxImage;
  problems: ExtractDocxProblem[];
}

function sha256Of(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function provenanceValue(value: string): string {
  return value.replace(/[\r\n"]/gu, ' ');
}

function containedPath(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === '' || relative === '..'
      || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('MMI_DOCX_OUTSIDE_ROOT: path must be a file or directory inside workspace');
  }
  return relative;
}

/** Reject symlinked parents; the root itself is trusted after realpath. */
function checkOutputPath(root: string, target: string): void {
  const rootReal = fs.realpathSync(root);
  const relative = containedPath(root, target);
  let cursor = rootReal;
  const segments = relative.split(path.sep);
  for (let index = 0; index < segments.length; index += 1) {
    const isLeaf = index === segments.length - 1;
    cursor = path.join(cursor, segments[index]);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!stat) {
      if (!isLeaf) fs.mkdirSync(cursor, { recursive: false, mode: 0o700 });
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new Error('MMI_DOCX_SYMLINK_PATH: path includes a symbolic link');
    }
    if (!isLeaf && !stat.isDirectory()) {
      throw new Error('MMI_DOCX_NOT_DIRECTORY: output parent is not a directory');
    }
  }
}

function sourceLabelOf(options: ExtractDocxTableOptions): string {
  if (options.sourceLabel) return options.sourceLabel;
  const documentDirectory = path.dirname(
    path.resolve(options.fromDocument ?? path.join(process.cwd(), 'x.md')),
  );
  return path.relative(documentDirectory, path.resolve(options.sourcePath))
    .split(path.sep)
    .join('/') || path.basename(options.sourcePath);
}

function readSource(options: ExtractDocxTableOptions): {
  bytes: Buffer;
  sourceLabel: string;
  sourceDigest: string;
  parsed: ReturnType<typeof readDocx>;
} | ExtractDocxProblem {
  if (!/\.docx$/iu.test(options.sourcePath)) {
    return {
      code: 'MMI_DOCX_PACKAGE_UNSUPPORTED',
      message: 'Word extraction accepts .docx sources only',
    };
  }
  const bytes = fs.readFileSync(options.sourcePath);
  const sourceLabel = sourceLabelOf(options);
  const parsed = readDocx(bytes, sourceLabel);
  if (!parsed.documentReadable) {
    const fatal = parsed.diagnostics.find((item) => item.severity === 'error');
    return {
      code: fatal?.code ?? 'MMI_DOCX_MAIN_DOCUMENT_UNREADABLE',
      message: fatal?.message ?? 'the main document could not be read',
    };
  }
  return {
    bytes,
    sourceLabel,
    sourceDigest: createSourceIdentityFromBytes(bytes).digest,
    parsed,
  };
}

function writeAsset(input: {
  root: string;
  directory: string;
  fileName: string;
  data: Buffer;
}): { file: string; status: 'written' | 'unchanged' } {
  const directory = path.resolve(input.directory);
  const file = path.join(directory, input.fileName);
  // checkOutputPath creates missing parents one at a time after rejecting a
  // symlinked component, so no directory is created through a link.
  checkOutputPath(input.root, file);
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(input.data)) {
      throw new Error(`MMI_DOCX_NAME_COLLISION: ${file} exists with different content`);
    }
    return { file, status: 'unchanged' };
  }
  fs.writeFileSync(file, input.data);
  return { file, status: 'written' };
}

function tableMarkdown(table: DocxTable): string {
  if (table.rows === 0 || table.columns === 0) {
    throw new Error('MMI_DOCX_EMPTY_TABLE: the table has no rows or columns to project');
  }
  return toGfmTable({
    headers: [...(table.grid[0] ?? [])],
    bodyRows: table.grid.slice(1).map((row) => [...row]),
  });
}

function tableProvenanceComment(input: {
  source: string;
  structuralPath: string;
  sourceDigest: string;
  candidateFingerprint: string;
}): string {
  return `<!-- mmi:extracted-table source="${provenanceValue(input.source)}" path="${provenanceValue(input.structuralPath)}" source-sha256="${input.sourceDigest.slice(7)}" candidate-sha256="${input.candidateFingerprint.slice(7)}" -->`;
}

export function extractDocxTable(
  options: ExtractDocxTableOptions,
): ExtractDocxTableResult {
  const result: ExtractDocxTableResult = { problems: [] };
  const source = readSource(options);
  if ('code' in source) {
    result.problems.push(source);
    return result;
  }
  const table = source.parsed.tables.find((item) => item.ordinal === options.ordinal);
  if (!table) {
    result.problems.push({
      code: 'MMI_DOCX_TABLE_NOT_FOUND',
      message: `no Word table ${options.ordinal} (the document has ${source.parsed.tables.length}; run \`mmi inspect\` to list them)`,
    });
    return result;
  }
  if (table.candidate.fingerprint.digest !== options.expectedFingerprint) {
    result.problems.push({
      code: 'MMI_DOCX_TABLE_CHANGED',
      message: 'the table changed after it was shown for review; reopen Candidate review before extraction',
    });
    return result;
  }
  let markdown: string;
  try {
    markdown = tableMarkdown(table);
  } catch (error) {
    result.problems.push({
      code: 'MMI_DOCX_TABLE_EXTRACT_FAILED',
      message: error instanceof Error ? error.message : 'the table could not be projected',
    });
    return result;
  }
  const assetText = markdown
    + '\n'
    + tableProvenanceComment({
      source: source.sourceLabel,
      structuralPath: table.structuralPath,
      sourceDigest: source.sourceDigest,
      candidateFingerprint: table.candidate.fingerprint.digest,
    })
    + '\n';
  const data = Buffer.from(assetText, 'utf8');
  const outputDigest = sha256Of(data);
  let written: { file: string; status: 'written' | 'unchanged' };
  try {
    written = writeAsset({
      root: options.workspaceRoot,
      directory: options.outDir,
      fileName: `table-${outputDigest.slice(7, 19)}.md`,
      data,
    });
  } catch (error) {
    result.problems.push({
      code: 'MMI_DOCX_OUTPUT_FAILED',
      message: error instanceof Error ? error.message : 'the table asset could not be written',
    });
    return result;
  }
  result.extracted = {
    ordinal: table.ordinal,
    sourceDigest: source.sourceDigest,
    candidateFingerprint: table.candidate.fingerprint.digest,
    outputDigest,
    file: written.file,
    status: written.status,
    markdown: assetText.trimEnd(),
  };
  try {
    recordEntries(options.ledgerPath, [
      entryFor(
        options.ledgerPath,
        path.resolve(options.sourcePath),
        table.candidate,
        written.file,
        'mmi extract --docx-table',
        {
          mode: 'gfm-table-v1',
          layout: 'docx-grid-v1',
          header: 'first-row',
        },
      ),
    ]);
  } catch (error) {
    if (written.status === 'written'
        && fs.existsSync(written.file)
        && sha256Of(fs.readFileSync(written.file)) === outputDigest) {
      fs.unlinkSync(written.file);
    }
    result.extracted = undefined;
    result.problems.push({
      code: 'MMI_DOCX_LEDGER_FAILED',
      message: error instanceof Error ? error.message : 'the import ledger could not be updated',
    });
  }
  return result;
}

function imageAltText(image: DocxImage): string {
  const candidate = image.description ?? image.name;
  return (candidate ?? 'Word picture')
    .replace(/[\\[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim() || 'Word picture';
}

function imageExtension(image: DocxImage): string {
  return image.format === 'jpeg' ? 'jpg' : image.format;
}

export function extractDocxImage(
  options: ExtractDocxImageOptions,
): ExtractDocxImageResult {
  const result: ExtractDocxImageResult = { problems: [] };
  const source = readSource(options);
  if ('code' in source) {
    result.problems.push(source);
    return result;
  }
  const image = source.parsed.images.find((item) => item.ordinal === options.ordinal);
  if (!image) {
    result.problems.push({
      code: 'MMI_DOCX_IMAGE_NOT_FOUND',
      message: `no Word picture ${options.ordinal} (the document has ${source.parsed.images.length}; run \`mmi inspect\` to list them)`,
    });
    return result;
  }
  if (image.candidate.fingerprint.digest !== options.expectedFingerprint) {
    result.problems.push({
      code: 'MMI_DOCX_IMAGE_CHANGED',
      message: 'the picture changed after it was shown for review; reopen Candidate review before extraction',
    });
    return result;
  }
  if (!image.extractable) {
    result.problems.push({
      code: 'MMI_DOCX_IMAGE_UNSUPPORTED_FORMAT',
      message: `${image.format} cannot be shown in Markdown and is not extracted`,
    });
    return result;
  }
  let media: Buffer;
  try {
    media = readDocxImageBytes(source.bytes, image);
  } catch (error) {
    result.problems.push({
      code: 'MMI_DOCX_IMAGE_MEDIA_MISSING',
      message: error instanceof Error ? error.message : 'the picture media could not be read',
    });
    return result;
  }
  let written: { file: string; status: 'written' | 'unchanged' };
  try {
    written = writeAsset({
      root: options.workspaceRoot,
      directory: options.outDir,
      fileName: `${image.digest.slice(7, 19)}.${imageExtension(image)}`,
      data: media,
    });
  } catch (error) {
    result.problems.push({
      code: 'MMI_DOCX_OUTPUT_FAILED',
      message: error instanceof Error ? error.message : 'the picture asset could not be written',
    });
    return result;
  }
  const documentDirectory = path.dirname(
    path.resolve(options.fromDocument ?? path.join(process.cwd(), 'x.md')),
  );
  const reference = path.relative(documentDirectory, written.file).split(path.sep).join('/');
  const altText = imageAltText(image);
  const markdown = `![${altText}](${reference})\n`
    + `<!-- mmi:extracted source="${provenanceValue(source.sourceLabel)}" path="${provenanceValue(image.structuralPath)}" sha256="${image.digest.slice(7)}" -->`;
  result.extracted = {
    ordinal: image.ordinal,
    sourceDigest: source.sourceDigest,
    candidateFingerprint: image.candidate.fingerprint.digest,
    digest: image.digest,
    file: written.file,
    status: written.status,
    altText,
    markdown,
  };
  try {
    recordEntries(options.ledgerPath, [
      entryFor(
        options.ledgerPath,
        path.resolve(options.sourcePath),
        image.candidate,
        written.file,
        'mmi extract --docx-image',
        {
          mode: 'docx-image-v1',
          format: image.format,
          media: image.mediaPart,
        },
      ),
    ]);
  } catch (error) {
    if (written.status === 'written'
        && fs.existsSync(written.file)
        && sha256Of(fs.readFileSync(written.file)) === image.digest) {
      fs.unlinkSync(written.file);
    }
    result.extracted = undefined;
    result.problems.push({
      code: 'MMI_DOCX_LEDGER_FAILED',
      message: error instanceof Error ? error.message : 'the import ledger could not be updated',
    });
  }
  return result;
}
