/**
 * Source Adapter: images embedded in an .xlsx -> `image` Candidates (issue-0194).
 *
 * Reads the OOXML package directly (workbook -> sheet -> drawing -> media
 * relationships); SheetJS community edition does not interpret images. Pure
 * and read-only: the package bytes in, a description out.
 *
 * Epistemic footing, claim by claim:
 *   location / media / format / digest / name   observed  M0   stated by the package
 *   nearby-table                                inferred  M1   geometry only: overlap
 *                                                              or adjacency of cell
 *                                                              rectangles
 * Everything is deterministic. Nothing is guessed about what an image
 * "means"; no model is involved.
 *
 * Problems are reported as diagnostics, never swallowed: an unreadable
 * drawing, a missing media part, an external (linked) picture, or a format
 * Markdown cannot show (EMF/WMF/TIFF) is named, and the rest still extracts.
 */
import { createHash } from 'node:crypto';

import type { Candidate, Claim, Evidence } from '../core/candidate.js';
import { candidateProblem, fingerprintOf } from '../core/candidate.js';
import {
  EXTRACTABLE_MEDIA_FORMATS,
  isExtractableMediaFormat,
  mediaFormatOf,
  type MediaFormat,
} from '../core/mediaFormat.js';
import { readZip, ZipError, type ZipEntry } from '../core/zipReader.js';

export const IMAGE_ADAPTER_ALGORITHM = 'mmi.excel-image-reader';
/** Bump when parsing rules change in a way that can change output. */
export const IMAGE_ADAPTER_VERSION = '1';
export const SHAPE_ADAPTER_ALGORITHM = 'mmi.excel-drawing-shape-reader';
export const SHAPE_ADAPTER_VERSION = '2';

/** Formats Markdown/browsers can display; others are listed but not extractable. */
export const EXTRACTABLE_FORMATS = EXTRACTABLE_MEDIA_FORMATS;
export type ImageFormat = MediaFormat;

export type ImageDiagnosticCode =
  | 'MMI_IMAGE_NOT_A_PACKAGE'
  | 'MMI_IMAGE_PACKAGE_UNSUPPORTED'
  | 'MMI_IMAGE_DRAWING_UNREADABLE'
  | 'MMI_IMAGE_MEDIA_MISSING'
  | 'MMI_IMAGE_EXTERNAL_LINK'
  | 'MMI_IMAGE_UNSUPPORTED_FORMAT'
  | 'MMI_DRAWING_SHAPES_NOT_EXTRACTED'
  | 'MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED';

export interface ImageDiagnostic {
  code: ImageDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  sheet?: string;
  part?: string;
}

export interface CellPoint {
  /** 0-based. */
  col: number;
  row: number;
}

export interface ImageAnchor {
  kind: 'twoCellAnchor' | 'oneCellAnchor' | 'absoluteAnchor';
  from?: CellPoint;
  to?: CellPoint;
  /** Size in EMU for one-cell and absolute anchors (the end cell is not derivable without column widths). */
  extentEmu?: { cx: number; cy: number };
}

export interface ExcelImage {
  /** 1-based, in workbook order (sheet order, then drawing order). Stable for an unchanged package. */
  ordinal: number;
  sheet: string;
  /** Picture name from the drawing (`cNvPr name`), e.g. "Picture 3". */
  name?: string;
  /** Alt text, when the author wrote one. */
  description?: string;
  anchor: ImageAnchor;
  /** A1 range covered by the anchor; the start cell alone when the end is unknown. */
  range?: string;
  /** Part name inside the package, e.g. `xl/media/image1.png`. */
  mediaPart: string;
  format: ImageFormat;
  bytes: number;
  /** sha256 of the media bytes. */
  digest: string;
  extractable: boolean;
}

