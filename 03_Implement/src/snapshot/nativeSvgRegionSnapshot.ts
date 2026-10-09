
/**
 * Dependency-free deterministic SVG region snapshots (issue-0198).
 *
 * Narrower than LibreOffice by design. Unsupported fidelity is recorded in
 * limitations instead of being silently treated as Excel-equivalent output.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

import { readExcelImages, type ImageAnchor } from '../adapters/excelImageAdapter.js';
import { attr, child, childrenNamed, descendants, parseXml } from '../adapters/sheetSnapshotXml.js';
import type { Candidate } from '../core/candidate.js';
import { candidateProblem } from '../core/candidate.js';
import { entryFor, recordEntries, type Ledger } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { readZip } from '../core/zipReader.js';
import { RegionSnapshotError, REGION_SNAPSHOT_SCHEMA } from './libreOfficeRegionSnapshot.js';

export const NATIVE_SVG_SNAPSHOT_RENDERER = 'mmi.native-svg';
export const NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION = '2';
export const NATIVE_SVG_LAYOUT_VERSION = 'xlsx-cell-layout-v1';

const DEFAULT_COLUMN_PX = 64;
const DEFAULT_ROW_PX = 20;
const EMU_PER_PX_96DPI = 9525;
const MAX_DIMENSION_PX = 16384;
const MAX_AREA_PX = 80000000;
const FONT_FAMILY = 'Arial, "Noto Sans CJK JP", sans-serif';

export interface NativeSvgRegionSnapshotOptions {
  sourcePath: string;
  sourceLabel?: string;
  sheet: string;
  range: string;
  outDir: string;
  ledgerPath?: string;
  fromDocument?: string;
}

export interface NativeSvgRegionSnapshotManifest {
  schema: typeof REGION_SNAPSHOT_SCHEMA;
  source: { label: string; digest: string; application?: string; appVersion?: string };
  selection: { sheet: string; range: string };
  renderer: {
    id: typeof NATIVE_SVG_SNAPSHOT_RENDERER;
    implementationVersion: typeof NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION;
    sheetJsVersion: string;
    layoutVersion: typeof NATIVE_SVG_LAYOUT_VERSION;
    fontFamily: string;
  };
  artifact: {
    file: string;
    digest: string;
    bytes: number;
    widthPx: number;
    heightPx: number;
    mediaType: 'image/svg+xml';
  };
  limitations: string[];
  renderedAtUtc: string;
}

export interface NativeSvgRegionSnapshotResult {
  candidate: Candidate;
  manifest: NativeSvgRegionSnapshotManifest;
  svgFile: string;
  manifestFile: string;
  status: 'written' | 'unchanged';
  reference: string;
  markdown: string;
  ledger?: Ledger;
}

type NativeColor = { rgb?: string; theme?: number; tint?: number };
type NativeBorderSide = { style?: string; color?: NativeColor };
type NativeCellStyle = {
  fill?: { patternType?: string; fgColor?: NativeColor; bgColor?: NativeColor };
  border?: { top?: NativeBorderSide; right?: NativeBorderSide; bottom?: NativeBorderSide; left?: NativeBorderSide };
  font?: { name?: string; sz?: number; bold?: boolean; italic?: boolean; color?: NativeColor };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  /** SheetJS 0.20.x may expose stable style fields directly on s. */
  patternType?: string;
  fgColor?: NativeColor;
  bgColor?: NativeColor;
  top?: NativeBorderSide;
  right?: NativeBorderSide;
  bottom?: NativeBorderSide;
  left?: NativeBorderSide;
};
type NativeCell = XLSX.CellObject & { s?: NativeCellStyle };
type NativeColumn = { hidden?: boolean; wpx?: number; wch?: number; width?: number };
type NativeRow = { hidden?: boolean; hpx?: number; hpt?: number };
interface CellRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}
interface AxisMetrics { start: number; end: number; sizes: number[]; offsets: number[]; total: number }
interface SnapshotRect { x: number; y: number; width: number; height: number }

