/**
 * シート／範囲のスナップショット: xlsx の見た目を SVG として描く（issue-0198、ADR-0019 D0・D14）。
 *
 * Excel方眼紙のように、罫線・セル結合・塗り・図形・貼り付け画像で描かれたシートを、
 * 構造を読み取らずに見た目のまま運ぶ。描画は MMI 自身が OOXML を直接読んで行い、
 * LibreOffice・フォント・画像ライブラリに頼らない。CI（Linux）でも同じ入力から
 * 同じバイト列になる（時刻・乱数・絶対パスを出力に含めない）。
 *
 * 純関数: xlsx のバイト列を受け取り、SVG 文字列と診断を返す。原本には触れない。
 *
 * 近似と未対応は黙って捨てず、診断として返す。未対応の図形はプレースホルダの枠を描く。
 */
import type { SourceCellType } from '../core/sheetSource.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import { loadWorkbookFromBytes } from '../core/workbookLoader.js';
import { readZip, ZipError, type ZipEntry } from '../core/zipReader.js';
import {
  attr,
  child,
  childrenNamed,
  descendants,
  parseXml,
  scanXml,
  XmlLimitError,
  type XmlLimits,
  type XmlNode,
} from './sheetSnapshotXml.js';

/** 描画方式と版。描画規則を変えて出力が変わり得るときに上げる。 */
export const MMI_SNAPSHOT_RENDERER = 'mmi-sheet-svg/1';
/** フォントは埋め込まず、名前だけを指定する。 */
export const SNAPSHOT_FONT_FAMILY = "'Yu Gothic','Noto Sans CJK JP',sans-serif";

export type SnapshotDiagnosticCode =
  | 'MMI_SNAPSHOT_SOURCE_UNREADABLE'
  | 'MMI_SNAPSHOT_SOURCE_CHANGED'
  | 'MMI_SNAPSHOT_NOT_A_PACKAGE'
  | 'MMI_SNAPSHOT_PACKAGE_UNSUPPORTED'
  | 'MMI_SNAPSHOT_SHEET_NOT_FOUND'
  | 'MMI_SNAPSHOT_INVALID_RANGE'
  | 'MMI_SNAPSHOT_RANGE_TOO_LARGE'
  | 'MMI_SNAPSHOT_EMPTY_SHEET'
  | 'MMI_SNAPSHOT_PART_UNREADABLE'
  | 'MMI_SNAPSHOT_LIMIT_EXCEEDED'
  | 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE'
  | 'MMI_SNAPSHOT_UNSUPPORTED_IMAGE'
  | 'MMI_SNAPSHOT_MEDIA_MISSING'
  | 'MMI_SNAPSHOT_UNSUPPORTED_FORMAT'
  | 'MMI_SNAPSHOT_APPROXIMATED';

export interface SnapshotDiagnostic {
  code: SnapshotDiagnosticCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sheet?: string;
  part?: string;
  /** 図形・書式の種類（例: `prst:wedgeRectCallout`、`chart`、`group`、`textRotation`）。 */
  kind?: string;
  /** 位置（A1形式のセル範囲）。 */
  at?: string;
  /** 同じ近似が何か所で起きたか（書式の近似はまとめて1件にする）。 */
  count?: number;
}

export interface SnapshotLimits {
  /** 描く範囲のセル数（行数×列数）の上限。 */
  maxRangeCells: number;
  /** シートXMLから読むセル数の上限。 */
  maxParsedCells: number;
  /** 1パートあたりのXML要素数の上限。 */
  maxXmlElements: number;
  /** 描画オブジェクト数の上限。 */
  maxDrawingObjects: number;
  /** SVGへ埋め込む画像の合計バイト数の上限。 */
  maxEmbeddedImageBytes: number;
}

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxRangeCells: 1_000_000,
  maxParsedCells: 4_000_000,
  maxXmlElements: 16_000_000,
  maxDrawingObjects: 10_000,
  maxEmbeddedImageBytes: 64 * 1024 * 1024,
};

export interface RenderSheetSvgInput {
  /** xlsx / xlsm のバイト列。 */
  bytes: Uint8Array;
  sheet: string;
  /** A1形式の範囲。省略時は使用範囲（値・書式・結合・図形がある範囲）。 */
  range?: string;
  /** メタデータに記録する原本の名前（ファイル名など）。絶対パスは渡さない。 */
  sourceLabel?: string;
  limits?: Partial<SnapshotLimits>;
}

export interface RenderSheetSvgResult {
  /** 描けたときだけ存在する。エラーの診断があるときは無い。 */
  svg?: string;
  diagnostics: SnapshotDiagnostic[];
  renderer: typeof MMI_SNAPSHOT_RENDERER;
  sourceDigest: string;
  sheet: string;
  /** 実際に描いた範囲（A1形式）。 */
  range?: string;
  width?: number;
  height?: number;
}

// --- A1 ----------------------------------------------------------------------------

const MAX_COLS = 16_384;
const MAX_ROWS = 1_048_576;

export interface CellRect {
  /** 0始まり、両端を含む。 */
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export function columnLabel(index: number): string {
  let out = '';
  for (let v = index + 1; v > 0; v = Math.floor((v - 1) / 26)) out = String.fromCharCode(65 + ((v - 1) % 26)) + out;
  return out;
}

const cellA1 = (row: number, col: number): string => `${columnLabel(col)}${row + 1}`;
export const rectA1 = (rect: CellRect): string =>
  rect.startRow === rect.endRow && rect.startCol === rect.endCol
    ? cellA1(rect.startRow, rect.startCol)
    : `${cellA1(rect.startRow, rect.startCol)}:${cellA1(rect.endRow, rect.endCol)}`;

function parseCell(ref: string): { row: number; col: number } | undefined {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/u.exec(ref.trim());
  if (!match) return undefined;
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(match[2]);
  if (col < 1 || col > MAX_COLS || row < 1 || row > MAX_ROWS) return undefined;
  return { row: row - 1, col: col - 1 };
}

/** `A1:F20`・`A1`・`$A$1:$F$20` を受け付ける。逆順の指定は正規化する。 */
export function parseA1Range(text: string): CellRect | undefined {
  const parts = text.trim().split(':');
  if (parts.length > 2) return undefined;
  const a = parseCell(parts[0]);
  const b = parts.length === 2 ? parseCell(parts[1]) : a;
  if (!a || !b) return undefined;
  return {
    startRow: Math.min(a.row, b.row),
    startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row),
    endCol: Math.max(a.col, b.col),
  };
}

// --- 数値・文字列の出力 ----------------------------------------------------------------

/** 小数2桁に丸めた決定論的な数値表記。 */
const num = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) || rounded === 0 ? '0' : String(rounded);
};

// XML 1.0 で使えない制御文字を除く。
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/gu;
const escapeXml = (value: string): string =>
  value
    .replace(INVALID_XML, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

/** OOXML の `_xHHHH_` エスケープを戻す。 */
const decodeOoxmlEscapes = (value: string): string =>
  value.replace(/_x([0-9A-Fa-f]{4})_/gu, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));

// --- 色 ----------------------------------------------------------------------------

type Rgb = [number, number, number];

const hexOf = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function rgbOf(hex: string): Rgb | undefined {
  const clean = hex.replace(/^#/u, '');
  const six = clean.length === 8 ? clean.slice(2) : clean;
  if (!/^[0-9A-Fa-f]{6}$/u.test(six)) return undefined;
  return [parseInt(six.slice(0, 2), 16), parseInt(six.slice(2, 4), 16), parseInt(six.slice(4, 6), 16)];
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** SpreadsheetML の tint（HLSの輝度を動かす）。 */
function applyTint(rgb: Rgb, tint: number): Rgb {
  if (!tint) return rgb;
  const [h, s, l] = toHsl(rgb);
  const next = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return fromHsl([h, s, clamp01(next)]);
}

/** Excel 既定の索引色（0〜63）。64はシステム前景、65はシステム背景。 */
const INDEXED_COLORS = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
  '000000', 'FFFFFF',
];

/** Office 既定テーマ（テーマ部品が無いときに使う）。 */
const DEFAULT_THEME: Record<string, string> = {
  dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6',
  accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47',
  hlink: '0563C1', folHlink: '954F72',
};

/** SpreadsheetML の `theme="n"` の並び（lt1/dk1 と lt2/dk2 が入れ替わる）。 */
const SPREADSHEET_THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

interface Palette {
  theme: Record<string, string>;
  indexed: string[];
}

/** `<color rgb|theme|indexed|auto tint>` を色にする。`auto` は undefined（呼び出し側の既定）。 */
function spreadsheetColor(node: XmlNode | undefined, palette: Palette): string | undefined {
  if (!node) return undefined;
  const tint = Number(attr(node, 'tint') ?? 0) || 0;
  let base: Rgb | undefined;
  const rgb = attr(node, 'rgb');
  const theme = attr(node, 'theme');
  const indexed = attr(node, 'indexed');
  if (rgb !== undefined) base = rgbOf(rgb);
  else if (theme !== undefined) {
    const key = SPREADSHEET_THEME_ORDER[Number(theme)];
    base = key ? rgbOf(palette.theme[key] ?? DEFAULT_THEME[key]) : undefined;
  } else if (indexed !== undefined) {
    const value = palette.indexed[Number(indexed)];
    base = value ? rgbOf(value) : undefined;
  }
  if (!base) return undefined;
  return hexOf(applyTint(base, tint));
}

const PRESET_COLORS: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
  gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080',
  navy: '000080', cyan: '00FFFF', magenta: 'FF00FF', lime: '00FF00', maroon: '800000', olive: '808000', teal: '008080', silver: 'C0C0C0',
};

interface DrawingColor {
  hex: string;
  alpha: number;
}

const SCHEME_ALIASES: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

/** DrawingML の色要素（srgbClr/schemeClr/sysClr/prstClr と lumMod 等の修飾）を解く。 */
function drawingColor(holder: XmlNode | undefined, palette: Palette, placeholder?: DrawingColor): DrawingColor | undefined {
  if (!holder) return undefined;
  const node = holder.children.find((item) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(item.name));
  if (!node) return undefined;
  let rgb: Rgb | undefined;
  let alpha = 1;
  switch (node.name) {
    case 'srgbClr': rgb = rgbOf(attr(node, 'val') ?? ''); break;
    case 'sysClr': rgb = rgbOf(attr(node, 'lastClr') ?? '') ?? (attr(node, 'val') === 'window' ? [255, 255, 255] : [0, 0, 0]); break;
    case 'prstClr': rgb = rgbOf(PRESET_COLORS[attr(node, 'val') ?? ''] ?? ''); break;
    case 'scrgbClr': rgb = [Number(attr(node, 'r') ?? 0) / 100000 * 255, Number(attr(node, 'g') ?? 0) / 100000 * 255, Number(attr(node, 'b') ?? 0) / 100000 * 255]; break;
    case 'hslClr': rgb = fromHsl([Number(attr(node, 'hue') ?? 0) / 21600000, Number(attr(node, 'sat') ?? 0) / 100000, Number(attr(node, 'lum') ?? 0) / 100000]); break;
    default: {
      const val = attr(node, 'val') ?? '';
      if (val === 'phClr') {
        if (placeholder) {
          rgb = rgbOf(placeholder.hex);
          alpha = placeholder.alpha;
        }
      } else {
        const key = SCHEME_ALIASES[val] ?? val;
        rgb = rgbOf(palette.theme[key] ?? DEFAULT_THEME[key] ?? '');
      }
    }
  }
  if (!rgb) return undefined;
  for (const mod of node.children) {
    const v = Number(attr(mod, 'val') ?? 0) / 100000;
    if (mod.name === 'lumMod' || mod.name === 'lumOff') {
      const hsl = toHsl(rgb);
      hsl[2] = clamp01(mod.name === 'lumMod' ? hsl[2] * v : hsl[2] + v);
      rgb = fromHsl(hsl);
    } else if (mod.name === 'shade') {
      rgb = [rgb[0] * v, rgb[1] * v, rgb[2] * v];
    } else if (mod.name === 'tint') {
      rgb = [rgb[0] * v + 255 * (1 - v), rgb[1] * v + 255 * (1 - v), rgb[2] * v + 255 * (1 - v)];
    } else if (mod.name === 'alpha') {
      alpha = clamp01(v);
    }
  }
  return { hex: hexOf(rgb), alpha };
}

