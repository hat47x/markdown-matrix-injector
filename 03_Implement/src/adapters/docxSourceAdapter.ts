/**
 * Word (.docx) Source Adapter (issue-0531).
 *
 * Reads the OOXML package read-only and exposes only structures the document
 * itself states: paragraphs with an explicit heading style/outline level,
 * tables, embedded pictures, and Word comments. It does not infer sections
 * from formatting, does not flatten nested tables, does not resolve tracked
 * changes, and never writes to the package.
 *
 * Epistemic footing, claim by claim:
 *   structural path, table shape, heading level/text, comment id/author/date/text,
 *   picture media/format/size/digest          observed   M0   stated by the package
 *   header row                                observed   M0   only when w:tblHeader is present;
 *                                                          otherwise the claim abstains
 * Everything is deterministic; no model is involved. A header row used for
 * Markdown projection is a conversion choice, not a source claim.
 *
 * One unreadable optional part (styles, comments, one picture) becomes a
 * diagnostic and does not stop the other Candidates. A missing or malformed
 * main document is fatal for inspection and is reported as an error.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

import { SaxesParser, type SaxesTagNS } from 'saxes';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
  type Claim,
} from '../core/candidate.js';
import {
  isExtractableMediaFormat,
  mediaFormatOf,
  type MediaFormat,
} from '../core/mediaFormat.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import { readZip, ZipError, type ZipEntry } from '../core/zipReader.js';

export const DOCX_ADAPTER_ALGORITHM = 'mmi.docx-source-reader';
/** Bump when parsing rules change in a way that can change output. */
export const DOCX_ADAPTER_VERSION = '1';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const V = 'urn:schemas-microsoft-com:vml';

export type DocxDiagnosticCode =
  | 'MMI_DOCX_NOT_A_PACKAGE'
  | 'MMI_DOCX_PACKAGE_UNSUPPORTED'
  | 'MMI_DOCX_MAIN_DOCUMENT_MISSING'
  | 'MMI_DOCX_MAIN_DOCUMENT_UNREADABLE'
  | 'MMI_DOCX_PART_UNREADABLE'
  | 'MMI_DOCX_XML_UNSUPPORTED'
  | 'MMI_DOCX_IMAGE_EXTERNAL_LINK'
  | 'MMI_DOCX_IMAGE_MEDIA_MISSING'
  | 'MMI_DOCX_IMAGE_UNSUPPORTED_FORMAT'
  | 'MMI_DOCX_DRAWING_NOT_EXTRACTED'
  | 'MMI_DOCX_NESTED_TABLE_NOT_FLATTENED'
  | 'MMI_DOCX_HEADING_IN_TABLE'
  | 'MMI_DOCX_EMPTY_HEADING'
  | 'MMI_DOCX_COMMENT_ANCHOR_MISSING'
  | 'MMI_DOCX_COMMENT_UNKNOWN';

export interface DocxDiagnostic {
  code: DocxDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  /** Package part such as `word/document.xml`. */
  part?: string;
  structuralPath?: string;
}

export interface DocxHeading {
  ordinal: number;
  level: number;
  text: string;
  styleId?: string;
  structuralPath: string;
  candidate: Candidate;
}

export interface DocxTable {
  ordinal: number;
  structuralPath: string;
  /** Expanded display grid: gridSpan fills empty cells, row/column order preserved. */
  grid: readonly (readonly string[])[];
  rows: number;
  columns: number;
  /** 1-based row with an explicit w:tblHeader, when the document names one. */
  explicitHeaderRow?: number;
  candidate: Candidate;
}

export interface DocxImage {
  ordinal: number;
  structuralPath: string;
  name?: string;
  description?: string;
  mediaPart: string;
  format: MediaFormat;
  bytes: number;
  digest: string;
  extractable: boolean;
  extentEmu?: { cx: number; cy: number };
  candidate: Candidate;
}

export interface DocxComment {
  ordinal: number;
  id: string;
  author?: string;
  initials?: string;
  date?: string;
  text: string;
  /** Paragraph that contains the comment range start (or the reference). */
  structuralPath?: string;
  candidate: Candidate;
}