export function renderNativeSvgRegionSnapshot(options: NativeSvgRegionSnapshotOptions): NativeSvgRegionSnapshotResult {
  const sourcePath = path.resolve(options.sourcePath);
  const outDir = path.resolve(options.outDir);
  const sourceLabel = options.sourceLabel ?? path.basename(sourcePath);
  validateInput(sourcePath, options.sheet, options.range);
  const normalizedRange = normalizeRange(options.range);
  const selection = XLSX.utils.decode_range(normalizedRange);
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceDigestBefore = readSourceFileIdentity(sourcePath).digest;
  const workbook = XLSX.read(sourceBytes, {
    type: 'buffer', dense: false, cellStyles: true, cellText: true,
    cellDates: true, dateNF: 'yyyy-mm-dd',
  });
  const worksheet = workbook.Sheets[options.sheet];
  if (!worksheet) {
    throw new RegionSnapshotError('MMI_SNAPSHOT_SHEET_NOT_FOUND', 'worksheet not found: ' + options.sheet);
  }

  const columns = columnMetrics(worksheet, selection.s.c, selection.e.c);
  const rows = rowMetrics(worksheet, selection.s.r, selection.e.r);
  if (columns.total < 1 || rows.total < 1
      || columns.total > MAX_DIMENSION_PX || rows.total > MAX_DIMENSION_PX
      || columns.total * rows.total > MAX_AREA_PX) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RANGE_INVALID',
      'native SVG snapshot dimensions are unsafe: ' + columns.total + 'x' + rows.total + 'px',
    );
  }

  const limitations = new Set<string>([
    'font-rasterization-environment-dependent',
    'excel-layout-metrics-approximated',
  ]);
  applyOoxmlBorders(sourceBytes, options.sheet, worksheet, limitations);
  const svg = buildSvg({
    worksheet, workbookBytes: sourceBytes, sheet: options.sheet,
    selection, columns, rows, limitations,
  });
  const sourceDigestAfter = readSourceFileIdentity(sourcePath).digest;
  if (sourceDigestAfter !== sourceDigestBefore) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_SOURCE_CHANGED',
      'source workbook changed while the native snapshot was being rendered; retry with a stable source',
    );
  }

  const svgBytes = Buffer.from(svg, 'utf8');
  const svgDigest = sha256(svgBytes);
  const limitationList = [...limitations].sort();
  const fingerprintRepresentation = [
    'region-snapshot-svg-v1',
    NATIVE_SVG_SNAPSHOT_RENDERER,
    'impl=' + NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION,
    'layout=' + NATIVE_SVG_LAYOUT_VERSION,
    'sheetjs=' + XLSX.version,
  ].join(';');

  const candidate: Candidate = {
    kind: 'region-snapshot',
    locator: {
      source: sourceLabel,
      sourceDigest: sourceDigestBefore,
      sheet: options.sheet,
      range: normalizedRange,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims: [{
      aspect: 'snapshot-range',
      value: options.sheet + '!' + normalizedRange,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'explicit-sheet-range',
      evidence: limitationList.map((detail) => ({ code: 'native-svg-fidelity-limit', detail })),
    }],
    provenance: {
      algorithm: NATIVE_SVG_SNAPSHOT_RENDERER,
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigestBefore,
        config: {
          sheet: options.sheet,
          range: normalizedRange,
          sheetJsVersion: XLSX.version,
          layoutVersion: NATIVE_SVG_LAYOUT_VERSION,
          fontFamily: FONT_FAMILY,
          limitations: limitationList.join(','),
        },
        implementationVersion: NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION,
      },
    },
    fingerprint: { algorithm: 'sha256', representation: fingerprintRepresentation, digest: svgDigest },
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RENDER_FAILED',
      'rendered native region-snapshot Candidate is invalid: ' + problem,
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const digestHex = svgDigest.slice('sha256:'.length);
  const svgFile = path.join(outDir, 'snapshot-' + digestHex + '.svg');
  const manifestFile = path.join(outDir, 'snapshot-' + digestHex + '.mmi-snapshot.json');
  const status = writeContentAddressed(svgFile, svgBytes);
  const manifest = existingOrCreateManifest({
    manifestFile,
    sourceLabel,
    sourceDigest: sourceDigestBefore,
    officeInfo: readOfficeApplicationInfo(sourceBytes),
    sheet: options.sheet,
    range: normalizedRange,
    svgFile,
    svgDigest,
    svgBytes: svgBytes.byteLength,
    widthPx: columns.total,
    heightPx: rows.total,
    limitations: limitationList,
  });

  const documentDirectory = options.fromDocument
    ? path.dirname(path.resolve(options.fromDocument))
    : process.cwd();
  const relativeSvg = path.relative(documentDirectory, svgFile).split(path.sep).join('/');
  const reference = /\s/u.test(relativeSvg) ? relativeSvg.replace(/ /gu, '%20') : relativeSvg;
  const altText = options.sheet + ' ' + normalizedRange;
  const markdown = [
    '![' + escapeMarkdownAlt(altText) + '](' + reference + ')',
    snapshotProvenanceComment({
      source: sourceLabel,
      sourceDigest: sourceDigestBefore,
      sheet: options.sheet,
      range: normalizedRange,
      artifactDigest: svgDigest,
      renderer: NATIVE_SVG_SNAPSHOT_RENDERER,
    }),
  ].join('\n');

  const ledger = options.ledgerPath
    ? recordEntries(options.ledgerPath, [
        entryFor(
          options.ledgerPath,
          sourcePath,
          candidate,
          svgFile,
          'mmi snapshot',
          {
            mode: 'region-snapshot-native-svg-v1',
            renderer: NATIVE_SVG_SNAPSHOT_RENDERER,
            rendererImplementationVersion: NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION,
            sheetJsVersion: XLSX.version,
            layoutVersion: NATIVE_SVG_LAYOUT_VERSION,
            sheet: options.sheet,
            range: normalizedRange,
            manifest: path.basename(manifestFile),
            limitations: limitationList.join(','),
          },
        ),
      ])
    : undefined;

  return { candidate, manifest, svgFile, manifestFile, status, reference, markdown, ...(ledger ? { ledger } : {}) };
}