// --- パッケージ ------------------------------------------------------------------------

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

function resolveTarget(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = ownerPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') base.pop();
    else if (segment !== '.' && segment !== '') base.push(segment);
  }
  return base.join('/');
}

class SnapshotFailure extends Error {
  constructor(readonly diagnostic: SnapshotDiagnostic) {
    super(diagnostic.message);
  }
}

interface Context {
  zip: Map<string, ZipEntry>;
  limits: SnapshotLimits;
  xmlLimits: XmlLimits;
  diagnostics: SnapshotDiagnostic[];
  sheet: string;
  /** 書式の近似・未対応をまとめる（code + kind ごとに1件）。 */
  notes: Map<string, SnapshotDiagnostic>;
}

const partText = (entry: ZipEntry): string => entry.read().toString('utf8');

function readPart(ctx: Context, name: string, required: boolean): XmlNode | undefined {
  const entry = ctx.zip.get(name);
  if (!entry) {
    if (required) throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_PART_UNREADABLE', severity: 'error', part: name, message: `${name} がパッケージにありません` });
    return undefined;
  }
  try {
    return parseXml(partText(entry), ctx.xmlLimits);
  } catch (error) {
    const diagnostic: SnapshotDiagnostic = {
      code: error instanceof XmlLimitError ? 'MMI_SNAPSHOT_LIMIT_EXCEEDED' : 'MMI_SNAPSHOT_PART_UNREADABLE',
      severity: required ? 'error' : 'warning',
      part: name,
      message: `${name} を読めません: ${error instanceof Error ? error.message : String(error)}`,
    };
    if (required) throw new SnapshotFailure(diagnostic);
    ctx.diagnostics.push(diagnostic);
    return undefined;
  }
}

function relsOf(ctx: Context, part: string): Relationship[] {
  const dir = part.split('/').slice(0, -1).join('/');
  const file = part.split('/').pop() as string;
  const name = `${dir ? `${dir}/` : ''}_rels/${file}.rels`;
  const root = ctx.zip.has(name) ? readPart(ctx, name, false) : undefined;
  return childrenNamed(root, 'Relationship').map((node) => {
    const external = attr(node, 'TargetMode') === 'External';
    const target = attr(node, 'Target') ?? '';
    return { id: attr(node, 'Id') ?? '', type: attr(node, 'Type') ?? '', target: external ? target : resolveTarget(part, target), external };
  });
}

function note(ctx: Context, code: SnapshotDiagnosticCode, kind: string, message: string): void {
  const key = `${code}\u0000${kind}`;
  const existing = ctx.notes.get(key);
  if (existing) existing.count = (existing.count ?? 1) + 1;
  else ctx.notes.set(key, { code, severity: code === 'MMI_SNAPSHOT_APPROXIMATED' ? 'info' : 'warning', sheet: ctx.sheet, kind, message, count: 1 });
}

// --- テーマ・スタイル ---------------------------------------------------------------------

function readTheme(ctx: Context): Record<string, string> {
  const theme: Record<string, string> = { ...DEFAULT_THEME };
  const rel = relsOf(ctx, 'xl/workbook.xml').find((item) => item.type.endsWith('/theme'));
  const root = rel ? readPart(ctx, rel.target, false) : undefined;
  const scheme = descendants(root, 'clrScheme')[0];
  for (const item of scheme?.children ?? []) {
    const color = item.children[0];
    const value = color?.name === 'sysClr' ? attr(color, 'lastClr') : attr(color, 'val');
    if (value && rgbOf(value)) theme[item.name] = value;
  }
  return theme;
}

interface FontStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sizePt: number;
  color: string;
  name: string;
}

interface FillStyle {
  color?: string;
  /** 単色でない模様（近似して描いたもの）。 */
  pattern?: string;
  gradient?: boolean;
}

interface BorderSide {
  style: string;
  color: string;
}

interface BorderStyle {
  left?: BorderSide;
  right?: BorderSide;
  top?: BorderSide;
  bottom?: BorderSide;
  diagonal?: BorderSide;
  diagonalUp: boolean;
  diagonalDown: boolean;
}

interface CellFormat {
  font: FontStyle;
  fill: FillStyle;
  border: BorderStyle;
  horizontal: string;
  vertical: string;
  wrap: boolean;
  indent: number;
  rotation: number;
  shrink: boolean;
}

interface Styles {
  formats: CellFormat[];
  palette: Palette;
}

const PATTERN_DENSITY: Record<string, number> = {
  solid: 1, darkGray: 0.75, mediumGray: 0.5, lightGray: 0.25, gray125: 0.125, gray0625: 0.0625,
  darkHorizontal: 0.5, darkVertical: 0.5, darkDown: 0.5, darkUp: 0.5, darkGrid: 0.5, darkTrellis: 0.75,
  lightHorizontal: 0.25, lightVertical: 0.25, lightDown: 0.25, lightUp: 0.25, lightGrid: 0.25, lightTrellis: 0.25,
};

function blend(fg: string, bg: string, ratio: number): string {
  const a = rgbOf(fg) ?? [0, 0, 0];
  const b = rgbOf(bg) ?? [255, 255, 255];
  return hexOf([a[0] * ratio + b[0] * (1 - ratio), a[1] * ratio + b[1] * (1 - ratio), a[2] * ratio + b[2] * (1 - ratio)]);
}

function readStyles(ctx: Context, theme: Record<string, string>): Styles {
  const rel = relsOf(ctx, 'xl/workbook.xml').find((item) => item.type.endsWith('/styles'));
  const root = readPart(ctx, rel?.target ?? 'xl/styles.xml', false);
  const indexed = [...INDEXED_COLORS];
  childrenNamed(child(root, 'colors', 'indexedColors'), 'rgbColor').forEach((node, i) => {
    const value = attr(node, 'rgb');
    if (value && rgbOf(value)) indexed[i] = value.slice(-6);
  });
  const palette: Palette = { theme, indexed };

  const fonts: FontStyle[] = childrenNamed(child(root, 'fonts'), 'font').map((node) => {
    const flag = (name: string): boolean => {
      const item = child(node, name);
      if (!item) return false;
      const val = attr(item, 'val');
      return val === undefined || (val !== '0' && val !== 'false' && val !== 'none');
    };
    return {
      bold: flag('b'),
      italic: flag('i'),
      underline: flag('u'),
      strike: flag('strike'),
      sizePt: Number(attr(child(node, 'sz'), 'val') ?? 11) || 11,
      color: spreadsheetColor(child(node, 'color'), palette) ?? '#000000',
      name: attr(child(node, 'name'), 'val') ?? '',
    };
  });
  const defaultFont: FontStyle = fonts[0] ?? { bold: false, italic: false, underline: false, strike: false, sizePt: 11, color: '#000000', name: '' };

  const fills: FillStyle[] = childrenNamed(child(root, 'fills'), 'fill').map((node) => {
    const pattern = child(node, 'patternFill');
    if (pattern) {
      const type = attr(pattern, 'patternType') ?? (child(pattern, 'fgColor') ? 'solid' : 'none');
      if (type === 'none') return {};
      const fg = spreadsheetColor(child(pattern, 'fgColor'), palette) ?? '#000000';
      if (type === 'solid') return { color: fg };
      const bg = spreadsheetColor(child(pattern, 'bgColor'), palette) ?? '#FFFFFF';
      return { color: blend(fg, bg, PATTERN_DENSITY[type] ?? 0.5), pattern: type };
    }
    const gradient = child(node, 'gradientFill');
    if (gradient) {
      const stop = childrenNamed(gradient, 'stop')[0];
      return { color: spreadsheetColor(child(stop, 'color'), palette), gradient: true };
    }
    return {};
  });

  const side = (node: XmlNode | undefined): BorderSide | undefined => {
    const style = attr(node, 'style');
    if (!node || !style || style === 'none') return undefined;
    return { style, color: spreadsheetColor(child(node, 'color'), palette) ?? '#000000' };
  };
  const borders: BorderStyle[] = childrenNamed(child(root, 'borders'), 'border').map((node) => ({
    left: side(child(node, 'left') ?? child(node, 'start')),
    right: side(child(node, 'right') ?? child(node, 'end')),
    top: side(child(node, 'top')),
    bottom: side(child(node, 'bottom')),
    diagonal: side(child(node, 'diagonal')),
    diagonalUp: attr(node, 'diagonalUp') === '1' || attr(node, 'diagonalUp') === 'true',
    diagonalDown: attr(node, 'diagonalDown') === '1' || attr(node, 'diagonalDown') === 'true',
  }));

  const formats: CellFormat[] = childrenNamed(child(root, 'cellXfs'), 'xf').map((node) => {
    const alignment = child(node, 'alignment');
    const fill = fills[Number(attr(node, 'fillId') ?? 0)] ?? {};
    return {
      font: fonts[Number(attr(node, 'fontId') ?? 0)] ?? defaultFont,
      fill,
      border: borders[Number(attr(node, 'borderId') ?? 0)] ?? { diagonalUp: false, diagonalDown: false },
      horizontal: attr(alignment, 'horizontal') ?? 'general',
      vertical: attr(alignment, 'vertical') ?? 'bottom',
      wrap: attr(alignment, 'wrapText') === '1' || attr(alignment, 'wrapText') === 'true',
      indent: Number(attr(alignment, 'indent') ?? 0) || 0,
      rotation: Number(attr(alignment, 'textRotation') ?? 0) || 0,
      shrink: attr(alignment, 'shrinkToFit') === '1' || attr(alignment, 'shrinkToFit') === 'true',
    };
  });
  if (formats.length === 0) {
    formats.push({ font: defaultFont, fill: {}, border: { diagonalUp: false, diagonalDown: false }, horizontal: 'general', vertical: 'bottom', wrap: false, indent: 0, rotation: 0, shrink: false });
  }
  return { formats, palette };
}

// --- 共有文字列・シート ---------------------------------------------------------------------

function readSharedStrings(ctx: Context): string[] {
  const rel = relsOf(ctx, 'xl/workbook.xml').find((item) => item.type.endsWith('/sharedStrings'));
  const entry = ctx.zip.get(rel?.target ?? 'xl/sharedStrings.xml');
  if (!entry) return [];
  const strings: string[] = [];
  let current: string | undefined;
  let inText = false;
  let phonetic = 0;
  try {
    scanXml(partText(entry), {
      open(name, _attrs, selfClosing) {
        if (name === 'si') current = selfClosing ? undefined : '';
        if (selfClosing && name === 'si') strings.push('');
        if (name === 'rPh' && !selfClosing) phonetic += 1;
        if (name === 't' && !selfClosing) inText = true;
      },
      close(name) {
        if (name === 't') inText = false;
        if (name === 'rPh') phonetic = Math.max(0, phonetic - 1);
        if (name === 'si' && current !== undefined) {
          strings.push(decodeOoxmlEscapes(current));
          current = undefined;
        }
      },
      text(value) {
        if (inText && phonetic === 0 && current !== undefined) current += value;
      },
    }, ctx.xmlLimits);
  } catch (error) {
    ctx.diagnostics.push({ code: error instanceof XmlLimitError ? 'MMI_SNAPSHOT_LIMIT_EXCEEDED' : 'MMI_SNAPSHOT_PART_UNREADABLE', severity: 'warning', part: entry.name, message: `共有文字列を読めません（文字は表示されない場合があります）: ${error instanceof Error ? error.message : String(error)}` });
  }
  return strings;
}