export interface DocxReadResult {
  source: string;
  sourceDigest: string;
  documentReadable: boolean;
  headings: DocxHeading[];
  tables: DocxTable[];
  images: DocxImage[];
  comments: DocxComment[];
  candidates: Candidate[];
  diagnostics: DocxDiagnostic[];
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

interface StyleInfo {
  name?: string;
  basedOn?: string;
  outlineLevel?: number;
}

interface RawComment {
  id: string;
  author?: string;
  initials?: string;
  date?: string;
  paragraphs: string[];
}

interface DrawingFrame {
  structuralPath: string;
  relationshipId?: string;
  externalRelationshipId?: string;
  name?: string;
  description?: string;
  extentEmu?: { cx: number; cy: number };
  hasImageReference: boolean;
  graphicKind?: string;
}

interface ParagraphFrame {
  structuralPath: string;
  finalize: boolean;
  parts: string[];
  styleId?: string;
  outlineLevel?: number;
  drawingOrdinal: number;
  commentStarts: string[];
  commentRefs: string[];
  cell?: CellFrame;
}

interface CellFrame {
  structuralPath: string;
  gridSpan: number;
  verticalMerge: 'none' | 'restart' | 'continue';
  paragraphs: string[];
  childCounters: Map<string, number>;
}

interface RowFrame {
  structuralPath: string;
  cells: CellFrame[];
  repeatedHeader: boolean;
}

interface TableFrame {
  ordinal: number;
  structuralPath: string;
  rows: RowFrame[];
  currentRow?: RowFrame;
  parentCell?: CellFrame;
  ignored: boolean;
}

interface DocumentParseResult {
  headings: DocxHeading[];
  tables: DocxTable[];
  images: DocxImage[];
  commentAnchors: Map<string, string>;
  commentReferences: Map<string, string[]>;
  diagnostics: DocxDiagnostic[];
}

function emptyResult(source: string, sourceDigest: string): DocxReadResult {
  return {
    source,
    sourceDigest,
    documentReadable: false,
    headings: [],
    tables: [],
    images: [],
    comments: [],
    candidates: [],
    diagnostics: [],
  };
}

function attribute(tag: SaxesTagNS, uri: string, local: string): string | undefined {
  for (const item of Object.values(tag.attributes)) {
    if (item.uri === uri && item.local === local) return item.value;
  }
  return undefined;
}

/** Unqualified attributes such as `cx`, `name`, `descr`, `uri`, `Id`, `Target`. */
function attributeAny(tag: SaxesTagNS, local: string): string | undefined {
  for (const item of Object.values(tag.attributes)) {
    if (item.local === local) return item.value;
  }
  return undefined;
}

function hasAncestor(stack: readonly SaxesTagNS[], uri: string, local: string): boolean {
  for (let index = stack.length - 2; index >= 0; index -= 1) {
    if (stack[index].uri === uri && stack[index].local === local) return true;
  }
  return false;
}

function xmlTextOf(entry: ZipEntry, part: string, diagnostics: DocxDiagnostic[]): string | undefined {
  let bytes: Buffer;
  try {
    bytes = entry.read();
  } catch (error) {
    diagnostics.push({
      code: 'MMI_DOCX_PART_UNREADABLE',
      severity: 'warning',
      part,
      message: error instanceof Error ? error.message : 'package entry could not be read',
    });
    return undefined;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/iu.test(text)) {
      throw new Error('DTD/ENTITY declarations are not supported');
    }
    return text.replace(/^\uFEFF/u, '');
  } catch (error) {
    diagnostics.push({
      code: 'MMI_DOCX_XML_UNSUPPORTED',
      severity: 'warning',
      part,
      message: error instanceof Error ? error.message : 'XML part is not readable UTF-8',
    });
    return undefined;
  }
}

function parseWithSaxes(text: string, part: string, onTag: (tag: SaxesTagNS) => void): void {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('xmldecl', (declaration) => {
    if (declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) {
      throw new Error(`WordprocessingML part ${part} must declare UTF-8, not ${declaration.encoding}`);
    }
  });
  parser.on('doctype', () => {
    throw new Error(`DTD/declaration syntax is not supported in ${part}`);
  });
  parser.on('opentag', onTag);
  parser.write(text).close();
}

function normalizePartTarget(part: string, target: string): string | undefined {
  if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target)) return undefined;
  const resolved = target.startsWith('/')
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
  if (!resolved || resolved === '.' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
    return undefined;
  }
  return resolved;
}