/** SheetJS CE exposes fills but drops OOXML border records. Read those records directly. */
function applyOoxmlBorders(bytes: Buffer, sheetName: string, worksheet: XLSX.WorkSheet, limitations: Set<string>): void {
  try {
    const zip = readZip(bytes);
    const read = (part: string) => {
      const entry = zip.get(part);
      return entry ? parseXml(entry.read().toString('utf8')) : undefined;
    };
    const relationships = childrenNamed(read('xl/_rels/workbook.xml.rels'), 'Relationship');
    const target = (value: string) => value.startsWith('/')
      ? value.slice(1) : path.posix.normalize(path.posix.join('xl', value));
    const sheet = childrenNamed(child(read('xl/workbook.xml'), 'sheets'), 'sheet')
      .find((node) => attr(node, 'name') === sheetName);
    const sheetRelationship = relationships.find((node) => attr(node, 'Id') === attr(sheet, 'id'));
    const stylesRelationship = relationships.find((node) => attr(node, 'Type')?.endsWith('/styles'));
    const styles = read(target(attr(stylesRelationship, 'Target') ?? 'styles.xml'));
    const borders = childrenNamed(child(styles, 'borders'), 'border');
    const formats = childrenNamed(child(styles, 'cellXfs'), 'xf');
    const sheetTarget = attr(sheetRelationship, 'Target');
    if (!sheetTarget || !styles) return;
    for (const cell of descendants(read(target(sheetTarget)), 'c')) {
      const address = attr(cell, 'r');
      if (!address || !worksheet[address]) continue;
      const format = formats[Number(attr(cell, 's') ?? 0)];
      const border = borders[Number(attr(format, 'borderId') ?? 0)];
      if (!border) continue;
      const sides: NonNullable<NativeCellStyle['border']> = {};
      for (const name of ['top', 'right', 'bottom', 'left'] as const) {
        const side = child(border, name);
        const style = attr(side, 'style');
        const color = child(side, 'color');
        if (style) sides[name] = { style, color: {
          ...(attr(color, 'rgb') ? { rgb: attr(color, 'rgb') } : {}),
          ...(attr(color, 'theme') !== undefined ? { theme: Number(attr(color, 'theme')) } : {}),
        } };
      }
      const original = worksheet[address] as NativeCell;
      original.s = { ...original.s, border: sides };
    }
  } catch {
    limitations.add('ooxml-border-records-unavailable');
  }
}