interface RawCell {
  style: number;
  type?: string;
  value?: string;
}

interface SheetModel {
  cells: Map<number, RawCell>;
  cols: Map<number, { widthPx?: number; hidden: boolean; style?: number }>;
  rows: Map<number, { heightPx?: number; hidden: boolean; style?: number }>;
  merges: CellRect[];
  defaultColPx: number;
  defaultRowPx: number;
  showGridLines: boolean;
  drawingRelId?: string;
  hasLegacyDrawing: boolean;
  conditionalFormats: number;
  dataBarsOrIcons: boolean;
  /** テーブル（ListObject）の数。テーブルのスタイルは描かない。 */
  tableParts: number;
  sparklines: number;
}

const cellKey = (row: number, col: number): number => row * MAX_COLS + col;

/** 列幅（文字数）を画素へ。OOXML 仕様の換算式。 */
function columnWidthPx(width: number, maxDigitWidth: number): number {
  return Math.max(0, Math.trunc(((256 * width + Math.trunc(128 / maxDigitWidth)) / 256) * maxDigitWidth));
}

const ptToPx = (pt: number): number => Math.round((pt * 96) / 72);

/** 標準フォントの数字の最大幅（画素）。フォントを持たないので名前から近似する。 */
function maxDigitWidthOf(font: FontStyle): number {
  const eastAsian = /[^\x00-\x7F]|yu ?gothic|yu ?mincho|meiryo|ms ?p?gothic|ms ?p?mincho|hiragino|noto (sans|serif) cjk|ipa/iu.test(font.name);
  return Math.max(5, Math.round(((eastAsian ? 8 : 7) * font.sizePt) / 11));
}