function relationshipsOf(
  zip: Map<string, ZipEntry>,
  part: string,
  diagnostics: DocxDiagnostic[],
): Map<string, Relationship> {
  const relsPart = path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`);
  const entry = zip.get(relsPart);
  const relationships = new Map<string, Relationship>();
  if (!entry) return relationships;
  const text = xmlTextOf(entry, relsPart, diagnostics);
  if (text === undefined) return relationships;
  try {
    parseWithSaxes(text, relsPart, (tag) => {
      if (tag.uri !== 'http://schemas.openxmlformats.org/package/2006/relationships'
          || tag.local !== 'Relationship') return;
      const id = attributeAny(tag, 'Id');
      const type = attributeAny(tag, 'Type');
      const rawTarget = attributeAny(tag, 'Target');
      const mode = attributeAny(tag, 'TargetMode');
      if (!id || !type || rawTarget === undefined) return;
      const external = mode === 'External';
      const target = external ? rawTarget : normalizePartTarget(part, rawTarget);
      if (target === undefined) {
        diagnostics.push({
          code: 'MMI_DOCX_XML_UNSUPPORTED',
          severity: 'warning',
          part: relsPart,
          message: `relationship ${id} points outside the package and is ignored`,
        });
        return;
      }
      relationships.set(id, { id, type, target, external });
    });
  } catch (error) {
    diagnostics.push({
      code: 'MMI_DOCX_PART_UNREADABLE',
      severity: 'warning',
      part: relsPart,
      message: error instanceof Error ? error.message : 'relationship part could not be parsed',
    });
  }
  return relationships;
}

function stylesOf(
  zip: Map<string, ZipEntry>,
  diagnostics: DocxDiagnostic[],
): Map<string, StyleInfo> {
  const part = 'word/styles.xml';
  const entry = zip.get(part);
  const styles = new Map<string, StyleInfo>();
  if (!entry) return styles;
  const text = xmlTextOf(entry, part, diagnostics);
  if (text === undefined) return styles;
  let currentId: string | undefined;
  let current: StyleInfo | undefined;
  const stack: SaxesTagNS[] = [];
  try {
    const parser = new SaxesParser({ xmlns: true });
    parser.on('xmldecl', (declaration) => {
      if (declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) {
        throw new Error(`${part} must declare UTF-8`);
      }
    });
    parser.on('doctype', () => {
      throw new Error(`DTD/declaration syntax is not supported in ${part}`);
    });
    parser.on('opentag', (tag) => {
      stack.push(tag);
      if (tag.uri === W && tag.local === 'style') {
        currentId = attribute(tag, W, 'styleId');
        current = {};
        return;
      }
      if (!current) return;
      const parent = stack[stack.length - 2];
      const grandparent = stack[stack.length - 3];
      if (tag.uri !== W) return;
      if (parent?.uri === W && parent.local === 'style') {
        if (tag.local === 'name') {
          const name = attribute(tag, W, 'val');
          if (name) current.name = name;
        } else if (tag.local === 'basedOn') {
          const basedOn = attribute(tag, W, 'val');
          if (basedOn) current.basedOn = basedOn;
        }
      } else if (tag.local === 'outlineLvl'
          && parent?.uri === W && parent.local === 'pPr'
          && grandparent?.uri === W && grandparent.local === 'style') {
        const level = Number(attribute(tag, W, 'val'));
        if (Number.isInteger(level) && level >= 0 && level <= 8) current.outlineLevel = level;
      }
    });
    parser.on('closetag', (tag) => {
      stack.pop();
      if (tag.uri === W && tag.local === 'style') {
        if (currentId && current) styles.set(currentId, current);
        currentId = undefined;
        current = undefined;
      }
    });
    parser.write(text).close();
  } catch (error) {
    diagnostics.push({
      code: 'MMI_DOCX_PART_UNREADABLE',
      severity: 'warning',
      part,
      message: error instanceof Error ? error.message : 'style part could not be parsed',
    });
    return new Map();
  }
  return styles;
}

function commentsOf(
  zip: Map<string, ZipEntry>,
  diagnostics: DocxDiagnostic[],
): RawComment[] {
  const part = 'word/comments.xml';
  const entry = zip.get(part);
  const comments: RawComment[] = [];
  if (!entry) return comments;
  const text = xmlTextOf(entry, part, diagnostics);
  if (text === undefined) return comments;
  let current: RawComment | undefined;
  let paragraph: string[] | undefined;
  let textSink: string[] | undefined;
  try {
    const parser = new SaxesParser({ xmlns: true });
    parser.on('xmldecl', (declaration) => {
      if (declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) {
        throw new Error(`${part} must declare UTF-8`);
      }
    });
    parser.on('doctype', () => {
      throw new Error(`DTD/declaration syntax is not supported in ${part}`);
    });
    parser.on('opentag', (tag) => {
      if (tag.uri === W && tag.local === 'comment') {
        const id = attribute(tag, W, 'id');
        if (!id) return;
        current = {
          id,
          ...(attribute(tag, W, 'author') ? { author: attribute(tag, W, 'author') } : {}),
          ...(attribute(tag, W, 'initials') ? { initials: attribute(tag, W, 'initials') } : {}),
          ...(attribute(tag, W, 'date') ? { date: attribute(tag, W, 'date') } : {}),
          paragraphs: [],
        };
      } else if (current && tag.uri === W && tag.local === 'p') {
        paragraph = [];
      } else if (current && tag.uri === W && tag.local === 't') {
        textSink = paragraph;
      } else if (current && paragraph && tag.uri === W && tag.local === 'tab') {
        paragraph.push('\t');
      } else if (current && paragraph && (tag.uri === W && (tag.local === 'br' || tag.local === 'cr'))) {
        paragraph.push('\n');
      }
    });
    parser.on('text', (value) => {
      textSink?.push(value);
    });
    parser.on('closetag', (tag) => {
      if (tag.uri === W && tag.local === 't') {
        textSink = undefined;
      } else if (current && tag.uri === W && tag.local === 'p') {
        current.paragraphs.push((paragraph ?? []).join(''));
        paragraph = undefined;
      } else if (tag.uri === W && tag.local === 'comment' && current) {
        comments.push(current);
        current = undefined;
      }
    });
    parser.write(text).close();
  } catch (error) {
    diagnostics.push({
      code: 'MMI_DOCX_PART_UNREADABLE',
      severity: 'warning',
      part,
      message: error instanceof Error ? error.message : 'comment part could not be parsed',
    });
    return [];
  }
  return comments;
}

function headingMatch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(?:heading\s*|見出し\s*)([1-9])$/iu.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function headingLevelOf(
  paragraph: ParagraphFrame,
  styles: ReadonlyMap<string, StyleInfo>,
): { level: number; basis: string } | undefined {
  if (paragraph.outlineLevel !== undefined) {
    return { level: paragraph.outlineLevel + 1, basis: 'outline-level' };
  }
  if (!paragraph.styleId) return undefined;
  const direct = headingMatch(paragraph.styleId);
  if (direct !== undefined) return { level: direct, basis: 'heading-style-id' };
  let currentId: string | undefined = paragraph.styleId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 10 && currentId && !seen.has(currentId); depth += 1) {
    seen.add(currentId);
    const style = styles.get(currentId);
    if (!style) return undefined;
    const byName = headingMatch(style.name);
    if (byName !== undefined) return { level: byName, basis: 'heading-style-name' };
    const byId = headingMatch(currentId);
    if (byId !== undefined) return { level: byId, basis: 'heading-style-id' };
    if (style.outlineLevel !== undefined) {
      return { level: style.outlineLevel + 1, basis: 'style-outline-level' };
    }
    currentId = style.basedOn;
  }
  return undefined;
}

function normalizeParagraphText(parts: readonly string[]): string {
  return parts.join('').replace(/\r\n?/gu, '\n').trim();
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function sha256Of(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function tableGrid(table: TableFrame): string[][] {
  const grid = table.rows.map((row) => {
    const output: string[] = [];
    for (const cell of row.cells) {
      output.push(normalizeParagraphText(cell.paragraphs));
      for (let index = 1; index < cell.gridSpan; index += 1) output.push('');
    }
    return output;
  });
  const columns = Math.max(1, ...grid.map((row) => row.length));
  return grid.map((row) => [
    ...row,
    ...Array.from({ length: columns - row.length }, () => ''),
  ]);
}

function docxTableCandidate(input: {
  source: string;
  sourceDigest: string;
  table: TableFrame;
  grid: string[][];
  explicitHeaderRow?: number;
}): Candidate {
  const claims: Claim[] = [
    {
      aspect: 'structural-path',
      value: input.table.structuralPath,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-table-position',
    },
    {
      aspect: 'rows',
      value: String(input.grid.length),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-table-rows',
    },
    {
      aspect: 'columns',
      value: String(input.grid[0]?.length ?? 0),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-table-grid',
    },
  ];
  if (input.explicitHeaderRow !== undefined) {
    claims.push({
      aspect: 'header-row',
      value: String(input.explicitHeaderRow),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-tbl-header',
    });
  } else {
    claims.push({
      aspect: 'header-row',
      status: 'abstained',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'no-explicit-header-row',
    });
  }
  const candidate: Candidate = {
    kind: 'table-range',
    locator: {
      source: input.source,
      sourceDigest: input.sourceDigest,
      structuralPath: input.table.structuralPath,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: DOCX_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: {
          representation: 'docx-table-grid-v1',
          gridSpan: true,
          verticalMerge: true,
        },
        implementationVersion: DOCX_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'docx-table-grid-v1',
      JSON.stringify({ grid: input.grid, headerRow: input.explicitHeaderRow ?? 0 }),
    ),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) throw new Error(`invalid Word table Candidate at ${input.table.structuralPath}: ${problem}`);
  return candidate;
}

function headingCandidate(input: {
  source: string;
  sourceDigest: string;
  level: number;
  text: string;
  styleId?: string;
  structuralPath: string;
}): Candidate {
  const claims: Claim[] = [
    {
      aspect: 'structural-path',
      value: input.structuralPath,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-paragraph-position',
    },
    {
      aspect: 'heading-level',
      value: String(input.level),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'explicit-heading-style-or-outline-level',
    },
    {
      aspect: 'heading-text',
      value: input.text,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-text',
    },
  ];
  if (input.styleId) {
    claims.push({
      aspect: 'style-id',
      value: input.styleId,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-style-id',
    });
  }
  const candidate: Candidate = {
    kind: 'section',
    locator: {
      source: input.source,
      sourceDigest: input.sourceDigest,
      structuralPath: input.structuralPath,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: DOCX_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: { headingSource: 'explicit-style-or-outline-level' },
        implementationVersion: DOCX_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf('docx-heading-v1', `${input.level}\u001f${input.text}`),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) throw new Error(`invalid Word heading Candidate at ${input.structuralPath}: ${problem}`);
  return candidate;
}

function imageCandidate(input: {
  source: string;
  sourceDigest: string;
  image: Omit<DocxImage, 'candidate'>;
}): Candidate {
  const { image } = input;
  const claims: Claim[] = [
    {
      aspect: 'structural-path',
      value: image.structuralPath,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-drawing-position',
    },
    {
      aspect: 'media',
      value: image.mediaPart,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'package-relationship',
    },
    {
      aspect: 'format',
      value: image.format,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'media-signature',
    },
    {
      aspect: 'bytes',
      value: String(image.bytes),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'package-entry-size',
    },
    {
      aspect: 'digest',
      value: image.digest,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'media-sha256',
    },
  ];
  if (image.name) {
    claims.push({
      aspect: 'name',
      value: image.name,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'drawing-property',
    });
  }
  if (image.description) {
    claims.push({
      aspect: 'description',
      value: image.description,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'drawing-property',
    });
  }
  if (image.extentEmu) {
    claims.push({
      aspect: 'extent-emu',
      value: `${image.extentEmu.cx}x${image.extentEmu.cy}`,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'drawing-extent',
    });
  }
  const candidate: Candidate = {
    kind: 'image',
    locator: {
      source: input.source,
      sourceDigest: input.sourceDigest,
      structuralPath: image.structuralPath,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: DOCX_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: { media: 'wordprocessingml-drawing' },
        implementationVersion: DOCX_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf('image-media-bytes-v1', image.digest),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) throw new Error(`invalid Word image Candidate at ${image.structuralPath}: ${problem}`);
  return candidate;
}

function commentCandidate(input: {
  source: string;
  sourceDigest: string;
  comment: RawComment;
  structuralPath?: string;
  ordinal: number;
}): Candidate {
  const { comment } = input;
  const claims: Claim[] = [
    {
      aspect: 'comment-id',
      value: comment.id,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-comment-id',
    },
    {
      aspect: 'text',
      value: comment.paragraphs.join('\n'),
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-comment-text',
    },
  ];
  if (comment.author) {
    claims.push({
      aspect: 'author',
      value: comment.author,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-comment-author',
    });
  }
  if (comment.date) {
    claims.push({
      aspect: 'date',
      value: comment.date,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'wordprocessingml-comment-date',
    });
  }
  if (input.structuralPath) {
    claims.push({
      aspect: 'anchor',
      value: input.structuralPath,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'comment-range-start',
    });
  } else {
    claims.push({
      aspect: 'anchor',
      status: 'abstained',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'comment-anchor-missing',
    });
  }
  const candidate: Candidate = {
    kind: 'note',
    locator: {
      source: input.source,
      sourceDigest: input.sourceDigest,
      structuralPath: input.structuralPath ?? `comments/comment[${input.ordinal}]`,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: DOCX_ADAPTER_ALGORITHM,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: { commentAnchor: 'range-start-or-reference' },
        implementationVersion: DOCX_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'docx-comment-v1',
      `${comment.author ?? ''}\u001f${comment.date ?? ''}\u001f${comment.paragraphs.join('\n')}`,
    ),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) throw new Error(`invalid Word comment Candidate at ${candidate.locator.structuralPath}: ${problem}`);
  return candidate;
}

function parseDocument(input: {
  xml: string;
  source: string;
  sourceDigest: string;
  relationships: ReadonlyMap<string, Relationship>;
  styles: ReadonlyMap<string, StyleInfo>;
  zip: Map<string, ZipEntry>;
}): DocumentParseResult {
  const result: DocumentParseResult = {
    headings: [],
    tables: [],
    images: [],
    commentAnchors: new Map(),
    commentReferences: new Map(),
    diagnostics: [],
  };
  const stack: SaxesTagNS[] = [];
  const paragraphStack: ParagraphFrame[] = [];
  const tableStack: TableFrame[] = [];
  const bodyCounters = new Map<string, number>();
  const drawingStack: DrawingFrame[] = [];
  let currentCell: CellFrame | undefined;
  let tableOrdinal = 0;
  let documentTextSink: string[] | undefined;

  const bump = (counters: Map<string, number>, key: string): number => {
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return value;
  };

  const insideDrawing = (): boolean =>
    hasAncestor(stack, W, 'drawing') || hasAncestor(stack, W, 'pict');
  const inBody = (): boolean => hasAncestor(stack, W, 'body');

  const finishParagraph = (paragraph: ParagraphFrame): void => {
    if (!paragraph.finalize) return;
    const text = normalizeParagraphText(paragraph.parts);
    if (paragraph.cell) {
      paragraph.cell.paragraphs.push(text);
    }
    const headingText = normalizeHeadingText(text);
    const isBodyParagraph = !paragraph.cell;
    const styleHeading = headingLevelOf(paragraph, input.styles);
    if (styleHeading) {
      if (!isBodyParagraph) {
        result.diagnostics.push({
          code: 'MMI_DOCX_HEADING_IN_TABLE',
          severity: 'warning',
          part: 'word/document.xml',
          structuralPath: paragraph.structuralPath,
          message: 'a heading style inside a table cell is observed but not exposed as a Section Candidate',
        });
      } else if (headingText.length === 0) {
        result.diagnostics.push({
          code: 'MMI_DOCX_EMPTY_HEADING',
          severity: 'warning',
          part: 'word/document.xml',
          structuralPath: paragraph.structuralPath,
          message: 'a heading-styled paragraph has no text',
        });
      } else {
        const candidate = headingCandidate({
          source: input.source,
          sourceDigest: input.sourceDigest,
          level: styleHeading.level,
          text: headingText,
          ...(paragraph.styleId ? { styleId: paragraph.styleId } : {}),
          structuralPath: paragraph.structuralPath,
        });
        result.headings.push({
          ordinal: result.headings.length + 1,
          level: styleHeading.level,
          text: headingText,
          ...(paragraph.styleId ? { styleId: paragraph.styleId } : {}),
          structuralPath: paragraph.structuralPath,
          candidate,
        });
      }
    }
    for (const id of paragraph.commentStarts) {
      if (!result.commentAnchors.has(id)) result.commentAnchors.set(id, paragraph.structuralPath);
    }
    for (const id of paragraph.commentRefs) {
      const list = result.commentReferences.get(id) ?? [];
      list.push(paragraph.structuralPath);
      result.commentReferences.set(id, list);
    }
  };

  const finishDrawing = (drawing: DrawingFrame): void => {
    if (drawing.externalRelationshipId) {
      result.diagnostics.push({
        code: 'MMI_DOCX_IMAGE_EXTERNAL_LINK',
        severity: 'warning',
        part: 'word/document.xml',
        structuralPath: drawing.structuralPath,
        message: 'the picture links to an external image and is not embedded; it is not fetched',
      });
      return;
    }
    if (!drawing.relationshipId) {
      result.diagnostics.push({
        code: 'MMI_DOCX_DRAWING_NOT_EXTRACTED',
        severity: 'warning',
        part: 'word/document.xml',
        structuralPath: drawing.structuralPath,
        message: drawing.graphicKind
          ? `drawing graphic (${drawing.graphicKind}) has no embedded picture and is not extracted`
          : 'drawing has no embedded picture and is not extracted',
      });
      return;
    }
    const relationship = input.relationships.get(drawing.relationshipId);
    if (!relationship || relationship.external) {
      result.diagnostics.push({
        code: 'MMI_DOCX_IMAGE_MEDIA_MISSING',
        severity: 'warning',
        part: 'word/document.xml',
        structuralPath: drawing.structuralPath,
        message: `picture relationship ${drawing.relationshipId} is missing or external`,
      });
      return;
    }
    const entry = input.zip.get(relationship.target);
    if (!entry) {
      result.diagnostics.push({
        code: 'MMI_DOCX_IMAGE_MEDIA_MISSING',
        severity: 'warning',
        part: relationship.target,
        structuralPath: drawing.structuralPath,
        message: `picture media ${relationship.target} is missing from the package`,
      });
      return;
    }
    let bytes: Buffer;
    try {
      bytes = entry.read();
    } catch (error) {
      result.diagnostics.push({
        code: 'MMI_DOCX_IMAGE_MEDIA_MISSING',
        severity: 'warning',
        part: relationship.target,
        structuralPath: drawing.structuralPath,
        message: error instanceof Error ? error.message : 'picture media could not be read',
      });
      return;
    }
    const format = mediaFormatOf(bytes, relationship.target);
    const digest = sha256Of(bytes);
    const extractable = isExtractableMediaFormat(format);
    if (!extractable) {
      result.diagnostics.push({
        code: 'MMI_DOCX_IMAGE_UNSUPPORTED_FORMAT',
        severity: 'warning',
        part: relationship.target,
        structuralPath: drawing.structuralPath,
        message: `${format} cannot be shown in Markdown; the picture is listed but not extracted`,
      });
    }
    const image: Omit<DocxImage, 'candidate'> = {
      ordinal: result.images.length + 1,
      structuralPath: drawing.structuralPath,
      ...(drawing.name ? { name: drawing.name } : {}),
      ...(drawing.description ? { description: drawing.description } : {}),
      mediaPart: relationship.target,
      format,
      bytes: bytes.length,
      digest,
      extractable,
      ...(drawing.extentEmu ? { extentEmu: drawing.extentEmu } : {}),
    };
    result.images.push({
      ...image,
      candidate: imageCandidate({ source: input.source, sourceDigest: input.sourceDigest, image }),
    });
  };

  const finishTable = (table: TableFrame): void => {
    const grid = tableGrid(table);
    const explicitHeaderRowIndex = table.rows.findIndex((row) => row.repeatedHeader);
    const explicitHeaderRow = explicitHeaderRowIndex >= 0 ? explicitHeaderRowIndex + 1 : undefined;
    const candidate = docxTableCandidate({
      source: input.source,
      sourceDigest: input.sourceDigest,
      table,
      grid,
      ...(explicitHeaderRow === undefined ? {} : { explicitHeaderRow }),
    });
    result.tables.push({
      ordinal: table.ordinal,
      structuralPath: table.structuralPath,
      grid,
      rows: grid.length,
      columns: grid[0]?.length ?? 0,
      ...(explicitHeaderRow === undefined ? {} : { explicitHeaderRow }),
      candidate,
    });
  };

  const parser = new SaxesParser({ xmlns: true });
  parser.on('xmldecl', (declaration) => {
    if (declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) {
      throw new Error(`word/document.xml must declare UTF-8, not ${declaration.encoding}`);
    }
  });
  parser.on('doctype', () => {
    throw new Error('DTD/declaration syntax is not supported in word/document.xml');
  });
  parser.on('opentag', (tag) => {
    stack.push(tag);
    if (tag.uri !== W) {
      if (drawingStack.length > 0 && tag.uri === A && tag.local === 'blip') {
        const drawing = drawingStack[drawingStack.length - 1];
        const embed = attribute(tag, R, 'embed');
        const link = attribute(tag, R, 'link');
        if (embed) {
          drawing.relationshipId = embed;
          drawing.hasImageReference = true;
        }
        if (link) {
          drawing.externalRelationshipId = link;
          drawing.hasImageReference = true;
        }
      } else if (drawingStack.length > 0 && tag.uri === V && tag.local === 'imagedata') {
        const drawing = drawingStack[drawingStack.length - 1];
        const id = attribute(tag, R, 'id');
        if (id) {
          drawing.relationshipId = id;
          drawing.hasImageReference = true;
        }
      } else if (drawingStack.length > 0 && (tag.uri === WP || tag.uri === PIC)) {
        const drawing = drawingStack[drawingStack.length - 1];
        if (tag.local === 'docPr' || tag.local === 'cNvPr') {
          const name = attributeAny(tag, 'name');
          const description = attributeAny(tag, 'descr');
          if (name && !drawing.name) drawing.name = name;
          if (description && !drawing.description) drawing.description = description;
        } else if (tag.local === 'extent') {
          const cx = Number(attributeAny(tag, 'cx'));
          const cy = Number(attributeAny(tag, 'cy'));
          if (Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0) {
            drawing.extentEmu = { cx, cy };
          }
        }
      } else if (drawingStack.length > 0 && tag.uri === A && tag.local === 'graphicData') {
        const uri = attributeAny(tag, 'uri');
        if (uri) {
          const match = /(chart|diagram|smartArt|picture)[^/]*$/iu.exec(uri);
          if (match) drawingStack[drawingStack.length - 1].graphicKind = match[1];
        }
      }
      return;
    }

    if (tag.local === 't' && paragraphStack.length > 0) {
      const paragraph = paragraphStack[paragraphStack.length - 1];
      documentTextSink = paragraph.finalize ? paragraph.parts : undefined;
      return;
    }
    if ((tag.local === 'tab' || tag.local === 'br' || tag.local === 'cr')
        && paragraphStack.length > 0) {
      const paragraph = paragraphStack[paragraphStack.length - 1];
      if (paragraph.finalize) paragraph.parts.push(tag.local === 'tab' ? '\t' : '\n');
      return;
    }
    if (tag.local === 'p') {
      const inside = insideDrawing();
      const cell = currentCell;
      let structuralPath: string;
      let finalize = false;
      if (cell) {
        structuralPath = `${cell.structuralPath}/p[${bump(cell.childCounters, 'p')}]`;
        finalize = !inside;
      } else if (inBody()) {
        structuralPath = `/body/p[${bump(bodyCounters, 'p')}]`;
        finalize = !inside;
      } else {
        structuralPath = `/outside/p[${bump(bodyCounters, 'p')}]`;
      }
      paragraphStack.push({
        structuralPath,
        finalize,
        parts: [],
        drawingOrdinal: 0,
        commentStarts: [],
        commentRefs: [],
        ...(cell ? { cell } : {}),
      });
      return;
    }

    if (tag.local === 'pStyle' && paragraphStack.length > 0 && stack[stack.length - 2]?.local === 'pPr') {
      const styleId = attribute(tag, W, 'val');
      if (styleId) paragraphStack[paragraphStack.length - 1].styleId = styleId;
      return;
    }
    if (tag.local === 'outlineLvl' && paragraphStack.length > 0 && stack[stack.length - 2]?.local === 'pPr') {
      const level = Number(attribute(tag, W, 'val'));
      if (Number.isInteger(level) && level >= 0 && level <= 8) {
        paragraphStack[paragraphStack.length - 1].outlineLevel = level;
      }
      return;
    }

    if (tag.local === 'tbl') {
      const ignored = insideDrawing();
      const parentCell = currentCell;
      tableOrdinal += 1;
      const structuralPath = parentCell
        ? `${parentCell.structuralPath}/tbl[${bump(parentCell.childCounters, 'tbl')}]`
        : `/body/tbl[${bump(bodyCounters, 'tbl')}]`;
      if (parentCell) {
        result.diagnostics.push({
          code: 'MMI_DOCX_NESTED_TABLE_NOT_FLATTENED',
          severity: 'warning',
          part: 'word/document.xml',
          structuralPath,
          message:
            'a table is nested inside a table cell; the nested table is observed separately and is not flattened into the outer cell',
        });
      }
      tableStack.push({
        ordinal: tableOrdinal,
        structuralPath,
        rows: [],
        ...(parentCell ? { parentCell } : {}),
        ignored,
      });
      currentCell = undefined;
      return;
    }
    if (tag.local === 'tr' && tableStack.length > 0) {
      const table = tableStack[tableStack.length - 1];
      const row: RowFrame = {
        structuralPath: `${table.structuralPath}/tr[${table.rows.length + 1}]`,
        cells: [],
        repeatedHeader: false,
      };
      table.rows.push(row);
      table.currentRow = row;
      currentCell = undefined;
      return;
    }
    if (tag.local === 'tc' && tableStack.length > 0) {
      const table = tableStack[tableStack.length - 1];
      const row = table.currentRow;
      if (!row) return;
      const cell: CellFrame = {
        structuralPath: `${row.structuralPath}/tc[${row.cells.length + 1}]`,
        gridSpan: 1,
        verticalMerge: 'none',
        paragraphs: [],
        childCounters: new Map(),
      };
      row.cells.push(cell);
      currentCell = cell;
      return;
    }
    if (tag.local === 'gridSpan' && currentCell && stack[stack.length - 2]?.local === 'tcPr') {
      const span = Number(attribute(tag, W, 'val'));
      if (Number.isInteger(span) && span > 0 && span <= 1000) currentCell.gridSpan = span;
      return;
    }
    if (tag.local === 'vMerge' && currentCell && stack[stack.length - 2]?.local === 'tcPr') {
      currentCell.verticalMerge = attribute(tag, W, 'val') === 'restart' ? 'restart' : 'continue';
      return;
    }
    if (tag.local === 'tblHeader' && tableStack.length > 0) {
      const row = tableStack[tableStack.length - 1].currentRow;
      if (row && stack[stack.length - 2]?.local === 'trPr') row.repeatedHeader = true;
      return;
    }
    if (tag.local === 'drawing' || tag.local === 'pict') {
      const paragraph = paragraphStack[paragraphStack.length - 1];
      if (!paragraph || !paragraph.finalize) return;
      paragraph.drawingOrdinal += 1;
      const kind = tag.local === 'drawing' ? 'drawing' : 'pict';
      drawingStack.push({
        structuralPath: `${paragraph.structuralPath}/${kind}[${paragraph.drawingOrdinal}]`,
        hasImageReference: false,
      });
      return;
    }
    if (tag.local === 'commentRangeStart') {
      const id = attribute(tag, W, 'id');
      const paragraph = paragraphStack[paragraphStack.length - 1];
      if (id && paragraph?.finalize) paragraph.commentStarts.push(id);
      return;
    }
    if (tag.local === 'commentReference') {
      const id = attribute(tag, W, 'id');
      const paragraph = paragraphStack[paragraphStack.length - 1];
      if (id && paragraph?.finalize) paragraph.commentRefs.push(id);
      return;
    }
  });

  parser.on('text', (value) => {
    documentTextSink?.push(value);
  });
  parser.on('closetag', (tag) => {
    if (tag.uri === W && tag.local === 't') {
      documentTextSink = undefined;
    } else if (tag.uri === W && tag.local === 'p') {
      const paragraph = paragraphStack.pop();
      if (paragraph) finishParagraph(paragraph);
    } else if (tag.uri === W && tag.local === 'tc') {
      currentCell = undefined;
    } else if (tag.uri === W && tag.local === 'tr' && tableStack.length > 0) {
      tableStack[tableStack.length - 1].currentRow = undefined;
    } else if (tag.uri === W && tag.local === 'tbl' && tableStack.length > 0) {
      const table = tableStack.pop() as TableFrame;
      if (!table.ignored) finishTable(table);
      currentCell = table.parentCell;
    } else if (tag.uri === W && (tag.local === 'drawing' || tag.local === 'pict') && drawingStack.length > 0) {
      const drawing = drawingStack.pop() as DrawingFrame;
      finishDrawing(drawing);
    }
    stack.pop();
  });

  parser.write(input.xml).close();

  if (paragraphStack.length > 0 || tableStack.length > 0) {
    throw new Error('word/document.xml ended with unclosed paragraph or table state');
  }
  return result;
}

/**
 * Read one .docx package. The source bytes are never modified.
 */
export function readDocx(bytes: Uint8Array, source: string): DocxReadResult {
  const sourceDigest = createSourceIdentityFromBytes(bytes).digest;
  const result = emptyResult(source, sourceDigest);
  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(bytes);
  } catch (error) {
    const unsupported = error instanceof ZipError && error.code !== 'not-a-zip';
    result.diagnostics.push({
      code: unsupported ? 'MMI_DOCX_PACKAGE_UNSUPPORTED' : 'MMI_DOCX_NOT_A_PACKAGE',
      severity: 'error',
      message: error instanceof Error ? error.message : 'the source is not a ZIP package',
    });
    return result;
  }
  const main = zip.get('word/document.xml');
  if (!main) {
    result.diagnostics.push({
      code: 'MMI_DOCX_MAIN_DOCUMENT_MISSING',
      severity: 'error',
      part: 'word/document.xml',
      message: 'the package has no WordprocessingML main document',
    });
    return result;
  }
  const xml = xmlTextOf(main, 'word/document.xml', result.diagnostics);
  if (xml === undefined) {
    result.diagnostics.push({
      code: 'MMI_DOCX_MAIN_DOCUMENT_UNREADABLE',
      severity: 'error',
      part: 'word/document.xml',
      message: 'the main document could not be read as UTF-8 XML',
    });
    return result;
  }
  const relationships = relationshipsOf(zip, 'word/document.xml', result.diagnostics);
  const styles = stylesOf(zip, result.diagnostics);
  const comments = commentsOf(zip, result.diagnostics);
  let parsed: DocumentParseResult;
  try {
    parsed = parseDocument({
      xml,
      source,
      sourceDigest,
      relationships,
      styles,
      zip,
    });
  } catch (error) {
    result.diagnostics.push({
      code: 'MMI_DOCX_MAIN_DOCUMENT_UNREADABLE',
      severity: 'error',
      part: 'word/document.xml',
      message: error instanceof Error ? error.message : 'the main document could not be parsed',
    });
    return result;
  }
  result.documentReadable = true;
  result.headings = parsed.headings;
  result.tables = [...parsed.tables].sort((left, right) => left.ordinal - right.ordinal);
  result.images = parsed.images;
  result.diagnostics.push(...parsed.diagnostics);

  result.comments = comments.map((comment, index) => {
    const structuralPath =
      parsed.commentAnchors.get(comment.id)
      ?? parsed.commentReferences.get(comment.id)?.[0];
    if (!structuralPath) {
      result.diagnostics.push({
        code: 'MMI_DOCX_COMMENT_ANCHOR_MISSING',
        severity: 'warning',
        part: 'word/comments.xml',
        message: `comment ${comment.id} has no range in the main document; it is listed without an anchor`,
      });
    }
    const ordinal = index + 1;
    return {
      ordinal,
      id: comment.id,
      ...(comment.author ? { author: comment.author } : {}),
      ...(comment.initials ? { initials: comment.initials } : {}),
      ...(comment.date ? { date: comment.date } : {}),
      text: comment.paragraphs.join('\n'),
      ...(structuralPath ? { structuralPath } : {}),
      candidate: commentCandidate({
        source,
        sourceDigest,
        comment,
        ordinal,
        ...(structuralPath ? { structuralPath } : {}),
      }),
    };
  });

  const referenced = new Set([...parsed.commentAnchors.keys(), ...parsed.commentReferences.keys()]);
  for (const id of referenced) {
    if (!comments.some((comment) => comment.id === id)) {
      result.diagnostics.push({
        code: 'MMI_DOCX_COMMENT_UNKNOWN',
        severity: 'warning',
        part: 'word/document.xml',
        message: `comment reference ${id} has no comment part entry`,
      });
    }
  }

  result.candidates = [
    ...result.headings.map((item) => item.candidate),
    ...result.tables.map((item) => item.candidate),
    ...result.images.map((item) => item.candidate),
    ...result.comments.map((item) => item.candidate),
  ];
  return result;
}

/** Media bytes re-read from the package and verified against the listed digest. */
export function readDocxImageBytes(packageBytes: Uint8Array, image: DocxImage): Buffer {
  const entry = readZip(packageBytes).get(image.mediaPart);
  if (!entry) throw new Error(`picture media ${image.mediaPart} is missing from the package`);
  const data = entry.read();
  if (sha256Of(data) !== image.digest) {
    throw new Error(`picture media ${image.mediaPart} changed since it was listed`);
  }
  return data;
}