function buildSvg(options: {
  worksheet: XLSX.WorkSheet;
  workbookBytes: Buffer;
  sheet: string;
  selection: CellRange;
  columns: AxisMetrics;
  rows: AxisMetrics;
  limitations: Set<string>;
}): string {
  const { worksheet, selection, columns, rows, limitations } = options;
  const body: string[] = [
    '<rect x="0" y="0" width="' + columns.total + '" height="' + rows.total + '" fill="#ffffff"/>',
  ];
  const mergeCoverage = new Set<string>();
  const merges = (worksheet['!merges'] ?? []) as CellRange[];

  for (const merge of merges) {
    if (!rangesOverlap(selection, merge)) continue;
    const clipped: CellRange = {
      s: { c: Math.max(selection.s.c, merge.s.c), r: Math.max(selection.s.r, merge.s.r) },
      e: { c: Math.min(selection.e.c, merge.e.c), r: Math.min(selection.e.r, merge.e.r) },
    };
    for (let row = clipped.s.r; row <= clipped.e.r; row += 1) {
      for (let col = clipped.s.c; col <= clipped.e.c; col += 1) mergeCoverage.add(row + ':' + col);
    }
    const cell = worksheet[XLSX.utils.encode_cell(merge.s)] as NativeCell | undefined;
    body.push(...renderCell(merge.s.r, merge.s.c, clipped, cell, columns, rows, body.length, limitations));
  }

  for (let row = selection.s.r; row <= selection.e.r; row += 1) {
    for (let col = selection.s.c; col <= selection.e.c; col += 1) {
      if (mergeCoverage.has(row + ':' + col)) continue;
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })] as NativeCell | undefined;
      body.push(...renderCell(
        row, col, { s: { r: row, c: col }, e: { r: row, c: col } },
        cell, columns, rows, body.length, limitations,
      ));
    }
  }

  const drawings = readExcelImages(options.workbookBytes);
  if (drawings.images.length > 0 || drawings.shapes.length > 0 || drawings.snapshotHints.length > 0) {
    limitations.add('drawing-anchor-offsets-not-preserved');
  }
  const zip = readZip(options.workbookBytes);
  for (const image of drawings.images.filter((item) => item.sheet === options.sheet)) {
    const rect = anchorRect(image.anchor, selection, columns, rows, limitations);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    if (!['png', 'jpeg', 'gif'].includes(image.format)) {
      limitations.add('embedded-image-format-not-rendered:' + image.format);
      body.push(placeholderRect(rect, 'image: ' + image.format, 'mmi-image-placeholder'));
      continue;
    }
    const entry = zip.get(image.mediaPart);
    if (!entry) {
      limitations.add('embedded-image-media-missing');
      body.push(placeholderRect(rect, 'missing image', 'mmi-image-placeholder'));
      continue;
    }
    const mime = image.format === 'jpeg' ? 'image/jpeg' : 'image/' + image.format;
    let data: string;
    try {
      data = entry.read().toString('base64');
    } catch {
      limitations.add('embedded-image-media-unreadable');
      body.push(placeholderRect(rect, 'unreadable image', 'mmi-image-placeholder'));
      continue;
    }
    body.push(
      '<image class="mmi-image" x="' + round(rect.x) + '" y="' + round(rect.y)
      + '" width="' + round(rect.width) + '" height="' + round(rect.height)
      + '" preserveAspectRatio="none" href="data:' + mime + ';base64,' + data + '"/>',
    );
  }

  for (const shape of drawings.shapes.filter((item) => item.sheet === options.sheet)) {
    const rect = anchorRect(shape.anchor, selection, columns, rows, limitations);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    limitations.add('drawing-shape-style-approximated');
    if (shape.objectKind === 'connector') {
      body.push(
        '<line class="mmi-connector" x1="' + round(rect.x) + '" y1="' + round(rect.y)
        + '" x2="' + round(rect.x + rect.width) + '" y2="' + round(rect.y + rect.height)
        + '" stroke="#555" stroke-width="2"/>',
      );
      continue;
    }
    if (shape.presetGeometry === 'ellipse') {
      body.push(
        '<ellipse class="mmi-shape" cx="' + round(rect.x + rect.width / 2)
        + '" cy="' + round(rect.y + rect.height / 2) + '" rx="' + round(rect.width / 2)
        + '" ry="' + round(rect.height / 2) + '" fill="#ffffff" fill-opacity="0.7" stroke="#555"/>',
      );
    } else {
      body.push(
        '<rect class="mmi-shape" x="' + round(rect.x) + '" y="' + round(rect.y)
        + '" width="' + round(rect.width) + '" height="' + round(rect.height)
        + '" rx="' + (shape.presetGeometry === 'roundRect' ? 6 : 0)
        + '" fill="#ffffff" fill-opacity="0.7" stroke="#555"/>',
      );
    }
    const shapeText = shape.textRuns.join('');
    if (shapeText) {
      body.push(
        '<text class="mmi-shape-text" x="' + round(rect.x + 4) + '" y="' + round(rect.y + 16)
        + '" font-family="' + escapeXml(FONT_FAMILY) + '" font-size="12" fill="#222">'
        + escapeXml(shapeText) + '</text>',
      );
    }
  }

  for (const hint of drawings.snapshotHints.filter(
    (item) => item.sheet === options.sheet && item.graphicFrameCount > 0,
  )) {
    const rect = anchorRect(hint.anchor, selection, columns, rows, limitations);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    limitations.add('graphic-frame-content-not-rendered');
    body.push(
      '<rect class="mmi-graphic-frame" x="' + round(rect.x) + '" y="' + round(rect.y)
      + '" width="' + round(rect.width) + '" height="' + round(rect.height)
      + '" fill="none" stroke="#8a5a00" stroke-width="2" stroke-dasharray="6 4"/>',
      '<text x="' + round(rect.x + 4) + '" y="' + round(rect.y + 16)
      + '" font-family="' + escapeXml(FONT_FAMILY)
      + '" font-size="11" fill="#8a5a00">graphic frame ×' + hint.graphicFrameCount + '</text>',
    );
  }

  for (const diagnostic of drawings.diagnostics) {
    limitations.add('source-drawing-diagnostic:' + diagnostic.code);
  }

  const metadata = escapeXml(JSON.stringify({
    renderer: NATIVE_SVG_SNAPSHOT_RENDERER,
    implementationVersion: NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION,
    layoutVersion: NATIVE_SVG_LAYOUT_VERSION,
    sheet: options.sheet,
    range: XLSX.utils.encode_range(selection),
  }));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + columns.total + '" height="' + rows.total
      + '" viewBox="0 0 ' + columns.total + ' ' + rows.total + '">',
    '<metadata>' + metadata + '</metadata>',
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