function readSheet(ctx: Context, part: string, styles: Styles, sharedStrings: string[]): SheetModel {
  const entry = ctx.zip.get(part);
  if (!entry) throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_PART_UNREADABLE', severity: 'error', sheet: ctx.sheet, part, message: `シートの部品 ${part} がありません` });
  const mdw = maxDigitWidthOf(styles.formats[0].font);
  const model: SheetModel = {
    cells: new Map(),
    cols: new Map(),
    rows: new Map(),
    merges: [],
    defaultColPx: Math.ceil((8 * mdw + 5) / 8) * 8,
    defaultRowPx: 20,
    showGridLines: true,
    hasLegacyDrawing: false,
    conditionalFormats: 0,
    dataBarsOrIcons: false,
    tableParts: 0,
    sparklines: 0,
  };
  let sheetViewSeen = false;
  let inSheetData = false;
  let row = -1;
  let col = -1;
  let cell: RawCell | undefined;
  let capture: 'v' | 't' | undefined;
  let inInline = false;
  let phonetic = 0;
  let buffer = '';
  let parsedCells = 0;
  try {
    scanXml(partText(entry), {
      open(name, a, selfClosing) {
        switch (name) {
          case 'sheetView':
            if (!sheetViewSeen) {
              sheetViewSeen = true;
              const value = attr({ name, attrs: a, children: [], text: '' }, 'showGridLines');
              if (value === '0' || value === 'false') model.showGridLines = false;
            }
            break;
          case 'sheetFormatPr': {
            const node = { name, attrs: a, children: [], text: '' };
            const defaultRow = Number(attr(node, 'defaultRowHeight'));
            if (Number.isFinite(defaultRow) && defaultRow > 0) model.defaultRowPx = ptToPx(defaultRow);
            if (attr(node, 'zeroHeight') === '1' || attr(node, 'zeroHeight') === 'true') model.defaultRowPx = 0;
            const defaultCol = Number(attr(node, 'defaultColWidth'));
            const baseCol = Number(attr(node, 'baseColWidth'));
            if (Number.isFinite(defaultCol) && defaultCol > 0) model.defaultColPx = columnWidthPx(defaultCol, mdw);
            else if (Number.isFinite(baseCol) && baseCol > 0) model.defaultColPx = Math.ceil((baseCol * mdw + 5) / 8) * 8;
            break;
          }
          case 'col': {
            const node = { name, attrs: a, children: [], text: '' };
            const min = Math.max(1, Number(attr(node, 'min') ?? 0) || 0);
            const max = Math.min(MAX_COLS, Number(attr(node, 'max') ?? min) || min);
            const width = Number(attr(node, 'width'));
            const hidden = attr(node, 'hidden') === '1' || attr(node, 'hidden') === 'true';
            const style = attr(node, 'style') !== undefined ? Number(attr(node, 'style')) : undefined;
            for (let c = min; c <= max; c += 1) {
              model.cols.set(c - 1, { ...(Number.isFinite(width) ? { widthPx: columnWidthPx(width, mdw) } : {}), hidden, ...(style !== undefined ? { style } : {}) });
            }
            break;
          }
          case 'sheetData':
            inSheetData = !selfClosing;
            break;
          case 'row': {
            if (!inSheetData) break;
            const node = { name, attrs: a, children: [], text: '' };
            const r = Number(attr(node, 'r'));
            row = Number.isFinite(r) && r >= 1 ? r - 1 : row + 1;
            col = -1;
            const ht = Number(attr(node, 'ht'));
            const hidden = attr(node, 'hidden') === '1' || attr(node, 'hidden') === 'true';
            const customFormat = attr(node, 'customFormat') === '1' || attr(node, 'customFormat') === 'true';
            const style = customFormat && attr(node, 's') !== undefined ? Number(attr(node, 's')) : undefined;
            if (Number.isFinite(ht) || hidden || style !== undefined) {
              model.rows.set(row, { ...(Number.isFinite(ht) ? { heightPx: ptToPx(ht) } : {}), hidden, ...(style !== undefined ? { style } : {}) });
            }
            break;
          }
          case 'c': {
            if (!inSheetData) break;
            parsedCells += 1;
            if (parsedCells > ctx.limits.maxParsedCells) throw new XmlLimitError(`セルが ${ctx.limits.maxParsedCells} 個を超えています`);
            const node = { name, attrs: a, children: [], text: '' };
            const ref = attr(node, 'r');
            const parsed = ref ? parseCell(ref) : undefined;
            if (parsed) {
              row = parsed.row;
              col = parsed.col;
            } else col += 1;
            if (row < 0) row = 0;
            buffer = '';
            cell = { style: Number(attr(node, 's') ?? 0) || 0, ...(attr(node, 't') ? { type: attr(node, 't') } : {}) };
            model.cells.set(cellKey(row, col), cell);
            if (selfClosing) cell = undefined;
            break;
          }
          case 'v':
            if (cell && !selfClosing) {
              capture = 'v';
              buffer = '';
            }
            break;
          case 'is':
            if (cell) inInline = !selfClosing;
            break;
          case 'rPh':
            if (!selfClosing) phonetic += 1;
            break;
          case 't':
            if (cell && inInline && phonetic === 0 && !selfClosing) {
              capture = 't';
            }
            break;
          case 'mergeCell': {
            const rect = parseA1Range(attr({ name, attrs: a, children: [], text: '' }, 'ref') ?? '');
            if (rect && (rect.endRow > rect.startRow || rect.endCol > rect.startCol)) model.merges.push(rect);
            break;
          }
          case 'drawing':
            model.drawingRelId = attr({ name, attrs: a, children: [], text: '' }, 'id');
            break;
          case 'legacyDrawing':
          case 'legacyDrawingHF':
            model.hasLegacyDrawing = true;
            break;
          case 'conditionalFormatting':
            model.conditionalFormats += 1;
            break;
          case 'dataBar':
          case 'iconSet':
          case 'colorScale':
            model.dataBarsOrIcons = true;
            break;
          case 'tablePart':
            model.tableParts += 1;
            break;
          case 'sparklineGroup':
            model.sparklines += 1;
            break;
          default:
        }
      },
      close(name) {
        if (name === 'sheetData') inSheetData = false;
        else if (name === 'v' && capture === 'v' && cell) {
          cell.value = buffer;
          capture = undefined;
        } else if (name === 't' && capture === 't') capture = undefined;
        else if (name === 'rPh') phonetic = Math.max(0, phonetic - 1);
        else if (name === 'is') {
          if (cell) {
            cell.value = decodeOoxmlEscapes(buffer);
            cell.type = 'inlineStr';
          }
          inInline = false;
        } else if (name === 'c') {
          cell = undefined;
          buffer = '';
        }
      },
      text(value) {
        if (capture) buffer += value;
      },
    }, ctx.xmlLimits);
  } catch (error) {
    throw new SnapshotFailure({
      code: error instanceof XmlLimitError ? 'MMI_SNAPSHOT_LIMIT_EXCEEDED' : 'MMI_SNAPSHOT_PART_UNREADABLE',
      severity: 'error',
      sheet: ctx.sheet,
      part,
      message: `シート ${ctx.sheet} を読めません: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  // `<is>` の中の t は共有文字列と同じく読み、v は型に応じて解く。
  for (const item of model.cells.values()) {
    if (item.type === 's' && item.value !== undefined) item.value = sharedStrings[Number(item.value)] ?? '';
    else if (item.type === 'b' && item.value !== undefined) item.value = item.value === '1' ? 'TRUE' : 'FALSE';
  }
  return model;
}

// --- 幾何 ----------------------------------------------------------------------------

/** 行または列の位置（画素）。累積和を必要な分だけ延ばす。 */
class Axis {
  private readonly prefix: number[] = [0];

  constructor(private readonly sizeOf: (index: number) => number, readonly count: number) {}

  size(index: number): number {
    return index < 0 || index >= this.count ? 0 : this.sizeOf(index);
  }

  start(index: number): number {
    const target = Math.max(0, Math.min(this.count, index));
    while (this.prefix.length <= target) {
      const i = this.prefix.length - 1;
      this.prefix.push(this.prefix[i] + this.sizeOf(i));
    }
    return this.prefix[target];
  }

  /** 位置 `pos` を含む行・列（はみ出すときは最後）。 */
  indexAt(pos: number): number {
    // 累積和を pos を越えるところまで延ばしてから二分探索する。
    while (this.prefix.length <= this.count && this.prefix[this.prefix.length - 1] <= pos) this.start(this.prefix.length);
    let lo = 0;
    let hi = Math.min(this.count - 1, this.prefix.length - 2);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.prefix[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

const EMU_PER_PX = 9525;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- 文字 ----------------------------------------------------------------------------

/** 1文字の幅（em）。全角は1、半角は0.55で近似する（フォントを持たないため）。 */
function charEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0xff61 && code <= 0xff9f) return 0.5;
  if (
    (code >= 0x1100 && code <= 0x115f)
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe4f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
    || code >= 0x20000
  ) return 1;
  return 0.55;
}

const textWidth = (text: string, fontPx: number): number => {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontPx;
};

const MAX_TEXT_LINES = 500;

/** 幅に収まるよう折り返す（半角の語は空白で、全角は文字で区切る）。 */
function wrapLines(text: string, maxWidth: number, fontPx: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/u)) {
    if (lines.length >= MAX_TEXT_LINES) break;
    let line = '';
    let width = 0;
    for (const ch of paragraph) {
      const w = charEm(ch) * fontPx;
      if (line && width + w > maxWidth) {
        const space = line.lastIndexOf(' ');
        if (space > 0 && ch !== ' ' && charEm(line[line.length - 1]) < 1) {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1);
          width = textWidth(line, fontPx);
        } else {
          lines.push(line);
          line = '';
          width = 0;
        }
        if (lines.length >= MAX_TEXT_LINES) break;
        if (ch === ' ' && !line) continue;
      }
      line += ch;
      width += w;
    }
    lines.push(line);
  }
  return lines.slice(0, MAX_TEXT_LINES);
}

interface TextStyle {
  fontPx: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  alpha?: number;
}

function textAttributes(style: TextStyle): string {
  const decorations = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  return `font-size="${num(style.fontPx)}" fill="${style.color}"${style.alpha !== undefined && style.alpha < 1 ? ` fill-opacity="${num(style.alpha)}"` : ''}${style.bold ? ' font-weight="bold"' : ''}${style.italic ? ' font-style="italic"' : ''}${decorations ? ` text-decoration="${decorations}"` : ''}`;
}

/**
 * 行の並びを `<text>` にする。y は各行の中心、dominant-baseline="central" で揃える。
 */
function textElement(lines: string[], x: number, firstCenterY: number, lineHeight: number, anchor: 'start' | 'middle' | 'end', style: TextStyle, clipId?: string): string {
  const preserve = lines.some((line) => /^\s|\s$|\s\s/u.test(line)) ? ' xml:space="preserve"' : '';
  const head = `<text x="${num(x)}" y="${num(firstCenterY)}" text-anchor="${anchor}" dominant-baseline="central" ${textAttributes(style)}${clipId ? ` clip-path="url(#${clipId})"` : ''}${preserve}>`;
  if (lines.length === 1) return `${head}${escapeXml(lines[0])}</text>`;
  return `${head}${lines.map((line, i) => `<tspan x="${num(x)}" y="${num(firstCenterY + i * lineHeight)}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

// --- 罫線 ----------------------------------------------------------------------------

interface LineStyle {
  width: number;
  dash?: string;
  double?: boolean;
  weight: number;
}

const BORDER_STYLES: Record<string, LineStyle> = {
  hair: { width: 1, dash: '1 1', weight: 1 },
  dotted: { width: 1, dash: '1 2', weight: 2 },
  dashDotDot: { width: 1, dash: '3 1 1 1 1 1', weight: 2 },
  dashDot: { width: 1, dash: '3 1 1 1', weight: 2 },
  dashed: { width: 1, dash: '3 1', weight: 2 },
  thin: { width: 1, weight: 3 },
  mediumDashDotDot: { width: 2, dash: '6 2 2 2 2 2', weight: 4 },
  slantDashDot: { width: 2, dash: '6 2 2 2', weight: 4 },
  mediumDashDot: { width: 2, dash: '6 2 2 2', weight: 4 },
  mediumDashed: { width: 2, dash: '6 2', weight: 4 },
  medium: { width: 2, weight: 5 },
  double: { width: 1, double: true, weight: 6 },
  thick: { width: 3, weight: 7 },
};

const lineStyleOf = (side: BorderSide): LineStyle => BORDER_STYLES[side.style] ?? BORDER_STYLES.thin;

/** 強い方を採る（同じ強さなら先に渡した方）。 */
function strongerSide(a: BorderSide | undefined, b: BorderSide | undefined): BorderSide | undefined {
  if (!a) return b;
  if (!b) return a;
  return lineStyleOf(b).weight > lineStyleOf(a).weight ? b : a;
}

// --- 描画オブジェクト ---------------------------------------------------------------------

interface AnchorPoint {
  col: number;
  row: number;
  colOffPx: number;
  rowOffPx: number;
}

interface DrawingObject {
  ordinal: number;
  kind: 'twoCellAnchor' | 'oneCellAnchor' | 'absoluteAnchor' | 'alternate';
  from?: AnchorPoint;
  to?: AnchorPoint;
  pos?: { x: number; y: number };
  ext?: { w: number; h: number };
  /** 中身（sp, cxnSp, pic, grpSp, graphicFrame, contentPart）。 */
  content?: XmlNode;
}

function anchorPoint(node: XmlNode | undefined): AnchorPoint | undefined {
  if (!node) return undefined;
  const col = Number(child(node, 'col')?.text.trim());
  const row = Number(child(node, 'row')?.text.trim());
  if (!Number.isFinite(col) || !Number.isFinite(row)) return undefined;
  return {
    col: Math.max(0, Math.min(MAX_COLS - 1, col)),
    row: Math.max(0, Math.min(MAX_ROWS - 1, row)),
    colOffPx: (Number(child(node, 'colOff')?.text.trim()) || 0) / EMU_PER_PX,
    rowOffPx: (Number(child(node, 'rowOff')?.text.trim()) || 0) / EMU_PER_PX,
  };
}

const CONTENT_NAMES = ['sp', 'cxnSp', 'pic', 'grpSp', 'graphicFrame', 'contentPart'];

function readAnchors(root: XmlNode, limit: number): { objects: DrawingObject[]; truncated: boolean } {
  const objects: DrawingObject[] = [];
  let truncated = false;
  const visit = (node: XmlNode, alternate: boolean): void => {
    for (const item of node.children) {
      if (objects.length >= limit) {
        truncated = true;
        return;
      }
      if (item.name === 'AlternateContent') {
        const choice = child(item, 'Choice') ?? child(item, 'Fallback');
        if (choice) visit(choice, true);
        continue;
      }
      if (item.name !== 'twoCellAnchor' && item.name !== 'oneCellAnchor' && item.name !== 'absoluteAnchor') continue;
      const ext = child(item, 'ext');
      const pos = child(item, 'pos');
      objects.push({
        ordinal: objects.length + 1,
        kind: alternate ? 'alternate' : item.name,
        from: anchorPoint(child(item, 'from')),
        to: anchorPoint(child(item, 'to')),
        ...(pos ? { pos: { x: (Number(attr(pos, 'x')) || 0) / EMU_PER_PX, y: (Number(attr(pos, 'y')) || 0) / EMU_PER_PX } } : {}),
        ...(ext ? { ext: { w: (Number(attr(ext, 'cx')) || 0) / EMU_PER_PX, h: (Number(attr(ext, 'cy')) || 0) / EMU_PER_PX } } : {}),
        content: item.children.find((c) => CONTENT_NAMES.includes(c.name)),
      });
    }
  };
  visit(root, false);
  return { objects, truncated };
}

/** シート全体の座標（画素）での図形の箱。 */
function objectBox(object: DrawingObject, cols: Axis, rows: Axis): Box | undefined {
  const at = (p: AnchorPoint): { x: number; y: number } => ({
    x: cols.start(p.col) + Math.min(p.colOffPx, cols.size(p.col)),
    y: rows.start(p.row) + Math.min(p.rowOffPx, rows.size(p.row)),
  });
  if (object.from && object.to) {
    const a = at(object.from);
    const b = at(object.to);
    return { x: a.x, y: a.y, w: Math.max(0, b.x - a.x), h: Math.max(0, b.y - a.y) };
  }
  if (object.from && object.ext) {
    const a = at(object.from);
    return { x: a.x, y: a.y, w: object.ext.w, h: object.ext.h };
  }
  if (object.pos && object.ext) return { x: object.pos.x, y: object.pos.y, w: object.ext.w, h: object.ext.h };
  return undefined;
}

function boxCells(box: Box, cols: Axis, rows: Axis): CellRect {
  return {
    startCol: cols.indexAt(box.x),
    startRow: rows.indexAt(box.y),
    endCol: cols.indexAt(Math.max(box.x, box.x + box.w - 0.01)),
    endRow: rows.indexAt(Math.max(box.y, box.y + box.h - 0.01)),
  };
}

function imageFormat(bytes: Buffer): 'png' | 'jpeg' | 'gif' | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';
  return undefined;
}

function otherImageFormat(bytes: Buffer, part: string): string {
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return 'tiff';
  if (bytes.length >= 44 && bytes.readUInt32LE(40) === 0x464d4520) return 'emf';
  if (bytes[0] === 0xd7 && bytes[1] === 0xcd && bytes[2] === 0xc6 && bytes[3] === 0x9a) return 'wmf';
  return part.split('.').pop()?.toLowerCase() ?? 'unknown';
}

const DASH_PATTERNS: Record<string, number[]> = {
  dot: [1, 1], sysDot: [1, 1], dash: [4, 3], sysDash: [3, 1], lgDash: [8, 3],
  dashDot: [4, 3, 1, 3], sysDashDot: [3, 1, 1, 1], lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

/** テーマの線のスタイル（lnRef idx）の既定幅（EMU）。Office 2013 以降の既定値。 */
const THEME_LINE_WIDTH = [0, 6350, 12700, 19050];

interface ShapeLook {
  fill?: DrawingColor;
  stroke?: DrawingColor;
  strokeWidth: number;
  dash?: string;
  headEnd?: { type: string; w: string; len: string };
  tailEnd?: { type: string; w: string; len: string };
  fontColor?: DrawingColor;
  /** 線なし（`<a:ln><a:noFill/>`）が明示されている。 */
  strokeNone?: boolean;
}

function shapeLook(ctx: Context, content: XmlNode, palette: Palette, at: string): ShapeLook {
  const spPr = child(content, 'spPr');
  const style = child(content, 'style');
  const lnRef = child(style, 'lnRef');
  const fillRef = child(style, 'fillRef');
  const fontRef = child(style, 'fontRef');
  const look: ShapeLook = { strokeWidth: 0 };

  // 塗り
  const styleFill = fillRef && Number(attr(fillRef, 'idx') ?? 0) > 0 ? drawingColor(fillRef, palette) : undefined;
  if (child(spPr, 'noFill')) look.fill = undefined;
  else if (child(spPr, 'solidFill')) look.fill = drawingColor(child(spPr, 'solidFill'), palette, styleFill);
  else if (child(spPr, 'gradFill')) {
    const stop = descendants(child(spPr, 'gradFill'), 'gs')[0];
    look.fill = drawingColor(stop, palette, styleFill);
    note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'shape-gradient', '図形のグラデーションは最初の色の単色で描きました');
  } else if (child(spPr, 'pattFill')) {
    look.fill = drawingColor(child(child(spPr, 'pattFill'), 'fgClr'), palette, styleFill);
    note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'shape-pattern', '図形の模様塗りは前景色の単色で描きました');
  } else if (child(spPr, 'blipFill')) {
    note(ctx, 'MMI_SNAPSHOT_UNSUPPORTED_FORMAT', 'shape-picture-fill', `図形の画像塗りは描いていません（${at}）`);
  } else if (fillRef) {
    look.fill = styleFill;
    if (Number(attr(fillRef, 'idx') ?? 0) >= 2) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'theme-fill', 'テーマの塗り（グラデーション等）は単色で描きました');
  }

  // 線
  const ln = child(spPr, 'ln');
  const styleStroke = lnRef && Number(attr(lnRef, 'idx') ?? 0) > 0 ? drawingColor(lnRef, palette) : undefined;
  const lnRefWidth = lnRef ? THEME_LINE_WIDTH[Number(attr(lnRef, 'idx') ?? 0)] ?? 12700 : 0;
  const widthEmu = attr(ln, 'w') !== undefined ? Number(attr(ln, 'w')) : lnRefWidth;
  if (child(ln, 'noFill')) {
    look.stroke = undefined;
    look.strokeNone = true;
  } else if (child(ln, 'solidFill')) look.stroke = drawingColor(child(ln, 'solidFill'), palette, styleStroke);
  else if (child(ln, 'gradFill')) look.stroke = drawingColor(descendants(child(ln, 'gradFill'), 'gs')[0], palette, styleStroke);
  else look.stroke = styleStroke;
  if (look.stroke) {
    look.strokeWidth = Math.max(1, (Number.isFinite(widthEmu) ? widthEmu : 9525) / EMU_PER_PX);
    const preset = attr(child(ln, 'prstDash'), 'val');
    const pattern = preset ? DASH_PATTERNS[preset] : undefined;
    if (pattern) look.dash = pattern.map((v) => num(v * look.strokeWidth)).join(' ');
    if (child(ln, 'custDash')) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'custom-dash', '図形の独自の破線は実線で描きました');
  }
  const end = (name: string) => {
    const node = child(ln, name);
    const type = attr(node, 'type');
    return node && type && type !== 'none' ? { type, w: attr(node, 'w') ?? 'med', len: attr(node, 'len') ?? 'med' } : undefined;
  };
  look.headEnd = end('headEnd');
  look.tailEnd = end('tailEnd');
  look.fontColor = fontRef ? drawingColor(fontRef, palette) : undefined;
  return look;
}

function paintAttributes(look: ShapeLook, forceNoFill = false): string {
  const fill = !forceNoFill && look.fill ? `fill="${look.fill.hex}"${look.fill.alpha < 1 ? ` fill-opacity="${num(look.fill.alpha)}"` : ''}` : 'fill="none"';
  const stroke = look.stroke
    ? ` stroke="${look.stroke.hex}" stroke-width="${num(look.strokeWidth)}"${look.stroke.alpha < 1 ? ` stroke-opacity="${num(look.stroke.alpha)}"` : ''}${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}`
    : '';
  return `${fill}${stroke}`;
}

type Point = [number, number];

const pointsAttr = (points: Point[]): string => points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');

function adjust(content: XmlNode, name: string, fallback: number): number {
  const gd = childrenNamed(child(child(content, 'spPr'), 'prstGeom', 'avLst'), 'gd').find((item) => attr(item, 'name') === name);
  const match = /^val\s+(-?\d+)/u.exec(attr(gd, 'fmla') ?? '');
  return match ? Number(match[1]) : fallback;
}

/** 矢印の先端（type: triangle/stealth/arrow/oval/diamond）。 */
function arrowHead(tip: Point, from: Point, end: { type: string; w: string; len: string }, look: ShapeLook): string {
  const color = look.stroke?.hex ?? '#000000';
  const scale = (value: string) => (value === 'sm' ? 2 : value === 'lg' ? 5 : 3);
  const width = Math.max(6, look.strokeWidth * scale(end.w));
  const length = Math.max(6, look.strokeWidth * scale(end.len));
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const base: Point = [tip[0] - ux * length, tip[1] - uy * length];
  const left: Point = [base[0] - uy * (width / 2), base[1] + ux * (width / 2)];
  const right: Point = [base[0] + uy * (width / 2), base[1] - ux * (width / 2)];
  switch (end.type) {
    case 'oval':
      return `<ellipse cx="${num(tip[0])}" cy="${num(tip[1])}" rx="${num(width / 2)}" ry="${num(width / 2)}" fill="${color}"/>`;
    case 'diamond': {
      const back: Point = [tip[0] - ux * length * 2, tip[1] - uy * length * 2];
      return `<polygon points="${pointsAttr([tip, left, back, right])}" fill="${color}"/>`;
    }
    case 'arrow':
      return `<polyline points="${pointsAttr([left, tip, right])}" fill="none" stroke="${color}" stroke-width="${num(look.strokeWidth)}"/>`;
    case 'stealth': {
      const notch: Point = [tip[0] - ux * length * 0.6, tip[1] - uy * length * 0.6];
      return `<polygon points="${pointsAttr([tip, left, notch, right])}" fill="${color}"/>`;
    }
    default:
      return `<polygon points="${pointsAttr([tip, left, right])}" fill="${color}"/>`;
  }
}

interface ParagraphRun {
  text: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: DrawingColor;
}

interface Paragraph {
  align: string;
  runs: ParagraphRun[];
  endSizePt?: number;
}

function readParagraphs(txBody: XmlNode | undefined, palette: Palette): Paragraph[] {
  return childrenNamed(txBody, 'p').map((p) => {
    const runs: ParagraphRun[] = [];
    for (const item of p.children) {
      if (item.name === 'r' || item.name === 'fld') {
        const rPr = child(item, 'rPr');
        const sz = Number(attr(rPr, 'sz'));
        const flag = (name: string) => {
          const value = attr(rPr, name);
          return value === '1' || value === 'true';
        };
        const u = attr(rPr, 'u');
        runs.push({
          text: child(item, 't')?.text ?? '',
          ...(Number.isFinite(sz) && sz > 0 ? { sizePt: sz / 100 } : {}),
          bold: flag('b'),
          italic: flag('i'),
          underline: u !== undefined && u !== 'none',
          strike: attr(rPr, 'strike') !== undefined && attr(rPr, 'strike') !== 'noStrike',
          ...(drawingColor(child(rPr, 'solidFill'), palette) ? { color: drawingColor(child(rPr, 'solidFill'), palette) } : {}),
        });
      } else if (item.name === 'br') runs.push({ text: '\n' });
    }
    const endSz = Number(attr(child(p, 'endParaRPr'), 'sz'));
    return { align: attr(child(p, 'pPr'), 'algn') ?? 'l', runs, ...(Number.isFinite(endSz) && endSz > 0 ? { endSizePt: endSz / 100 } : {}) };
  });
}

/** 図形の中の文字。段落ごとに最初の文字列の書式で描く。 */
function shapeText(ctx: Context, content: XmlNode, box: Box, look: ShapeLook, palette: Palette): string {
  const txBody = child(content, 'txBody');
  const paragraphs = readParagraphs(txBody, palette);
  if (!paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) return '';
  const bodyPr = child(txBody, 'bodyPr');
  const inset = (name: string, fallback: number) => {
    const value = Number(attr(bodyPr, name));
    return (Number.isFinite(value) ? value : fallback) / EMU_PER_PX;
  };
  const left = inset('lIns', 91440);
  const right = inset('rIns', 91440);
  const top = inset('tIns', 45720);
  const bottom = inset('bIns', 45720);
  const wrap = attr(bodyPr, 'wrap') !== 'none';
  const vert = attr(bodyPr, 'vert');
  if (vert && vert !== 'horz') note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'vertical-text', '図形の縦書きは横書きで描きました');
  const innerWidth = Math.max(1, box.w - left - right);
  const blocks: { lines: string[]; style: TextStyle; align: string; lineHeight: number }[] = [];
  for (const p of paragraphs) {
    const first = p.runs.find((r) => r.text.trim()) ?? p.runs[0];
    if (p.runs.some((r) => r.text.trim() && (r.sizePt !== first?.sizePt || r.bold !== first?.bold || r.color?.hex !== first?.color?.hex))) {
      note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'mixed-run-format', '図形の段落内で書式が異なる文字列は、最初の書式で描きました');
    }
    const sizePt = first?.sizePt ?? p.endSizePt ?? 11;
    const fontPx = (sizePt * 96) / 72;
    const text = p.runs.map((r) => r.text).join('');
    const lines = wrap ? wrapLines(text, innerWidth, fontPx) : text.split('\n');
    blocks.push({
      lines,
      align: p.align,
      lineHeight: fontPx * 1.2,
      style: {
        fontPx,
        color: first?.color?.hex ?? look.fontColor?.hex ?? '#000000',
        ...(first?.color && first.color.alpha < 1 ? { alpha: first.color.alpha } : {}),
        bold: Boolean(first?.bold),
        italic: Boolean(first?.italic),
        underline: Boolean(first?.underline),
        strike: Boolean(first?.strike),
      },
    });
  }
  const total = blocks.reduce((sum, b) => sum + b.lines.length * b.lineHeight, 0);
  const anchor = attr(bodyPr, 'anchor') ?? 't';
  let y = anchor === 'ctr' ? box.y + top + (box.h - top - bottom - total) / 2 : anchor === 'b' ? box.y + box.h - bottom - total : box.y + top;
  const out: string[] = [];
  for (const block of blocks) {
    const align = block.align === 'ctr' || block.align === 'dist' ? 'middle' : block.align === 'r' ? 'end' : 'start';
    const x = align === 'middle' ? box.x + left + innerWidth / 2 : align === 'end' ? box.x + box.w - right : box.x + left;
    if (block.lines.some((line) => line.trim())) out.push(textElement(block.lines, x, y + block.lineHeight / 2, block.lineHeight, align, block.style));
    y += block.lines.length * block.lineHeight;
  }
  return out.join('');
}

const SUPPORTED_PRESETS = new Set([
  'rect', 'roundRect', 'ellipse', 'line', 'straightConnector1', 'bentConnector2', 'bentConnector3',
  'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'triangle', 'rtTriangle', 'diamond',
  'flowChartProcess', 'flowChartDecision', 'flowChartTerminator', 'flowChartAlternateProcess', 'flowChartConnector',
]);

const LINE_PRESETS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3']);

function blockArrow(prst: string, w: number, h: number, content: XmlNode): Point[] {
  const horizontal = prst === 'rightArrow' || prst === 'leftArrow';
  const ss = Math.min(w, h);
  const a1 = Math.max(0, Math.min(100000, adjust(content, 'adj1', 50000))) / 100000;
  const a2 = Math.max(0, adjust(content, 'adj2', 50000)) / 100000;
  if (horizontal) {
    const head = Math.min(w, ss * a2);
    const s1 = h / 2 - (h * a1) / 2;
    const s2 = h / 2 + (h * a1) / 2;
    const pts: Point[] = [[0, s1], [w - head, s1], [w - head, 0], [w, h / 2], [w - head, h], [w - head, s2], [0, s2]];
    return prst === 'rightArrow' ? pts : pts.map(([x, y]) => [w - x, y]);
  }
  const head = Math.min(h, ss * a2);
  const s1 = w / 2 - (w * a1) / 2;
  const s2 = w / 2 + (w * a1) / 2;
  const pts: Point[] = [[s1, 0], [s1, h - head], [0, h - head], [w / 2, h], [w, h - head], [s2, h - head], [s2, 0]];
  return prst === 'downArrow' ? pts : pts.map(([x, y]) => [x, h - y]);
}

/** 対応する図形を SVG にする。対応しないときは undefined。 */
function renderShape(ctx: Context, content: XmlNode, box: Box, palette: Palette, at: string): string | undefined {
  const spPr = child(content, 'spPr');
  const geometry = child(spPr, 'prstGeom');
  const prst = attr(geometry, 'prst');
  if (!prst || !SUPPORTED_PRESETS.has(prst)) return undefined;
  const look = shapeLook(ctx, content, palette, at);
  const xfrm = child(spPr, 'xfrm');
  const rot = (Number(attr(xfrm, 'rot') ?? 0) || 0) / 60000;
  const flipH = attr(xfrm, 'flipH') === '1' || attr(xfrm, 'flipH') === 'true';
  const flipV = attr(xfrm, 'flipV') === '1' || attr(xfrm, 'flipV') === 'true';
  const { x, y, w, h } = box;
  const map = ([px, py]: Point): Point => [x + (flipH ? w - px : px), y + (flipV ? h - py : py)];
  let body: string;
  if (LINE_PRESETS.has(prst)) {
    let local: Point[];
    if (prst === 'bentConnector2') local = [[0, 0], [w, 0], [w, h]];
    else if (prst === 'bentConnector3') {
      const mid = (w * adjust(content, 'adj1', 50000)) / 100000;
      local = [[0, 0], [mid, 0], [mid, h], [w, h]];
    } else local = [[0, 0], [w, h]];
    const points = local.map(map);
    if (look.strokeNone) return '';
    const lineLook = look.stroke ? look : { ...look, stroke: { hex: '#000000', alpha: 1 }, strokeWidth: 1 };
    if (!look.stroke) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'line-without-stroke', '線の色が指定されていない線は黒の細線で描きました');
    body = points.length === 2
      ? `<line x1="${num(points[0][0])}" y1="${num(points[0][1])}" x2="${num(points[1][0])}" y2="${num(points[1][1])}" ${paintAttributes(lineLook, true)}/>`
      : `<polyline points="${pointsAttr(points)}" ${paintAttributes(lineLook, true)}/>`;
    if (lineLook.headEnd) body += arrowHead(points[0], points[1], lineLook.headEnd, lineLook);
    if (lineLook.tailEnd) body += arrowHead(points[points.length - 1], points[points.length - 2], lineLook.tailEnd, lineLook);
  } else {
    const paint = paintAttributes(look);
    switch (prst) {
      case 'rect':
      case 'flowChartProcess':
        body = `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${paint}/>`;
        break;
      case 'roundRect':
      case 'flowChartAlternateProcess':
      case 'flowChartTerminator': {
        const r = prst === 'flowChartTerminator' ? Math.min(w, h) / 2 : (Math.min(w, h) * Math.max(0, Math.min(50000, adjust(content, 'adj', 16667)))) / 100000;
        body = `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(r)}" ry="${num(r)}" ${paint}/>`;
        break;
      }
      case 'ellipse':
      case 'flowChartConnector':
        body = `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" ${paint}/>`;
        break;
      case 'triangle': {
        const apex = (w * Math.max(0, Math.min(100000, adjust(content, 'adj', 50000)))) / 100000;
        body = `<polygon points="${pointsAttr(([[apex, 0], [w, h], [0, h]] as Point[]).map(map))}" ${paint}/>`;
        break;
      }
      case 'rtTriangle':
        body = `<polygon points="${pointsAttr(([[0, 0], [w, h], [0, h]] as Point[]).map(map))}" ${paint}/>`;
        break;
      case 'diamond':
      case 'flowChartDecision':
        body = `<polygon points="${pointsAttr(([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]] as Point[]).map(map))}" ${paint}/>`;
        break;
      default:
        body = `<polygon points="${pointsAttr(blockArrow(prst, w, h, content).map(map))}" ${paint}/>`;
    }
    body += shapeText(ctx, content, box, look, palette);
  }
  if (rot) return `<g transform="rotate(${num(rot)} ${num(x + w / 2)} ${num(y + h / 2)})">${body}</g>`;
  return body;
}

function placeholder(box: Box, label: string): string {
  const fontPx = Math.max(8, Math.min(12, box.h / 2));
  return `<g data-mmi-unsupported="${escapeXml(label)}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(Math.max(1, box.w))}" height="${num(Math.max(1, box.h))}" fill="#F2F2F2" fill-opacity="0.6" stroke="#808080" stroke-width="1" stroke-dasharray="4 2"/>${box.w > 20 && box.h > 10 ? `<text x="${num(box.x + 4)}" y="${num(box.y + Math.min(box.h / 2, fontPx))}" dominant-baseline="central" font-size="${num(fontPx)}" fill="#606060">${escapeXml(`未対応: ${label}`)}</text>` : ''}</g>`;
}

interface DrawingContext {
  ctx: Context;
  palette: Palette;
  mediaRels: Map<string, Relationship>;
  part: string;
  embeddedBytes: number;
}

function graphicKind(content: XmlNode): string {
  const uri = attr(child(content, 'graphic', 'graphicData'), 'uri') ?? '';
  if (/\/chart$/u.test(uri) || /chartex/iu.test(uri)) return 'chart';
  if (/\/diagram$/u.test(uri)) return 'smartart';
  return 'graphic-frame';
}

function renderPicture(dc: DrawingContext, content: XmlNode, box: Box, at: string): string {
  const { ctx } = dc;
  const blip = descendants(child(content, 'blipFill'), 'blip')[0];
  const embed = attr(blip, 'embed');
  const link = attr(blip, 'link');
  const name = attr(child(content, 'nvPicPr', 'cNvPr'), 'name') ?? 'picture';
  if (!embed) {
    ctx.diagnostics.push({ code: link ? 'MMI_SNAPSHOT_UNSUPPORTED_IMAGE' : 'MMI_SNAPSHOT_MEDIA_MISSING', severity: 'warning', sheet: ctx.sheet, part: dc.part, kind: link ? 'external-link' : 'no-reference', at, message: link ? `画像「${name}」は外部ファイルへのリンクで、埋め込まれていません` : `画像「${name}」に画像の参照がありません` });
    return placeholder(box, link ? '外部リンク画像' : '画像');
  }
  const rel = dc.mediaRels.get(embed);
  const entry = rel && !rel.external ? ctx.zip.get(rel.target) : undefined;
  let bytes: Buffer | undefined;
  try {
    bytes = entry?.read();
  } catch {
    bytes = undefined;
  }
  if (!rel || !bytes) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_MEDIA_MISSING', severity: 'warning', sheet: ctx.sheet, part: rel?.target ?? embed, kind: 'media', at, message: `画像「${name}」の部品 ${rel?.target ?? embed} を読めません` });
    return placeholder(box, '画像');
  }
  const format = imageFormat(bytes);
  if (!format) {
    const other = otherImageFormat(bytes, rel.target);
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_IMAGE', severity: 'warning', sheet: ctx.sheet, part: rel.target, kind: other, at, message: `画像「${name}」は ${other} 形式で、SVGへ埋め込めません（PNG・JPEG・GIFのみ）` });
    return placeholder(box, `${other}画像`);
  }
  if (dc.embeddedBytes + bytes.length > ctx.limits.maxEmbeddedImageBytes) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_LIMIT_EXCEEDED', severity: 'warning', sheet: ctx.sheet, part: rel.target, kind: 'embedded-images', at, message: `埋め込む画像の合計が上限 ${ctx.limits.maxEmbeddedImageBytes} バイトを超えるため、画像「${name}」を枠だけにしました` });
    return placeholder(box, '画像（上限超過）');
  }
  dc.embeddedBytes += bytes.length;
  const href = `data:image/${format};base64,${bytes.toString('base64')}`;
  const xfrm = child(child(content, 'spPr'), 'xfrm');
  const rot = (Number(attr(xfrm, 'rot') ?? 0) || 0) / 60000;
  const flipH = attr(xfrm, 'flipH') === '1' || attr(xfrm, 'flipH') === 'true';
  const flipV = attr(xfrm, 'flipV') === '1' || attr(xfrm, 'flipV') === 'true';
  const src = child(child(content, 'blipFill'), 'srcRect');
  const crop = (side: string) => (Number(attr(src, side) ?? 0) || 0) / 100000;
  const [l, t, r, b] = [crop('l'), crop('t'), crop('r'), crop('b')];
  let element: string;
  if (src && (l || t || r || b) && l + r < 1 && t + b < 1) {
    const fullW = box.w / (1 - l - r);
    const fullH = box.h / (1 - t - b);
    element = `<svg x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" overflow="hidden"><image x="${num(-l * fullW)}" y="${num(-t * fullH)}" width="${num(fullW)}" height="${num(fullH)}" preserveAspectRatio="none" xlink:href="${href}"/></svg>`;
  } else {
    element = `<image x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" preserveAspectRatio="none" xlink:href="${href}"/>`;
  }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const transforms = [
    rot ? `rotate(${num(rot)} ${num(cx)} ${num(cy)})` : '',
    flipH || flipV ? `translate(${num(cx)} ${num(cy)}) scale(${flipH ? -1 : 1} ${flipV ? -1 : 1}) translate(${num(-cx)} ${num(-cy)})` : '',
  ].filter(Boolean);
  return transforms.length ? `<g transform="${transforms.join(' ')}">${element}</g>` : element;
}