export interface ExcelDrawingShape {
  /** 1-based, in workbook order. */
  ordinal: number;
  sheet: string;
  drawingPart: string;
  objectKind: 'shape' | 'connector';
  /** DrawingML cNvPr id when present. */
  objectId?: string;
  name?: string;
  description?: string;
  textRuns: readonly string[];
  presetGeometry?: string;
  /** sha256 of the exact DrawingML shape element, excluding its outer anchor. */
  contentDigest: string;
  anchor: ImageAnchor;
  /** A1 range covered by the anchor when a cell anchor exists. */
  range?: string;
  /** Source-native occurrence identity independent of shape content. */
  structuralPath: string;
}

export interface ShapeSnapshotSelection {
  sheet: string;
  range: string;
}

export function shapeSnapshotSelection(
  shape: ExcelDrawingShape,
): ShapeSnapshotSelection | undefined {
  if (
    shape.anchor.kind !== 'twoCellAnchor'
    || !shape.anchor.from
    || !shape.anchor.to
    || !shape.range
  ) {
    return undefined;
  }
  return {
    sheet: shape.sheet,
    range: shape.range,
  };
}

export type DrawingSnapshotHintReason =
  | 'drawing-two-cell-anchor'
  | 'drawing-one-cell-anchor-needs-range'
  | 'drawing-absolute-anchor-needs-range';

export interface DrawingSnapshotHint {
  /** 1-based, in workbook/drawing-anchor order. */
  ordinal: number;
  sheet: string;
  anchor: ImageAnchor;
  /** Safe automatic range. Only two-cell anchors have an observed end cell. */
  range?: string;
  shapeCount: number;
  graphicFrameCount: number;
  reasonCode: DrawingSnapshotHintReason;
}

export interface ImageReadResult {
  images: ExcelImage[];
  /** AutoShape / connector source objects. Reviewable, but not extracted assets yet. */
  shapes: ExcelDrawingShape[];
  /** Drawing regions that can be handed to region snapshot without inventing semantics. */
  snapshotHints: DrawingSnapshotHint[];
  diagnostics: ImageDiagnostic[];
  /** Drawing objects not extracted as Markdown assets. `charts` may also include diagrams. */
  skipped: { shapes: number; charts: number };
}

export interface TableRect {
  a1: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// --- package reading --------------------------------------------------------------

const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/gu, '&');

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/gu)) out[match[1]] = decodeEntities(match[2]);
  return out;
}

const text = (entry: ZipEntry): string => entry.read().toString('utf8').replace(/^﻿/u, '');

/** Resolves a relationship target against the part that owns it. */
function resolveTarget(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = ownerPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') base.pop();
    else if (segment !== '.' && segment !== '') base.push(segment);
  }
  return base.join('/');
}

function relsOf(zip: Map<string, ZipEntry>, part: string): { id: string; type: string; target: string; external: boolean }[] {
  const dir = part.split('/').slice(0, -1).join('/');
  const file = part.split('/').pop() as string;
  const relsEntry = zip.get(`${dir ? `${dir}/` : ''}_rels/${file}.rels`);
  if (!relsEntry) return [];
  return [...text(relsEntry).matchAll(/<(?:\w+:)?Relationship\b[^>]*>/gu)].map((match) => {
    const a = attributes(match[0]);
    return {
      id: a.Id ?? '',
      type: a.Type ?? '',
      target: a.TargetMode === 'External' ? a.Target ?? '' : resolveTarget(part, a.Target ?? ''),
      external: a.TargetMode === 'External',
    };
  });
}

/** Sheets in workbook order with the part each lives in. */
function sheetsOf(zip: Map<string, ZipEntry>): { name: string; part: string }[] {
  const workbook = zip.get('xl/workbook.xml');
  if (!workbook) return [];
  const rels = new Map(relsOf(zip, 'xl/workbook.xml').map((rel) => [rel.id, rel.target]));
  const sheets: { name: string; part: string }[] = [];
  for (const match of text(workbook).matchAll(/<(?:\w+:)?sheet\b[^>]*>/gu)) {
    const a = attributes(match[0]);
    const rid = Object.entries(a).find(([key]) => key === 'r:id' || key.endsWith(':id'))?.[1];
    const part = rid ? rels.get(rid) : undefined;
    if (a.name && part) sheets.push({ name: a.name, part });
  }
  return sheets;
}