function renderCell(
  sourceRow: number,
  sourceCol: number,
  visibleRange: CellRange,
  cell: NativeCell | undefined,
  columns: AxisMetrics,
  rows: AxisMetrics,
  idSeed: number,
  limitations: Set<string>,
): string[] {
  const rect = rangeRect(visibleRange, columns, rows);
  if (rect.width <= 0 || rect.height <= 0) return [];
  const style = cell?.s;
  const result = [
    '<rect class="mmi-cell" x="' + round(rect.x) + '" y="' + round(rect.y)
      + '" width="' + round(rect.width) + '" height="' + round(rect.height)
      + '" fill="' + fillColor(fillOf(style), limitations) + '"/>',
    ...borderSvg(rect, borderOf(style), limitations),
  ];
  const text = cellText(cell);
  if (!text) return result;

  const fontSize = finiteNumber(style?.font?.sz) ? clamp(style!.font!.sz! * 96 / 72, 8, 36) : 12;
  const fontColor = colorHex(style?.font?.color, '#222222', limitations);
  const textAnchor = style?.alignment?.horizontal === 'center'
    ? 'middle'
    : style?.alignment?.horizontal === 'right' ? 'end' : 'start';
  const x = textAnchor === 'middle'
    ? rect.x + rect.width / 2
    : textAnchor === 'end' ? rect.x + rect.width - 4 : rect.x + 4;
  const lines = text.split(/\r?\n/u);
  const lineHeight = fontSize * 1.2;
  const blockHeight = lines.length * lineHeight;
  const firstY = style?.alignment?.vertical === 'top'
    ? rect.y + fontSize + 2
    : style?.alignment?.vertical === 'bottom'
      ? rect.y + rect.height - blockHeight + fontSize - 2
      : rect.y + (rect.height - blockHeight) / 2 + fontSize;
  const clipId = 'mmi-clip-' + sourceRow + '-' + sourceCol + '-' + idSeed;
  result.push(
    '<clipPath id="' + clipId + '"><rect x="' + round(rect.x + 2) + '" y="' + round(rect.y + 1)
      + '" width="' + round(Math.max(0, rect.width - 4)) + '" height="' + round(Math.max(0, rect.height - 2))
      + '"/></clipPath>',
    '<text class="mmi-cell-text" x="' + round(x) + '" y="' + round(firstY)
      + '" clip-path="url(#' + clipId + ')" font-family="' + escapeXml(style?.font?.name ?? FONT_FAMILY)
      + '" font-size="' + round(fontSize) + '" font-weight="' + (style?.font?.bold ? '700' : '400')
      + '" font-style="' + (style?.font?.italic ? 'italic' : 'normal') + '" text-anchor="' + textAnchor
      + '" fill="' + fontColor + '">'
      + lines.map((line, index) => '<tspan x="' + round(x) + '" dy="' + (index === 0 ? 0 : round(lineHeight))
        + '">' + escapeXml(line) + '</tspan>').join('') + '</text>',
  );
  if (style?.alignment?.wrapText) limitations.add('excel-text-wrapping-approximated');
  return result;
}

function fillOf(style: NativeCellStyle | undefined): NativeCellStyle['fill'] | undefined {
  if (!style) return undefined;
  return style.fill ?? (
    style.patternType !== undefined || style.fgColor !== undefined || style.bgColor !== undefined
      ? {
          ...(style.patternType !== undefined ? { patternType: style.patternType } : {}),
          ...(style.fgColor !== undefined ? { fgColor: style.fgColor } : {}),
          ...(style.bgColor !== undefined ? { bgColor: style.bgColor } : {}),
        }
      : undefined
  );
}

function borderOf(style: NativeCellStyle | undefined): NativeCellStyle['border'] | undefined {
  if (!style) return undefined;
  return style.border ?? (
    style.top !== undefined || style.right !== undefined
      || style.bottom !== undefined || style.left !== undefined
      ? {
          ...(style.top !== undefined ? { top: style.top } : {}),
          ...(style.right !== undefined ? { right: style.right } : {}),
          ...(style.bottom !== undefined ? { bottom: style.bottom } : {}),
          ...(style.left !== undefined ? { left: style.left } : {}),
        }
      : undefined
  );
}