function renderDrawingObject(dc: DrawingContext, object: DrawingObject, box: Box, at: string): string {
  const { ctx } = dc;
  const unsupported = (kind: string, label: string, message: string): string => {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE', severity: 'warning', sheet: ctx.sheet, part: dc.part, kind, at, message });
    return placeholder(box, label);
  };
  const content = object.content;
  if (object.kind === 'alternate') {
    return unsupported('alternate-content', '代替表現の図形', `代替表現（mc:AlternateContent）の描画オブジェクトは描いていません（${at}）`);
  }
  if (!content) return unsupported('empty-anchor', '不明な図形', `中身の分からない描画オブジェクトがあります（${at}）`);
  const name = attr(child(content, content.name === 'pic' ? 'nvPicPr' : content.name === 'cxnSp' ? 'nvCxnSpPr' : content.name === 'grpSp' ? 'nvGrpSpPr' : content.name === 'graphicFrame' ? 'nvGraphicFramePr' : 'nvSpPr', 'cNvPr'), 'name');
  const label = name ? `「${name}」` : '';
  switch (content.name) {
    case 'pic':
      return renderPicture(dc, content, box, at);
    case 'sp':
    case 'cxnSp': {
      const rendered = renderShape(ctx, content, box, dc.palette, at);
      if (rendered !== undefined) return rendered;
      const spPr = child(content, 'spPr');
      const prst = attr(child(spPr, 'prstGeom'), 'prst');
      const kind = prst ? `prst:${prst}` : child(spPr, 'custGeom') ? 'custGeom' : 'unknown-geometry';
      return unsupported(kind, prst ?? (kind === 'custGeom' ? 'フリーフォーム' : '図形'), `図形${label}（${kind}）は描画に対応していません（${at}）`);
    }
    case 'grpSp':
      return unsupported('group', 'グループ化図形', `グループ化図形${label}は描画に対応していません（${at}）`);
    case 'graphicFrame': {
      const kind = graphicKind(content);
      return unsupported(kind, kind === 'chart' ? 'グラフ' : kind === 'smartart' ? 'SmartArt' : 'オブジェクト', `${kind === 'chart' ? 'グラフ' : kind === 'smartart' ? 'SmartArt' : 'グラフィックフレーム'}${label}は描画に対応していません（${at}）`);
    }
    default:
      return unsupported(content.name, content.name, `描画オブジェクト ${content.name}${label} は描画に対応していません（${at}）`);
  }
}