function pointOf(block: string): CellPoint | undefined {
  const col = /<(?:\w+:)?col>(\d+)</u.exec(block)?.[1];
  const row = /<(?:\w+:)?row>(\d+)</u.exec(block)?.[1];
  return col !== undefined && row !== undefined ? { col: Number(col), row: Number(row) } : undefined;
}

const OFFSET_ZERO = (block: string): boolean => /<(?:\w+:)?colOff>0</u.test(block) && /<(?:\w+:)?rowOff>0</u.test(block);

function columnLabel(index: number): string {
  let out = '';
  for (let v = index + 1; v > 0; v = Math.floor((v - 1) / 26)) out = String.fromCharCode(65 + ((v - 1) % 26)) + out;
  return out;
}

const cellName = (point: CellPoint): string => `${columnLabel(point.col)}${point.row + 1}`;

export function readExcelImages(bytes: Uint8Array): ImageReadResult {
  const result: ImageReadResult = {
    images: [],
    shapes: [],
    snapshotHints: [],
    diagnostics: [],
    skipped: { shapes: 0, charts: 0 },
  };
  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(bytes);
  } catch (error) {
    const unsupported = error instanceof ZipError && error.code !== 'not-a-zip';
    result.diagnostics.push({
      code: unsupported ? 'MMI_IMAGE_PACKAGE_UNSUPPORTED' : 'MMI_IMAGE_NOT_A_PACKAGE',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const mediaCache = new Map<string, { bytes: Buffer; digest: string; format: ImageFormat } | undefined>();
  for (const sheet of sheetsOf(zip)) {
    let drawingRel: ReturnType<typeof relsOf>[number] | undefined;
    try {
      drawingRel = relsOf(zip, sheet.part).find((rel) => rel.type.endsWith('/drawing'));
    } catch (error) {
      result.diagnostics.push({ code: 'MMI_IMAGE_DRAWING_UNREADABLE', severity: 'warning', sheet: sheet.name, part: sheet.part, message: `sheet relationships: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (!drawingRel) continue;
    const drawingEntry = zip.get(drawingRel.target);
    if (!drawingEntry) {
      result.diagnostics.push({ code: 'MMI_IMAGE_DRAWING_UNREADABLE', severity: 'warning', sheet: sheet.name, part: drawingRel.target, message: `drawing part ${drawingRel.target} is missing` });
      continue;
    }
    let xml: string;
    try {
      xml = text(drawingEntry);
    } catch (error) {
      result.diagnostics.push({ code: 'MMI_IMAGE_DRAWING_UNREADABLE', severity: 'warning', sheet: sheet.name, part: drawingRel.target, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!/<(?:\w+:)?wsDr\b/u.test(xml) || !/<\/(?:\w+:)?wsDr>\s*$/u.test(xml)) {
      result.diagnostics.push({ code: 'MMI_IMAGE_DRAWING_UNREADABLE', severity: 'warning', sheet: sheet.name, part: drawingRel.target, message: 'drawing XML is not a complete worksheet drawing' });
      continue;
    }
    let mediaRels: Map<string, ReturnType<typeof relsOf>[number]>;
    try {
      mediaRels = new Map(relsOf(zip, drawingRel.target).map((rel) => [rel.id, rel]));
    } catch (error) {
      result.diagnostics.push({ code: 'MMI_IMAGE_DRAWING_UNREADABLE', severity: 'warning', sheet: sheet.name, part: drawingRel.target, message: `drawing relationships: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }

    let skippedShapesOnSheet = 0;
    let skippedGraphicFramesOnSheet = 0;
    const shapePathCounts = new Map<string, number>();
    for (const anchorMatch of xml.matchAll(/<((?:\w+:)?)(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/\1\2>/gu)) {
      const kind = anchorMatch[2] as ImageAnchor['kind'];
      const body = anchorMatch[3];
      const shapes = (body.match(/<(?:\w+:)?(?:sp|cxnSp)\b/gu) ?? []).length;
      const graphicFrames = (body.match(/<(?:\w+:)?graphicFrame\b/gu) ?? []).length;
      result.skipped.shapes += shapes;
      result.skipped.charts += graphicFrames;
      skippedShapesOnSheet += shapes;
      skippedGraphicFramesOnSheet += graphicFrames;

      const fromBlock = /<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/u.exec(body)?.[1];
      const toBlock = /<(?:\w+:)?to>([\s\S]*?)<\/(?:\w+:)?to>/u.exec(body)?.[1];
      const head = body.slice(0, body.search(/<(?:\w+:)?(?:pic|sp|cxnSp|graphicFrame|grpSp)\b/u) >>> 0 || body.length);
      const ext = /<(?:\w+:)?ext\s+cx="(\d+)"\s+cy="(\d+)"/u.exec(head);
      const from = fromBlock ? pointOf(fromBlock) : undefined;
      let to = toBlock ? pointOf(toBlock) : undefined;
      // A `to` at offset 0 is the top-left edge of that cell: the picture ends in the previous one.
      if (from && to && toBlock && OFFSET_ZERO(toBlock)) {
        to = { col: Math.max(from.col, to.col - 1), row: Math.max(from.row, to.row - 1) };
      }
      const anchor: ImageAnchor = { kind, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(ext ? { extentEmu: { cx: Number(ext[1]), cy: Number(ext[2]) } } : {}) };
      const range = from ? (to && (to.col !== from.col || to.row !== from.row) ? `${cellName(from)}:${cellName(to)}` : cellName(from)) : undefined;

      for (const shapeMatch of body.matchAll(
        /<(?:\w+:)?(sp|cxnSp)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?\1>)/gu,
      )) {
        const shapeXml = shapeMatch[0];
        const contentDigest =
          `sha256:${createHash('sha256').update(shapeXml, 'utf8').digest('hex')}`;
        const objectKind =
          shapeMatch[1] === 'cxnSp' ? 'connector' as const : 'shape' as const;
        const props = /<(?:\w+:)?cNvPr\b[^>]*>/u.exec(shapeXml);
        const propsAttrs = props ? attributes(props[0]) : {};
        const geometry = /<(?:\w+:)?prstGeom\b[^>]*>/u.exec(shapeXml);
        const geometryAttrs = geometry ? attributes(geometry[0]) : {};
        const textRuns = [...shapeXml.matchAll(
          /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gu,
        )].map((match) => decodeEntities(match[1]));
        const ordinal = result.shapes.length + 1;
        const nativeId = propsAttrs.id;
        const structuralPathBase =
          `drawing:${drawingRel.target}#${objectKind}:${nativeId ?? ordinal}`;
        const structuralPathOccurrence =
          (shapePathCounts.get(structuralPathBase) ?? 0) + 1;
        shapePathCounts.set(
          structuralPathBase,
          structuralPathOccurrence,
        );
        const structuralPath = structuralPathOccurrence === 1
          ? structuralPathBase
          : `${structuralPathBase}:occurrence:${structuralPathOccurrence}`;
        result.shapes.push({
          ordinal,
          sheet: sheet.name,
          drawingPart: drawingRel.target,
          objectKind,
          ...(nativeId ? { objectId: nativeId } : {}),
          ...(propsAttrs.name ? { name: propsAttrs.name } : {}),
          ...(propsAttrs.descr ? { description: propsAttrs.descr } : {}),
          textRuns,
          contentDigest,
          ...(geometryAttrs.prst
            ? { presetGeometry: geometryAttrs.prst }
            : {}),
          anchor,
          ...(range ? { range } : {}),
          structuralPath,
        });
      }

      if (shapes > 0 || graphicFrames > 0) {
        const snapshotRange = kind === 'twoCellAnchor' && from && to
          ? (to.col !== from.col || to.row !== from.row
              ? `${cellName(from)}:${cellName(to)}`
              : cellName(from))
          : undefined;
        result.snapshotHints.push({
          ordinal: result.snapshotHints.length + 1,
          sheet: sheet.name,
          anchor,
          ...(snapshotRange ? { range: snapshotRange } : {}),
          shapeCount: shapes,
          graphicFrameCount: graphicFrames,
          reasonCode: snapshotRange
            ? 'drawing-two-cell-anchor'
            : kind === 'oneCellAnchor'
              ? 'drawing-one-cell-anchor-needs-range'
              : 'drawing-absolute-anchor-needs-range',
        });
      }
      for (const picMatch of body.matchAll(/<(?:\w+:)?pic\b[\s\S]*?<\/(?:\w+:)?pic>/gu)) {
        const pic = picMatch[0];
        const props = /<(?:\w+:)?cNvPr\b[^>]*>/u.exec(pic);
        const a = props ? attributes(props[0]) : {};
        const blip = /<(?:\w+:)?blip\b[^>]*>/u.exec(pic);
        const blipAttrs = blip ? attributes(blip[0]) : {};
        const embed = Object.entries(blipAttrs).find(([key]) => key.endsWith(':embed'))?.[1];
        const link = Object.entries(blipAttrs).find(([key]) => key.endsWith(':link'))?.[1];
        const label = a.name ?? 'picture';
        if (!embed) {
          result.diagnostics.push({
            code: link ? 'MMI_IMAGE_EXTERNAL_LINK' : 'MMI_IMAGE_DRAWING_UNREADABLE',
            severity: 'warning',
            sheet: sheet.name,
            part: drawingRel.target,
            message: link ? `${label} links to an external image and is not embedded` : `${label} has no image reference`,
          });
          continue;
        }
        const rel = mediaRels.get(embed);
        const entry = rel && !rel.external ? zip.get(rel.target) : undefined;
        if (!rel || !entry) {
          result.diagnostics.push({ code: 'MMI_IMAGE_MEDIA_MISSING', severity: 'warning', sheet: sheet.name, part: rel?.target ?? embed, message: `${label}: media ${rel?.target ?? embed} is missing from the package` });
          continue;
        }
        if (!mediaCache.has(rel.target)) {
          try {
            const data = entry.read();
            mediaCache.set(rel.target, { bytes: data, digest: `sha256:${createHash('sha256').update(data).digest('hex')}`, format: mediaFormatOf(data, rel.target) });
          } catch (error) {
            mediaCache.set(rel.target, undefined);
            result.diagnostics.push({ code: 'MMI_IMAGE_MEDIA_MISSING', severity: 'warning', sheet: sheet.name, part: rel.target, message: `${label}: ${error instanceof Error ? error.message : 'unreadable media'}` });
          }
        }
        const media = mediaCache.get(rel.target);
        if (!media) continue;
        const extractable = isExtractableMediaFormat(media.format);
        if (!extractable) {
          result.diagnostics.push({ code: 'MMI_IMAGE_UNSUPPORTED_FORMAT', severity: 'warning', sheet: sheet.name, part: rel.target, message: `${label}: ${media.format} cannot be shown in Markdown; it is listed but not extracted` });
        }
        result.images.push({
          ordinal: result.images.length + 1,
          sheet: sheet.name,
          ...(a.name ? { name: a.name } : {}),
          ...(a.descr ? { description: a.descr } : {}),
          anchor,
          ...(range ? { range } : {}),
          mediaPart: rel.target,
          format: media.format,
          bytes: media.bytes.length,
          digest: media.digest,
          extractable,
        });
      }
    }

    if (skippedShapesOnSheet > 0) {
      result.diagnostics.push({
        code: 'MMI_DRAWING_SHAPES_NOT_EXTRACTED',
        severity: 'warning',
        sheet: sheet.name,
        part: drawingRel.target,
        message:
          `${skippedShapesOnSheet} shape/connector object(s) are present; MMI exposes them as Candidates but does not extract them yet`,
      });
    }
    if (skippedGraphicFramesOnSheet > 0) {
      result.diagnostics.push({
        code: 'MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED',
        severity: 'warning',
        sheet: sheet.name,
        part: drawingRel.target,
        message:
          `${skippedGraphicFramesOnSheet} graphic-frame object(s) are present; these may include charts or diagrams and are not extracted yet`,
      });
    }
  }
  return result;
}

/** The media bytes of an image (re-read from the package, verified against its digest). */
export function readImageBytes(packageBytes: Uint8Array, image: ExcelImage): Buffer {
  const entry = readZip(packageBytes).get(image.mediaPart);
  if (!entry) throw new Error(`media ${image.mediaPart} is missing from the package`);
  const data = entry.read();
  if (`sha256:${createHash('sha256').update(data).digest('hex')}` !== image.digest) throw new Error(`media ${image.mediaPart} changed since it was listed`);
  return data;
}

// --- Candidates -----------------------------------------------------------------------

/** Tables farther than this many cells from a picture are not called related. */
export const NEARBY_TABLE_MAX_GAP = 10;

export type TableRelation = 'overlaps' | 'above' | 'below' | 'left' | 'right';

/**
 * Where the nearest table is relative to a picture, from cell rectangles
 * alone. Diagonal neighbours are not related (neither axis lines up). When
 * the picture's end cell is unknown (one-cell anchors) only its start cell
 * is used, which can only under-report overlap -- never invent it.
 */
export function relationToTables(
  image: ExcelImage,
  tables: readonly TableRect[],
): { table: TableRect; relation: TableRelation; gap: number } | undefined {
  if (!image.anchor.from) return undefined;
  const top = image.anchor.from.row;
  const left = image.anchor.from.col;
  const bottom = image.anchor.to?.row ?? top;
  const right = image.anchor.to?.col ?? left;
  let best: { table: TableRect; relation: TableRelation; gap: number } | undefined;
  for (const table of tables) {
    const rowOverlap = top <= table.endRow && table.startRow <= bottom;
    const colOverlap = left <= table.endCol && table.startCol <= right;
    let found: { relation: TableRelation; gap: number } | undefined;
    if (rowOverlap && colOverlap) found = { relation: 'overlaps', gap: 0 };
    else if (colOverlap) found = bottom < table.startRow ? { relation: 'above', gap: table.startRow - bottom - 1 } : { relation: 'below', gap: top - table.endRow - 1 };
    else if (rowOverlap) found = right < table.startCol ? { relation: 'left', gap: table.startCol - right - 1 } : { relation: 'right', gap: left - table.endCol - 1 };
    if (!found || found.gap > NEARBY_TABLE_MAX_GAP) continue;
    if (!best || found.gap < best.gap) best = { table, ...found };
  }
  return best;
}

export interface ImageCandidateInput {
  source: string;
  sourceDigest: string;
  images: readonly ExcelImage[];
  /** Detected table regions per sheet, for the position relation. */
  tablesBySheet?: Readonly<Record<string, readonly TableRect[]>>;
}

export function imageCandidates(input: ImageCandidateInput): Candidate[] {
  return input.images.map((image) => {
    const claims: Claim[] = [];
    const observed = (aspect: string, value: string, reasonCode: string, evidence?: Evidence[]) =>
      claims.push({ aspect, value, status: 'observed', execution: 'deterministic', method: 'M0', reasonCode, ...(evidence ? { evidence } : {}) });
    if (image.range) observed('location', image.range, 'drawing-anchor', [{ code: 'anchor-kind', detail: image.anchor.kind }]);
    observed('media', image.mediaPart, 'package-relationship');
    observed('format', image.format, 'media-signature');
    observed('bytes', String(image.bytes), 'package-entry-size');
    observed('digest', image.digest, 'media-sha256');
    if (image.name) observed('name', image.name, 'drawing-property');
    if (image.description) observed('description', image.description, 'drawing-property');
    const nearby = relationToTables(image, input.tablesBySheet?.[image.sheet] ?? []);
    if (nearby) {
      claims.push({
        aspect: 'nearby-table',
        value: nearby.table.a1,
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `geometry-${nearby.relation}`,
        evidence: [{ code: nearby.relation, detail: `gap=${nearby.gap} cells` }],
      });
    }
    return {
      kind: 'image' as const,
      locator: { source: input.source, sourceDigest: input.sourceDigest, sheet: image.sheet, ...(image.range ? { range: image.range } : {}) },
      // The picture and its anchor are stated by the package, not derived.
      status: 'observed' as const,
      execution: 'deterministic' as const,
      method: 'M0' as const,
      claims,
      provenance: {
        algorithm: IMAGE_ADAPTER_ALGORITHM,
        run: { execution: 'deterministic' as const, inputDigest: input.sourceDigest, config: { nearbyTableMaxGap: NEARBY_TABLE_MAX_GAP }, implementationVersion: IMAGE_ADAPTER_VERSION },
      },
      // The image's own bytes: the same picture keeps its fingerprint wherever it is placed.
      fingerprint: fingerprintOf('image-media-bytes-v1', image.digest),
      scores: [],
    };
  });
}



export interface ShapeCandidateInput {
  source: string;
  sourceDigest: string;
  shapes: readonly ExcelDrawingShape[];
}

export function shapeCandidates(input: ShapeCandidateInput): Candidate[] {
  return input.shapes.map((shape) => {
    const claims: Claim[] = [];
    const observed = (
      aspect: string,
      value: Claim['value'],
      reasonCode: string,
      evidence?: Evidence[],
    ): void => {
      claims.push({
        aspect,
        value,
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode,
        ...(evidence ? { evidence } : {}),
      });
    };

    observed('object-type', shape.objectKind, 'drawingml-object-type');
    observed('drawing-part', shape.drawingPart, 'package-drawing-part');
    observed('anchor-kind', shape.anchor.kind, 'drawing-anchor-kind');
    if (shape.range) observed('location', shape.range, 'drawing-anchor');
    if (shape.objectId) {
      observed('source-object-id', shape.objectId, 'drawing-cNvPr-id');
    }
    if (shape.name) observed('name', shape.name, 'drawing-property');
    if (shape.description) {
      observed('description', shape.description, 'drawing-property');
    }
    if (shape.textRuns.length > 0) {
      observed('text-runs', [...shape.textRuns], 'drawingml-text');
    }
    if (shape.presetGeometry) {
      observed(
        'preset-geometry',
        shape.presetGeometry,
        'drawingml-prstGeom',
      );
    }
    observed(
      'drawingml-content-digest',
      shape.contentDigest,
      'drawingml-shape-sha256',
    );

    const candidate: Candidate = {
      kind: 'shape',
      locator: {
        source: input.source,
        sourceDigest: input.sourceDigest,
        sheet: shape.sheet,
        structuralPath: shape.structuralPath,
      },
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      claims,
      provenance: {
        algorithm: SHAPE_ADAPTER_ALGORITHM,
        run: {
          execution: 'deterministic',
          inputDigest: input.sourceDigest,
          config: { format: 'xlsx-drawingml-shape' },
          implementationVersion: SHAPE_ADAPTER_VERSION,
        },
      },
      fingerprint: fingerprintOf(
        'excel-drawing-shape-xml-v1',
        shape.contentDigest,
      ),
      scores: [],
    };

    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `invalid shape Candidate at ${shape.sheet}:${shape.structuralPath}: ${problem}`,
      );
    }
    return candidate;
  });
}