function borderSvg(rect: SnapshotRect, border: NativeCellStyle['border'], limitations: Set<string>): string[] {
  const sides: Array<[keyof NonNullable<NativeCellStyle['border']>, number, number, number, number]> = [
    ['top', rect.x, rect.y, rect.x + rect.width, rect.y],
    ['right', rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height],
    ['bottom', rect.x, rect.y + rect.height, rect.x + rect.width, rect.y + rect.height],
    ['left', rect.x, rect.y, rect.x, rect.y + rect.height],
  ];
  return sides.flatMap(([name, x1, y1, x2, y2]) => {
    const side = border?.[name];
    const style = side?.style?.toLowerCase();
    if (!style || style === 'none') return [];
    const color = colorHex(side?.color, '#222222', limitations);
    if (style === 'double') {
      limitations.add('border-double-metrics-approximated');
      return doubleBorderSvg(name, x1, y1, x2, y2, color);
    }
    if (!['thin', 'hair', 'medium', 'thick'].includes(style)) {
      limitations.add('border-style-approximated:' + style);
    }
    return ['<line x1="' + round(x1) + '" y1="' + round(y1) + '" x2="' + round(x2)
      + '" y2="' + round(y2) + '" stroke="' + color
      + '" stroke-width="' + borderWidth(style) + '"/>'];
  });
}

function doubleBorderSvg(
  side: keyof NonNullable<NativeCellStyle['border']>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): string[] {
  const inset = 2;
  let ix1 = x1;
  let iy1 = y1;
  let ix2 = x2;
  let iy2 = y2;
  if (side === 'top') {
    iy1 += inset;
    iy2 += inset;
  } else if (side === 'right') {
    ix1 -= inset;
    ix2 -= inset;
  } else if (side === 'bottom') {
    iy1 -= inset;
    iy2 -= inset;
  } else {
    ix1 += inset;
    ix2 += inset;
  }
  const line = (ax: number, ay: number, bx: number, by: number): string =>
    '<line class="mmi-border-double" x1="' + round(ax) + '" y1="' + round(ay)
      + '" x2="' + round(bx) + '" y2="' + round(by) + '" stroke="' + color
      + '" stroke-width="1"/>';
  return [
    line(x1, y1, x2, y2),
    line(ix1, iy1, ix2, iy2),
  ];
}

function borderWidth(style: string | undefined): number {
  if (!style || style === 'none') return 1;
  if (style === 'hair') return 0.5;
  if (style === 'medium') return 2;
  if (style === 'thick') return 3;
  return 1;
}

function fillColor(fill: NativeCellStyle['fill'], limitations: Set<string>): string {
  if (!fill || fill.patternType === 'none') return '#ffffff';
  if (fill.patternType && fill.patternType !== 'solid') {
    limitations.add('fill-pattern-approximated:' + fill.patternType);
  }
  return colorHex(fill.fgColor ?? fill.bgColor, '#ffffff', limitations);
}