// --- 本体 ----------------------------------------------------------------------------

export function renderSheetSvg(input: RenderSheetSvgInput): RenderSheetSvgResult {
  const identity = createSourceIdentityFromBytes(input.bytes);
  const result: RenderSheetSvgResult = { diagnostics: [], renderer: MMI_SNAPSHOT_RENDERER, sourceDigest: identity.digest, sheet: input.sheet };
  const limits = { ...DEFAULT_SNAPSHOT_LIMITS, ...input.limits };
  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(input.bytes);
  } catch (error) {
    const unsupported = error instanceof ZipError && error.code !== 'not-a-zip';
    result.diagnostics.push({
      code: unsupported ? 'MMI_SNAPSHOT_PACKAGE_UNSUPPORTED' : 'MMI_SNAPSHOT_NOT_A_PACKAGE',
      severity: 'error',
      message: `xlsx（ZIPパッケージ）として読めません: ${error instanceof Error ? error.message : String(error)}`,
    });
    return result;
  }
  const ctx: Context = {
    zip,
    limits,
    xmlLimits: { maxElements: limits.maxXmlElements, maxDepth: 256 },
    diagnostics: result.diagnostics,
    sheet: input.sheet,
    notes: new Map(),
  };
  try {
    return renderInto(ctx, input, result);
  } catch (error) {
    if (error instanceof SnapshotFailure) {
      result.diagnostics.push(error.diagnostic);
      delete result.svg;
      return result;
    }
    throw error;
  }
}