function colorHex(color: NativeColor | undefined, fallback: string, limitations: Set<string>): string {
  const raw = color?.rgb?.replace(/^#/u, '').toUpperCase();
  if (raw && /^[0-9A-F]{6}$/u.test(raw)) return '#' + raw;
  if (raw && /^[0-9A-F]{8}$/u.test(raw)) return '#' + raw.slice(2);
  if (color?.theme !== undefined) limitations.add('theme-color-unresolved');
  return fallback;
}

function cellText(cell: NativeCell | undefined): string {
  if (!cell) return '';
  if (typeof cell.w === 'string') return cell.w;
  if (cell.v === null || cell.v === undefined) return '';
  if (cell.v instanceof Date) return cell.v.toISOString();
  return String(cell.v);
}

function columnMetrics(worksheet: XLSX.WorkSheet, start: number, end: number): AxisMetrics {
  const source = (worksheet['!cols'] ?? []) as NativeColumn[];
  const sizes: number[] = [];
  for (let col = start; col <= end; col += 1) sizes.push(source[col]?.hidden ? 0 : columnWidth(source[col]));
  return axisMetrics(start, end, sizes);
}
function rowMetrics(worksheet: XLSX.WorkSheet, start: number, end: number): AxisMetrics {
  const source = (worksheet['!rows'] ?? []) as NativeRow[];
  const sizes: number[] = [];
  for (let row = start; row <= end; row += 1) sizes.push(source[row]?.hidden ? 0 : rowHeight(source[row]));
  return axisMetrics(start, end, sizes);
}
function columnWidth(value: NativeColumn | undefined): number {
  if (finiteNumber(value?.wpx)) return clamp(value!.wpx!, 4, 320);
  if (finiteNumber(value?.wch)) return clamp(value!.wch! * 7 + 5, 4, 320);
  if (finiteNumber(value?.width)) return clamp(value!.width! * 7 + 5, 4, 320);
  return DEFAULT_COLUMN_PX;
}
function rowHeight(value: NativeRow | undefined): number {
  if (finiteNumber(value?.hpx)) return clamp(value!.hpx!, 4, 240);
  if (finiteNumber(value?.hpt)) return clamp(value!.hpt! * 96 / 72, 4, 240);
  return DEFAULT_ROW_PX;
}
function axisMetrics(start: number, end: number, sizes: number[]): AxisMetrics {
  const offsets = [0];
  for (const size of sizes) offsets.push(offsets[offsets.length - 1] + size);
  return { start, end, sizes, offsets, total: offsets[offsets.length - 1] };
}

function rangeRect(range: CellRange, columns: AxisMetrics, rows: AxisMetrics): SnapshotRect {
  const startCol = clamp(range.s.c, columns.start, columns.end + 1);
  const endCol = clamp(range.e.c + 1, columns.start, columns.end + 1);
  const startRow = clamp(range.s.r, rows.start, rows.end + 1);
  const endRow = clamp(range.e.r + 1, rows.start, rows.end + 1);
  const x = axisEdge(columns, startCol);
  const y = axisEdge(rows, startRow);
  return { x, y, width: Math.max(0, axisEdge(columns, endCol) - x), height: Math.max(0, axisEdge(rows, endRow) - y) };
}

function anchorRect(
  anchor: ImageAnchor,
  selection: CellRange,
  columns: AxisMetrics,
  rows: AxisMetrics,
  limitations: Set<string>,
): SnapshotRect | undefined {
  if (anchor.kind === 'absoluteAnchor') {
    limitations.add('absolute-anchor-position-unavailable');
    return undefined;
  }
  if (!anchor.from) return undefined;
  if (anchor.kind === 'twoCellAnchor' && anchor.to) {
    const sourceRange: CellRange = {
      s: { c: anchor.from.col, r: anchor.from.row },
      e: { c: anchor.to.col, r: anchor.to.row },
    };
    if (!rangesOverlap(selection, sourceRange)) return undefined;
    return rangeRect(sourceRange, columns, rows);
  }
  if (anchor.from.col < selection.s.c || anchor.from.col > selection.e.c
      || anchor.from.row < selection.s.r || anchor.from.row > selection.e.r) {
    limitations.add('one-cell-anchor-outside-selection-not-clipped');
    return undefined;
  }
  const x = axisEdge(columns, anchor.from.col);
  const y = axisEdge(rows, anchor.from.row);
  const width = anchor.extentEmu ? anchor.extentEmu.cx / EMU_PER_PX_96DPI : DEFAULT_COLUMN_PX;
  const height = anchor.extentEmu ? anchor.extentEmu.cy / EMU_PER_PX_96DPI : DEFAULT_ROW_PX;
  return {
    x, y,
    width: Math.min(width, Math.max(0, columns.total - x)),
    height: Math.min(height, Math.max(0, rows.total - y)),
  };
}

function axisEdge(metrics: AxisMetrics, coordinate: number): number {
  if (coordinate <= metrics.start) return 0;
  if (coordinate >= metrics.end + 1) return metrics.total;
  return metrics.offsets[coordinate - metrics.start];
}
function rangesOverlap(left: CellRange, right: CellRange): boolean {
  return left.s.r <= right.e.r && right.s.r <= left.e.r && left.s.c <= right.e.c && right.s.c <= left.e.c;
}
function placeholderRect(rect: SnapshotRect, label: string, className: string): string {
  return '<g class="' + className + '"><rect x="' + round(rect.x) + '" y="' + round(rect.y)
    + '" width="' + round(rect.width) + '" height="' + round(rect.height)
    + '" fill="#f7f7f7" stroke="#a65a00" stroke-dasharray="4 3"/>'
    + '<text x="' + round(rect.x + 4) + '" y="' + round(rect.y + 16)
    + '" font-family="' + escapeXml(FONT_FAMILY) + '" font-size="11" fill="#a65a00">'
    + escapeXml(label) + '</text></g>';
}

function validateInput(sourcePath: string, sheet: string, range: string): void {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.xlsx', '.xlsm'].includes(extension)) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_UNSUPPORTED_SOURCE',
      'native SVG region snapshot supports .xlsx/.xlsm, not ' + (extension || '(no extension)'),
    );
  }
  if (!sheet.trim()) throw new RegionSnapshotError('MMI_SNAPSHOT_SHEET_NOT_FOUND', 'snapshot needs a worksheet name');
  normalizeRange(range);
}
function normalizeRange(value: string): string {
  try {
    const decoded = XLSX.utils.decode_range(value.trim().toUpperCase());
    if (decoded.s.r < 0 || decoded.s.c < 0 || decoded.e.r < decoded.s.r || decoded.e.c < decoded.s.c) {
      throw new Error('invalid bounds');
    }
    return XLSX.utils.encode_range(decoded);
  } catch (error) {
    throw new RegionSnapshotError('MMI_SNAPSHOT_RANGE_INVALID', 'invalid snapshot range: ' + value, { cause: error });
  }
}

function existingOrCreateManifest(options: {
  manifestFile: string; sourceLabel: string; sourceDigest: string;
  officeInfo: { application?: string; appVersion?: string };
  sheet: string; range: string; svgFile: string; svgDigest: string; svgBytes: number;
  widthPx: number; heightPx: number; limitations: string[];
}): NativeSvgRegionSnapshotManifest {
  if (fs.existsSync(options.manifestFile)) {
    const existing = JSON.parse(fs.readFileSync(options.manifestFile, 'utf8')) as NativeSvgRegionSnapshotManifest;
    if (existing.schema === REGION_SNAPSHOT_SCHEMA
        && existing.source.label === options.sourceLabel
        && existing.source.digest === options.sourceDigest
        && existing.selection.sheet === options.sheet
        && existing.selection.range === options.range
        && existing.artifact.file === path.basename(options.svgFile)
        && existing.artifact.digest === options.svgDigest
        && existing.artifact.bytes === options.svgBytes
        && existing.artifact.widthPx === options.widthPx
        && existing.artifact.heightPx === options.heightPx
        && existing.artifact.mediaType === 'image/svg+xml'
        && existing.renderer.id === NATIVE_SVG_SNAPSHOT_RENDERER
        && existing.renderer.implementationVersion === NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION
        && existing.renderer.sheetJsVersion === XLSX.version
        && existing.renderer.layoutVersion === NATIVE_SVG_LAYOUT_VERSION
        && existing.renderer.fontFamily === FONT_FAMILY
        && JSON.stringify(existing.limitations) === JSON.stringify(options.limitations)) return existing;
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_OUTPUT_COLLISION',
      'snapshot manifest exists for different provenance: ' + options.manifestFile,
    );
  }
  const manifest: NativeSvgRegionSnapshotManifest = {
    schema: REGION_SNAPSHOT_SCHEMA,
    source: { label: options.sourceLabel, digest: options.sourceDigest, ...options.officeInfo },
    selection: { sheet: options.sheet, range: options.range },
    renderer: {
      id: NATIVE_SVG_SNAPSHOT_RENDERER,
      implementationVersion: NATIVE_SVG_SNAPSHOT_IMPLEMENTATION_VERSION,
      sheetJsVersion: XLSX.version,
      layoutVersion: NATIVE_SVG_LAYOUT_VERSION,
      fontFamily: FONT_FAMILY,
    },
    artifact: {
      file: path.basename(options.svgFile), digest: options.svgDigest, bytes: options.svgBytes,
      widthPx: options.widthPx, heightPx: options.heightPx, mediaType: 'image/svg+xml',
    },
    limitations: options.limitations,
    renderedAtUtc: new Date().toISOString(),
  };
  fs.writeFileSync(options.manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function readOfficeApplicationInfo(bytes: Uint8Array): { application?: string; appVersion?: string } {
  try {
    const app = readZip(bytes).get('docProps/app.xml');
    if (!app) return {};
    const xml = app.read().toString('utf8');
    const application = /<(?:\w+:)?Application>([^<]*)<\/(?:\w+:)?Application>/u.exec(xml)?.[1]?.trim();
    const appVersion = /<(?:\w+:)?AppVersion>([^<]*)<\/(?:\w+:)?AppVersion>/u.exec(xml)?.[1]?.trim();
    return { ...(application ? { application } : {}), ...(appVersion ? { appVersion } : {}) };
  } catch { return {}; }
}
function writeContentAddressed(file: string, bytes: Buffer): 'written' | 'unchanged' {
  if (fs.existsSync(file)) {
    if (!fs.statSync(file).isFile() || sha256(fs.readFileSync(file)) !== sha256(bytes)) {
      throw new RegionSnapshotError('MMI_SNAPSHOT_OUTPUT_COLLISION', 'snapshot output exists with different bytes: ' + file);
    }
    return 'unchanged';
  }
  fs.writeFileSync(file, bytes);
  return 'written';
}
function snapshotProvenanceComment(options: {
  source: string; sourceDigest: string; sheet: string; range: string; artifactDigest: string; renderer: string;
}): string {
  const clean = (value: string): string => value.replace(/--/gu, '- -').replace(/"/gu, "'").replace(/[\r\n]+/gu, ' ');
  return '<!-- mmi:region-snapshot source="' + clean(options.source) + '" sheet="' + clean(options.sheet)
    + '" range="' + clean(options.range) + '" source-sha256="' + options.sourceDigest.slice(7)
    + '" artifact-sha256="' + options.artifactDigest.slice(7) + '" renderer="' + clean(options.renderer) + '" -->';
}
function escapeMarkdownAlt(value: string): string { return value.replace(/([\\\[\]])/gu, '\\$1'); }
function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}
function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function sha256(bytes: Buffer): string { return 'sha256:' + createHash('sha256').update(bytes).digest('hex'); }