function renderInto(ctx: Context, input: RenderSheetSvgInput, result: RenderSheetSvgResult): RenderSheetSvgResult {
  const { zip, limits } = ctx;
  if (!zip.has('xl/workbook.xml')) {
    throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_NOT_A_PACKAGE', severity: 'error', message: 'xl/workbook.xml がありません（xlsx / xlsm ではありません）' });
  }
  const workbook = readPart(ctx, 'xl/workbook.xml', true) as XmlNode;
  const workbookRels = new Map(relsOf(ctx, 'xl/workbook.xml').map((rel) => [rel.id, rel]));
  const sheets = descendants(workbook, 'sheet').map((node) => ({ name: attr(node, 'name') ?? '', rel: workbookRels.get(attr(node, 'id') ?? '') }));
  const sheet = sheets.find((item) => item.name === input.sheet);
  if (!sheet || !sheet.rel) {
    throw new SnapshotFailure({
      code: 'MMI_SNAPSHOT_SHEET_NOT_FOUND',
      severity: 'error',
      sheet: input.sheet,
      message: `シート「${input.sheet}」がありません（あるシート: ${sheets.map((item) => `「${item.name}」`).join('、') || 'なし'}）`,
    });
  }
  if (!sheet.rel.type.endsWith('/worksheet')) {
    throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_PACKAGE_UNSUPPORTED', severity: 'error', sheet: input.sheet, message: `「${input.sheet}」はワークシートではありません（${sheet.rel.type.split('/').pop()}）` });
  }
  const sheetPart = sheet.rel.target;

  const theme = readTheme(ctx);
  const styles = readStyles(ctx, theme);
  const sharedStrings = readSharedStrings(ctx);
  const model = readSheet(ctx, sheetPart, styles, sharedStrings);

  // 表示文字列は既存の読み込み（SheetJS の表示書式）に揃える。読めなければ生の値を使う。
  let display: ((row: number, col: number) => { text: string; type: SourceCellType } | undefined) | undefined;
  try {
    const source = loadWorkbookFromBytes('snapshot.xlsx', Buffer.from(input.bytes)).sheets[input.sheet];
    if (source) display = (row, col) => source.cellAt(row, col);
  } catch (error) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_APPROXIMATED', severity: 'info', sheet: input.sheet, message: `表示書式を解釈できないため、セルの生の値を描きます: ${error instanceof Error ? error.message : String(error)}` });
  }

  const cols = new Axis((i) => {
    const item = model.cols.get(i);
    if (item?.hidden) return 0;
    return item?.widthPx ?? model.defaultColPx;
  }, MAX_COLS);
  const rows = new Axis((i) => {
    const item = model.rows.get(i);
    if (item?.hidden) return 0;
    return item?.heightPx ?? model.defaultRowPx;
  }, MAX_ROWS);

  // 描画オブジェクト
  const drawingRel = model.drawingRelId ? relsOf(ctx, sheetPart).find((rel) => rel.id === model.drawingRelId) : undefined;
  let objects: DrawingObject[] = [];
  let drawingPart: string | undefined;
  if (drawingRel && !drawingRel.external) {
    drawingPart = drawingRel.target;
    const root = readPart(ctx, drawingRel.target, false);
    if (root) {
      const read = readAnchors(root, limits.maxDrawingObjects);
      objects = read.objects;
      if (read.truncated) ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_LIMIT_EXCEEDED', severity: 'warning', sheet: input.sheet, part: drawingRel.target, kind: 'drawing-objects', message: `描画オブジェクトが ${limits.maxDrawingObjects} 個を超えるため、以降を描いていません` });
    } else if (!ctx.zip.has(drawingRel.target)) {
      ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_PART_UNREADABLE', severity: 'warning', sheet: input.sheet, part: drawingRel.target, message: `描画の部品 ${drawingRel.target} がありません。図形・画像は描いていません` });
    }
  }
  if (model.hasLegacyDrawing) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE', severity: 'warning', sheet: input.sheet, kind: 'vml', message: 'VMLの描画（コメント、フォームコントロール等）は描いていません' });
  }
  if (model.conditionalFormats > 0) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_FORMAT', severity: 'warning', sheet: input.sheet, kind: 'conditional-formatting', count: model.conditionalFormats, message: `条件付き書式（${model.conditionalFormats}件${model.dataBarsOrIcons ? '、データバー・アイコン・カラースケールを含む' : ''}）は反映していません` });
  }

  if (model.tableParts > 0) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_FORMAT', severity: 'warning', sheet: input.sheet, kind: 'table-style', count: model.tableParts, message: `テーブル（${model.tableParts}件）のテーブルスタイル（縞模様・見出しの書式・フィルターボタン）は反映していません。セルに直接付けた書式だけを描きます` });
  }
  if (model.sparklines > 0) {
    ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_FORMAT', severity: 'warning', sheet: input.sheet, kind: 'sparkline', count: model.sparklines, message: `スパークライン（${model.sparklines}グループ）は描いていません` });
  }

  // 範囲
  let range: CellRect;
  if (input.range !== undefined) {
    const parsed = parseA1Range(input.range);
    if (!parsed) throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_INVALID_RANGE', severity: 'error', sheet: input.sheet, message: `範囲「${input.range}」はA1形式（例: A1:F20）ではありません` });
    range = parsed;
  } else {
    let bounds: CellRect | undefined;
    const grow = (rect: CellRect) => {
      bounds = bounds
        ? { startRow: Math.min(bounds.startRow, rect.startRow), startCol: Math.min(bounds.startCol, rect.startCol), endRow: Math.max(bounds.endRow, rect.endRow), endCol: Math.max(bounds.endCol, rect.endCol) }
        : { ...rect };
    };
    for (const [key, cell] of model.cells) {
      if ((cell.value !== undefined && cell.value !== '') || cell.style !== 0) {
        const row = Math.floor(key / MAX_COLS);
        const col = key % MAX_COLS;
        grow({ startRow: row, startCol: col, endRow: row, endCol: col });
      }
    }
    for (const merge of model.merges) grow(merge);
    for (const object of objects) {
      const box = objectBox(object, cols, rows);
      if (box) grow(boxCells(box, cols, rows));
    }
    if (!bounds) {
      ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_EMPTY_SHEET', severity: 'info', sheet: input.sheet, message: `シート「${input.sheet}」は空です。A1だけを描きます` });
      bounds = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
    }
    range = bounds;
  }
  const area = (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
  if (area > limits.maxRangeCells) {
    throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_RANGE_TOO_LARGE', severity: 'error', sheet: input.sheet, at: rectA1(range), message: `範囲 ${rectA1(range)} は ${area} セルで、上限 ${limits.maxRangeCells} セルを超えています。--range で狭めてください` });
  }
  const originX = cols.start(range.startCol);
  const originY = rows.start(range.startRow);
  const width = cols.start(range.endCol + 1) - originX;
  const height = rows.start(range.endRow + 1) - originY;
  if (width <= 0 || height <= 0) {
    throw new SnapshotFailure({ code: 'MMI_SNAPSHOT_INVALID_RANGE', severity: 'error', sheet: input.sheet, at: rectA1(range), message: `範囲 ${rectA1(range)} の行または列がすべて非表示で、描くものがありません` });
  }
  result.range = rectA1(range);
  result.width = width;
  result.height = height;

  // セルの書式と値
  const styleAt = (row: number, col: number): CellFormat => {
    const cell = model.cells.get(cellKey(row, col));
    const index = cell ? cell.style : model.rows.get(row)?.style ?? model.cols.get(col)?.style ?? 0;
    return styles.formats[index] ?? styles.formats[0];
  };
  const valueAt = (row: number, col: number): { text: string; type: SourceCellType | string } | undefined => {
    const shown = display?.(row, col);
    if (shown) return shown.text === '' ? undefined : shown;
    const cell = model.cells.get(cellKey(row, col));
    if (cell?.value === undefined || cell.value === '') return undefined;
    return { text: cell.value, type: cell.type === 's' || cell.type === 'inlineStr' || cell.type === 'str' ? 's' : cell.type ?? 'n' };
  };

  // 結合: 左上のセル → 範囲。覆われるセル → 左上。
  const mergeAt = new Map<number, CellRect>();
  for (const merge of model.merges) {
    if (merge.endRow < range.startRow || merge.startRow > range.endRow || merge.endCol < range.startCol || merge.startCol > range.endCol) continue;
    const r0 = Math.max(merge.startRow, range.startRow - 1);
    const r1 = Math.min(merge.endRow, range.endRow + 1);
    const c0 = Math.max(merge.startCol, range.startCol - 1);
    const c1 = Math.min(merge.endCol, range.endCol + 1);
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) mergeAt.set(cellKey(r, c), merge);
  }
  const sameMerge = (r1: number, c1: number, r2: number, c2: number): boolean => {
    const a = mergeAt.get(cellKey(r1, c1));
    return a !== undefined && a === mergeAt.get(cellKey(r2, c2));
  };
  const cellBox = (rect: CellRect): Box => ({
    x: cols.start(rect.startCol) - originX,
    y: rows.start(rect.startRow) - originY,
    w: cols.start(rect.endCol + 1) - cols.start(rect.startCol),
    h: rows.start(rect.endRow + 1) - rows.start(rect.startRow),
  });

  // 書式の未対応・近似を数える
  const formatNotes = (format: CellFormat, at: string) => {
    if (format.fill.pattern) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'fill-pattern', `模様の塗りつぶしは前景色と背景色を混ぜた単色で描きました（例: ${at}）`);
    if (format.fill.gradient) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'fill-gradient', `グラデーションの塗りつぶしは最初の色の単色で描きました（例: ${at}）`);
  };

  // --- 塗り（行ごとに同じ色を1つの矩形にまとめる。結合は1つの矩形） ---
  const fills: string[] = [];
  const drawnMerges = new Set<CellRect>();
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    if (rows.size(r) === 0) continue;
    let run: { start: number; end: number; color: string } | undefined;
    const flush = () => {
      if (!run) return;
      const box = cellBox({ startRow: r, endRow: r, startCol: run.start, endCol: run.end });
      fills.push(`<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="${run.color}"/>`);
      run = undefined;
    };
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const merge = mergeAt.get(cellKey(r, c));
      if (merge) {
        flush();
        if (!drawnMerges.has(merge)) {
          drawnMerges.add(merge);
          const format = styleAt(merge.startRow, merge.startCol);
          formatNotes(format, rectA1(merge));
          const box = cellBox({
            startRow: Math.max(merge.startRow, range.startRow),
            startCol: Math.max(merge.startCol, range.startCol),
            endRow: Math.min(merge.endRow, range.endRow),
            endCol: Math.min(merge.endCol, range.endCol),
          });
          const color = format.fill.color ?? (model.showGridLines ? '#FFFFFF' : undefined);
          // 塗りの無い結合は、内側の枠線だけを隠す（右端・下端の枠線は残す）。
          const inset = format.fill.color ? 0 : 1;
          if (color && box.w > 0 && box.h > 0) fills.push(`<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(Math.max(0, box.w - inset))}" height="${num(Math.max(0, box.h - inset))}" fill="${color}" data-mmi-merge="${rectA1(merge)}"/>`);
        }
        continue;
      }
      if (cols.size(c) === 0) continue;
      const format = styleAt(r, c);
      const color = format.fill.color;
      if (color) formatNotes(format, cellA1(r, c));
      if (run && color === run.color) run.end = c;
      else {
        flush();
        if (color) run = { start: c, end: c, color };
      }
    }
    flush();
  }

  // --- 枠線（シートの表示設定に従う） ---
  let gridlines = '';
  if (model.showGridLines) {
    const segments: string[] = [];
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      if (cols.size(c) === 0) continue;
      const x = cols.start(c + 1) - originX - 0.5;
      segments.push(`M${num(x)} 0V${num(height)}`);
    }
    for (let r = range.startRow; r <= range.endRow; r += 1) {
      if (rows.size(r) === 0) continue;
      const y = rows.start(r + 1) - originY - 0.5;
      segments.push(`M0 ${num(y)}H${num(width)}`);
    }
    gridlines = `<path d="${segments.join('')}" fill="none" stroke="#D9D9D9" stroke-width="1"/>`;
  }

  // --- 罫線（隣り合うセルの境界を1本として描く） ---
  const edgeGroups = new Map<string, { side: BorderSide; segments: string[] }>();
  const addSegment = (side: BorderSide, horizontal: boolean, fixed: number, from: number, to: number) => {
    const style = lineStyleOf(side);
    const key = `${side.style}|${side.color}`;
    const group = edgeGroups.get(key) ?? { side, segments: [] };
    edgeGroups.set(key, group);
    const offsets = style.double ? [-1, 1] : [0];
    for (const offset of offsets) {
      const limit = horizontal ? height : width;
      const pos = Math.max(style.width / 2, Math.min(limit - style.width / 2, fixed - (style.width % 2 === 1 ? 0.5 : 0) + offset));
      group.segments.push(horizontal ? `M${num(from)} ${num(pos)}H${num(to)}` : `M${num(pos)} ${num(from)}V${num(to)}`);
    }
  };
  // 横の境界: 行 r の上端（直前の表示行の下と r の上）。非表示の行は境界を作らない。
  let aboveRow = range.startRow - 1;
  for (let r = range.startRow; r <= range.endRow + 1; r += 1) {
    if (r <= range.endRow && rows.size(r) === 0) continue;
    const y = rows.start(r) - originY;
    const upper = aboveRow;
    aboveRow = r;
    let run: { side: BorderSide; key: string; from: number; to: number } | undefined;
    const flush = () => {
      if (run) addSegment(run.side, true, y, run.from, run.to);
      run = undefined;
    };
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const w = cols.size(c);
      if (w === 0) continue;
      // 境界の上のセルの下罫線と、下のセルの上罫線のうち強い方を1本だけ描く。
      let side: BorderSide | undefined;
      if (!(upper >= 0 && sameMerge(upper, c, r, c))) {
        const above = upper >= 0 ? styleAt(upper, c).border.bottom : undefined;
        const below = r < MAX_ROWS ? styleAt(r, c).border.top : undefined;
        side = strongerSide(below, above);
      }
      const x0 = cols.start(c) - originX;
      const key = side ? `${side.style}|${side.color}` : '';
      if (side && run && run.key === key && Math.abs(run.to - x0) < 0.001) run.to = x0 + w;
      else {
        flush();
        if (side) run = { side, key, from: x0, to: x0 + w };
      }
    }
    flush();
  }
  // 縦の境界: 列 c の左端（直前の表示列の右と c の左）。
  let leftCol = range.startCol - 1;
  for (let c = range.startCol; c <= range.endCol + 1; c += 1) {
    if (c <= range.endCol && cols.size(c) === 0) continue;
    const x = cols.start(c) - originX;
    const previous = leftCol;
    leftCol = c;
    let run: { side: BorderSide; key: string; from: number; to: number } | undefined;
    const flush = () => {
      if (run) addSegment(run.side, false, x, run.from, run.to);
      run = undefined;
    };
    for (let r = range.startRow; r <= range.endRow; r += 1) {
      const h = rows.size(r);
      if (h === 0) continue;
      let side: BorderSide | undefined;
      if (!(previous >= 0 && sameMerge(r, previous, r, c))) {
        const left = previous >= 0 ? styleAt(r, previous).border.right : undefined;
        const right = c < MAX_COLS ? styleAt(r, c).border.left : undefined;
        side = strongerSide(right, left);
      }
      const y0 = rows.start(r) - originY;
      const key = side ? `${side.style}|${side.color}` : '';
      if (side && run && run.key === key && Math.abs(run.to - y0) < 0.001) run.to = y0 + h;
      else {
        flush();
        if (side) run = { side, key, from: y0, to: y0 + h };
      }
    }
    flush();
  }
  // 斜線
  const diagonals: string[] = [];
  const seenDiagonal = new Set<CellRect | number>();
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const merge = mergeAt.get(cellKey(r, c));
      const owner = merge ?? cellKey(r, c);
      if (seenDiagonal.has(owner)) continue;
      seenDiagonal.add(owner);
      const format = merge ? styleAt(merge.startRow, merge.startCol) : styleAt(r, c);
      const diagonal = format.border.diagonal;
      if (!diagonal || (!format.border.diagonalUp && !format.border.diagonalDown)) continue;
      const box = cellBox(merge ?? { startRow: r, startCol: c, endRow: r, endCol: c });
      const style = lineStyleOf(diagonal);
      const paint = `stroke="${diagonal.color}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}`;
      if (format.border.diagonalDown) diagonals.push(`<line x1="${num(box.x)}" y1="${num(box.y)}" x2="${num(box.x + box.w)}" y2="${num(box.y + box.h)}" ${paint}/>`);
      if (format.border.diagonalUp) diagonals.push(`<line x1="${num(box.x)}" y1="${num(box.y + box.h)}" x2="${num(box.x + box.w)}" y2="${num(box.y)}" ${paint}/>`);
    }
  }
  const borderPaths = [...edgeGroups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, group]) => {
      const style = lineStyleOf(group.side);
      return `<path d="${group.segments.join('')}" fill="none" stroke="${group.side.color}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''} data-mmi-border="${escapeXml(group.side.style)}"/>`;
    });

  // --- 文字 ---
  const clips: string[] = [];
  const texts: string[] = [];
  const isEmpty = (row: number, col: number): boolean => !valueAt(row, col) && !mergeAt.has(cellKey(row, col));
  const textOwners = new Set<CellRect | number>();
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    if (rows.size(r) === 0) continue;
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const merge = mergeAt.get(cellKey(r, c));
      const owner = merge ?? cellKey(r, c);
      if (textOwners.has(owner)) continue;
      textOwners.add(owner);
      const row = merge ? merge.startRow : r;
      const col = merge ? merge.startCol : c;
      if (!merge && cols.size(c) === 0) continue;
      const value = valueAt(row, col);
      if (!value) continue;
      const format = styleAt(row, col);
      const at = cellA1(row, col);
      if (format.rotation) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'text-rotation', `文字の回転・縦書きは横書きで描きました（例: ${at}）`);
      if (format.shrink) note(ctx, 'MMI_SNAPSHOT_APPROXIMATED', 'shrink-to-fit', `「縮小して全体を表示」は反映せず、元の大きさで描きました（例: ${at}）`);
      const box = cellBox(merge ?? { startRow: r, startCol: c, endRow: r, endCol: c });
      if (box.w <= 0 || box.h <= 0) continue;
      const fontPx = (format.font.sizePt * 96) / 72;
      const lineHeight = fontPx * 1.25;
      const numeric = value.type === 'n' || value.type === 'd';
      let horizontal = format.horizontal;
      if (horizontal === 'general') horizontal = numeric ? 'right' : value.type === 'b' || value.type === 'e' ? 'center' : 'left';
      if (horizontal === 'fill' || horizontal === 'justify') horizontal = 'left';
      if (horizontal === 'centerContinuous' || horizontal === 'distributed') horizontal = 'center';
      const indentPx = format.indent * fontPx * 0.75;
      const pad = 2;
      const lines = format.wrap ? wrapLines(value.text, Math.max(1, box.w - pad * 2 - indentPx), fontPx) : [value.text.replace(/\r\n|\r|\n/gu, '')];
      const anchor = horizontal === 'right' ? 'end' : horizontal === 'center' ? 'middle' : 'start';
      const x = anchor === 'end' ? box.x + box.w - pad - indentPx : anchor === 'middle' ? box.x + box.w / 2 : box.x + pad + indentPx;
      const blockHeight = lines.length * lineHeight;
      const vertical = format.vertical;
      const firstCenter = vertical === 'top'
        ? box.y + pad + lineHeight / 2
        : vertical === 'center' || vertical === 'justify' || vertical === 'distributed'
          ? box.y + (box.h - blockHeight) / 2 + lineHeight / 2
          : box.y + box.h - pad - blockHeight + lineHeight / 2;
      // はみ出し: 折り返し・結合・数値はセル内で切る。文字列は空いた隣のセルへはみ出す。
      let clip: Box = box;
      const widest = Math.max(...lines.map((line) => textWidth(line, fontPx)));
      if (!format.wrap && !merge && !numeric) {
        let left = c;
        let right = c;
        if (anchor !== 'end') while (right < range.endCol && isEmpty(r, right + 1)) right += 1;
        if (anchor !== 'start') while (left > range.startCol && isEmpty(r, left - 1)) left -= 1;
        clip = cellBox({ startRow: r, endRow: r, startCol: left, endCol: right });
      }
      const [textLeft, textRight] = anchor === 'start' ? [x, x + widest] : anchor === 'end' ? [x - widest, x] : [x - widest / 2, x + widest / 2];
      const needsClip = textLeft < clip.x - 0.01
        || textRight > clip.x + clip.w + 0.01
        // 縦は字面（フォントの大きさ）で判定する。行の高さいっぱいの文字まで切らない。
        || firstCenter - fontPx / 2 < box.y - 1
        || firstCenter + (lines.length - 1) * lineHeight + fontPx / 2 > box.y + box.h + 1;
      let clipId: string | undefined;
      if (needsClip) {
        clipId = `mmi-clip-${clips.length + 1}`;
        clips.push(`<clipPath id="${clipId}"><rect x="${num(clip.x)}" y="${num(clip.y)}" width="${num(clip.w)}" height="${num(clip.h)}"/></clipPath>`);
      }
      texts.push(textElement(lines, x, firstCenter, lineHeight, anchor, {
        fontPx,
        color: format.font.color,
        bold: format.font.bold,
        italic: format.font.italic,
        underline: format.font.underline,
        strike: format.font.strike,
      }, clipId));
    }
  }

  // --- 描画オブジェクト ---
  const drawings: string[] = [];
  if (objects.length > 0 && drawingPart) {
    const dc: DrawingContext = {
      ctx,
      palette: styles.palette,
      mediaRels: new Map(relsOf(ctx, drawingPart).map((rel) => [rel.id, rel])),
      part: drawingPart,
      embeddedBytes: 0,
    };
    for (const object of objects) {
      const sheetBox = objectBox(object, cols, rows);
      if (!sheetBox) {
        ctx.diagnostics.push({ code: 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE', severity: 'warning', sheet: input.sheet, part: drawingPart, kind: 'unknown-anchor', message: `位置の分からない描画オブジェクト（${object.ordinal}番目）は描いていません` });
        continue;
      }
      const box: Box = { x: sheetBox.x - originX, y: sheetBox.y - originY, w: sheetBox.w, h: sheetBox.h };
      // 線は幅・高さが0になり得るので、境界を含めて判定する。
      const outside = box.x >= width || box.y >= height
        || box.x + box.w < 0 || box.y + box.h < 0
        || (box.w > 0 && box.x + box.w <= 0) || (box.h > 0 && box.y + box.h <= 0);
      if (outside) continue;
      const at = rectA1(boxCells(sheetBox, cols, rows));
      drawings.push(renderDrawingObject(dc, object, box, at));
    }
  }

  ctx.diagnostics.push(...ctx.notes.values());

  const metadata = [
    `renderer="${MMI_SNAPSHOT_RENDERER}"`,
    `source-digest="${escapeXml(result.sourceDigest)}"`,
    `source-bytes="${input.bytes.byteLength}"`,
    ...(input.sourceLabel ? [`source="${escapeXml(input.sourceLabel)}"`] : []),
    `sheet="${escapeXml(input.sheet)}"`,
    `range="${result.range}"`,
    `gridlines="${model.showGridLines ? 'shown' : 'hidden'}"`,
    `diagnostics="${ctx.diagnostics.length}"`,
  ].join(' ');
  const layer = (name: string, body: string[] | string, extra = ''): string => {
    const content = Array.isArray(body) ? body.join('') : body;
    return content ? `<g data-mmi-layer="${name}"${extra}>${content}</g>` : '';
  };
  result.svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">`,
    `<title>${escapeXml(`${input.sheet}!${result.range}`)}</title>`,
    `<metadata><mmi:snapshot xmlns:mmi="urn:mmi:sheet-snapshot:1" ${metadata}/></metadata>`,
    clips.length ? `<defs>${clips.join('')}</defs>` : '',
    `<rect data-mmi-layer="background" x="0" y="0" width="${num(width)}" height="${num(height)}" fill="#FFFFFF"/>`,
    layer('gridlines', gridlines, ' shape-rendering="crispEdges"'),
    layer('fills', fills, ' shape-rendering="crispEdges"'),
    layer('borders', [...borderPaths, ...diagonals], ' shape-rendering="crispEdges"'),
    layer('cells', texts, ` font-family="${SNAPSHOT_FONT_FAMILY}"`),
    layer('drawings', drawings, ` font-family="${SNAPSHOT_FONT_FAMILY}"`),
    '</svg>',
  ].filter(Boolean).join('\n') + '\n';
  return result;
}
