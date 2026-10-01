/**
 * Import candidates for existing Excel design documents
 * (02_Architecture/import-assistance.md, ADR-0019 D7 優先度2).
 *
 * Given a sheet, find the blocks a person must decide about when moving a
 * design document into Markdown -- tables worth referencing, key/value
 * frames, prose, headings, stamp boxes, diagrams -- and, for each table,
 * propose an MMI v1 reference that shows it as a table. Excel 方眼紙 is the
 * motivating layout: every logical cell is a horizontal merge, so a table of
 * seven columns occupies thirty physical ones. The proposal picks each
 * merge's anchor column with `columns=` instead of inventing notation.
 *
 * Division of authority (ADR-0018):
 * - The block role (`table`, `key-value`, ...) is a candidate with reasons,
 *   produced by structural heuristics. It decides nothing.
 * - A reference proposal is only offered after the real pipeline
 *   (`parseEmbedSyntax` → Smart Fallback → `buildLogicalTable`) renders it
 *   and the result equals what the analysis read off the sheet.
 * - Every non-empty cell the proposal cannot show is reported as a caution
 *   with its address. Nothing is dropped silently.
 *
 * Merges come from the workbook's own `!merges`; nothing is inferred from
 * blank cells. The source is never written.
 */
import { buildLogicalTable } from '../core/renderTable.js';
import type { CellRange, SheetSource } from '../core/sheetSource.js';
import { getSmartFallbackDecisionAfterLoad } from '../core/smartFallback.js';
import { cellRangeToA1, indexToColumn } from '../core/tableGeometry.js';
import type { WorkbookData } from '../core/workbookLoader.js';
import { parseEmbedSyntax } from '../parser/embedSyntax.js';
import type { WorkbookStructure } from './workbookStructure.js';

export type BlockRole = 'table' | 'key-value' | 'prose' | 'heading' | 'form' | 'diagram' | 'unknown';

export type RoleReason =
  | 'header-and-aligned-body'
  | 'alternating-labels'
  | 'value-in-first-row'
  | 'single-cell-rows'
  | 'sentence-text'
  | 'bullet-text'
  | 'numbered-heading'
  | 'short-single-cell'
  | 'empty-frame-below-labels'
  | 'arrow-glyphs'
  | 'no-body-rows'
  | 'excel-table';

export type CautionCode =
  | 'vertical-merge'
  | 'off-anchor-value'
  | 'full-width-row'
  | 'multi-row-header'
  | 'wide-table'
  | 'large-table'
  | 'blank-row'
  | 'header-not-found'
  | 'revalidation-mismatch'
  | 'truncated-scan'
  | 'hidden-rows'
  | 'hidden-columns'
  | 'totals-row-excluded';

export interface ImportCaution {
  code: CautionCode;
  message: string;
  /** Physical cells the caution is about, in A1. */
  cells?: string[];
}

export interface LogicalColumn {
  /** Column whose cell carries the value (the merge anchor). */
  anchor: number;
  letter: string;
  startCol: number;
  endCol: number;
  header: string;
}

export interface ReferenceProposal {
  /** A complete `![[...]]` reference, already re-checked against the renderer. */
  reference: string;
  range: string;
  params: Record<string, string>;
  renderMode: 'table' | 'card';
  /** The logical table the renderer produced for `reference` (first rows only). */
  preview: { headers?: string[]; rows: string[][]; totalRows: number };
}

export interface ImportCandidate {
  sheet: string;
  role: BlockRole;
  reasons: RoleReason[];
  /** Block extent; for tables the header row through the last body row. */
  range: CellRange;
  a1: string;
  /** Heading directly above (tables) or the heading text itself. */
  title?: string;
  titleA1?: string;
  /** First texts of the block, for listing non-table blocks without copying them in full. */
  excerpt: string[];
  /** Labels of a key/value frame or a form (the cells a template repeats). */
  labels?: string[];
  /** Defined names whose range is exactly this block. */
  names?: string[];
  /** Name of the Excel table (ListObject) this candidate comes from. */
  excelTable?: string;
  columns?: LogicalColumn[];
  proposal?: ReferenceProposal;
  cautions: ImportCaution[];
}

export interface ImportAnalysisOptions {
  /** Path written into proposals (relative to the Markdown document). Omit to skip proposals. */
  referencePath?: string;
  /** Workbook the sheet belongs to; required for proposals, which are re-checked by rendering. */
  workbook?: WorkbookData;
  maxScanCells?: number;
  previewRows?: number;
  /**
   * What the workbook declares (workbookStructure.ts). Excel tables become
   * table candidates as declared; names and hidden rows/columns annotate them.
   */
  structure?: WorkbookStructure;
}

const DEFAULT_MAX_SCAN_CELLS = 1_000_000;
const DEFAULT_PREVIEW_ROWS = 5;
/** Smart Fallback's thresholds (spec §7), applied to the table the reader actually sees. */
const MAX_LOGICAL_COLUMNS_FOR_TABLE = 10;
const MAX_LOGICAL_CELLS_FOR_TABLE = 500;

/** One logical cell: a merge anchored here, or a plain cell. */
interface LogicalCell {
  row: number;
  col: number;
  endRow: number;
  endCol: number;
  text: string;
}

interface Block {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface SheetView {
  sheet: SheetSource;
  /** Logical cells anchored on each row (merge anchors and plain cells with text). */
  rows: Map<number, LogicalCell[]>;
  /** Rows covered by a vertical merge anchored on an earlier row. */
  continuation: Set<number>;
  truncated: boolean;
}

export function analyzeSheetForImport(sheetName: string, sheet: SheetSource, options: ImportAnalysisOptions = {}): ImportCandidate[] {
  const view = buildView(sheet, options.maxScanCells ?? DEFAULT_MAX_SCAN_CELLS);
  if (!view) return [];
  const segmented: ImportCandidate[] = [];
  for (const block of findBlocks(view)) {
    segmented.push(...mergeDrawings(segmentBlock(sheetName, view, block)));
  }
  const detected = joinContinuations(segmented.sort((a, b) => a.range.startRow - b.range.startRow || a.range.startCol - b.range.startCol));
  const candidates = withDeclaredTables(sheetName, sheet, detected, options.structure);
  attachTitles(candidates);
  attachNames(sheetName, candidates, options.structure);
  const sheetStructure = options.structure?.sheets.find((entry) => entry.name === sheetName);
  for (const candidate of candidates) {
    if (candidate.role !== 'table') continue;
    if (view.truncated) {
      candidate.cautions.push({ code: 'truncated-scan', message: 'シートが大きいため途中までしか調べていません。' });
    }
    if (sheetStructure) cautionHidden(candidate, sheetStructure);
    if (options.referencePath && options.workbook) {
      proposeReference(candidate, view, options.referencePath, options.workbook, options.previewRows ?? DEFAULT_PREVIEW_ROWS);
    }
  }
  return candidates.sort((a, b) => a.range.startRow - b.range.startRow || a.range.startCol - b.range.startCol);
}

// ---------------------------------------------------------------------------
// Logical view of the sheet
// ---------------------------------------------------------------------------

function buildView(sheet: SheetSource, maxScanCells: number): SheetView | undefined {
  const used = sheet.usedRange;
  if (!used) return undefined;
  const width = used.endCol - used.startCol + 1;
  const lastRow = Math.min(used.endRow, used.startRow + Math.max(1, Math.floor(maxScanCells / Math.max(1, width))) - 1);

  const anchors = new Map<string, CellRange>();
  const covered = new Set<string>();
  const continuation = new Set<number>();
  for (const merge of sheet.merges) {
    if (merge.startRow > lastRow) continue;
    anchors.set(`${merge.startRow}:${merge.startCol}`, merge);
    for (let row = merge.startRow; row <= merge.endRow; row += 1) {
      if (row > merge.startRow) continuation.add(row);
      for (let col = merge.startCol; col <= merge.endCol; col += 1) {
        if (row !== merge.startRow || col !== merge.startCol) covered.add(`${row}:${col}`);
      }
    }
  }

  const rows = new Map<number, LogicalCell[]>();
  for (let row = used.startRow; row <= lastRow; row += 1) {
    const cells: LogicalCell[] = [];
    for (let col = used.startCol; col <= used.endCol; col += 1) {
      const key = `${row}:${col}`;
      if (covered.has(key)) continue;
      const merge = anchors.get(key);
      const text = sheet.cellAt(row, col)?.text.trim() ?? '';
      if (!merge && text === '') continue;
      cells.push({ row, col, endRow: merge?.endRow ?? row, endCol: merge?.endCol ?? col, text });
    }
    if (cells.length > 0) rows.set(row, cells);
  }
  return { sheet, rows, continuation, truncated: lastRow < used.endRow };
}

/** Bands of rows separated by empty rows, split at columns empty across the band. */
function findBlocks(view: SheetView): Block[] {
  const occupied = new Map<number, Set<number>>();
  const mark = (row: number, col: number): void => {
    let cols = occupied.get(row);
    if (!cols) occupied.set(row, (cols = new Set()));
    cols.add(col);
  };
  for (const cells of view.rows.values()) {
    for (const cell of cells) {
      for (let row = cell.row; row <= cell.endRow; row += 1) {
        for (let col = cell.col; col <= cell.endCol; col += 1) mark(row, col);
      }
    }
  }

  const rows = [...occupied.keys()].sort((a, b) => a - b);
  const bands: number[][] = [];
  for (const row of rows) {
    const band = bands[bands.length - 1];
    if (band && row === band[band.length - 1] + 1) band.push(row);
    else bands.push([row]);
  }

  const blocks: Block[] = [];
  for (const band of bands) {
    const cols = [...new Set(band.flatMap((row) => [...(occupied.get(row) ?? [])]))].sort((a, b) => a - b);
    let start = cols[0];
    for (let i = 1; i <= cols.length; i += 1) {
      if (i < cols.length && cols[i] === cols[i - 1] + 1) continue;
      const left = start;
      const right = cols[i - 1];
      const inBlock = band.filter((row) => [...(occupied.get(row) ?? [])].some((col) => col >= left && col <= right));
      blocks.push({ top: inBlock[0], bottom: inBlock[inBlock.length - 1], left, right });
      start = cols[i];
    }
  }
  return blocks;
}

function cellsIn(view: SheetView, row: number, block: Block): LogicalCell[] {
  return (view.rows.get(row) ?? []).filter((cell) => cell.col >= block.left && cell.col <= block.right);
}

function textCells(cells: readonly LogicalCell[]): LogicalCell[] {
  return cells.filter((cell) => cell.text !== '');
}

// ---------------------------------------------------------------------------
// Text shape
// ---------------------------------------------------------------------------

const DATE = /^\d{4}[/.\-年]\d{1,2}(?:[/.\-月]\d{1,2}日?)?$/;
const NUMBER = /^[+-]?[\d,]*\d(?:\.\d+)?%?$/;
const TIME = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const ARROWS = /^[→←↑↓⇒⇐⇑⇓▶◀▲▼]+$/;
const BULLET = /^[・\-－*＊※●○■□◆◇]/;
/** A note line under a table. Not ○/□/- alone: those are common cell values. */
const NOTE = /^(?:[・※＊*●■◆]\s*\S|[-－]\s+\S|(?:注|備考|補足)\s*[:：)）\d])/;
const NUMBERED = /^(?:\d+(?:[.．]\d+)*[.．、)）]?\s*\S|第.+[章節]|[【［[].+[】］\]]$|[■□◆◇●]\s*\S)/;
const LABEL_SUFFIX =
  /(?:名|者|日|日付|日時|番号|No\.?|ID|区分|コード|版|版数|対象|説明|概要|システム|所属|部署|部門|担当|件名|種別|目的|ページ|頁|承認|確認|作成|更新)$/i;

function isValueLike(text: string): boolean {
  return DATE.test(text) || NUMBER.test(text) || TIME.test(text);
}

function isSentence(text: string): boolean {
  return /[。．]/.test(text) || text.length > 40;
}

function isLabelLike(text: string): boolean {
  return text.length <= 12 && !isValueLike(text) && !isSentence(text) && LABEL_SUFFIX.test(text);
}

// ---------------------------------------------------------------------------
// Segmentation of one block into candidates
// ---------------------------------------------------------------------------

function segmentBlock(sheetName: string, view: SheetView, block: Block): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  const width = block.right - block.left + 1;
  // Boxes and arrows drawn with cells: every lone cell of that block is part of the drawing.
  const drawing = range(block.top, block.bottom).some((r) => textCells(cellsIn(view, r, block)).some((cell) => ARROWS.test(cell.text)));
  let row = block.top;
  while (row <= block.bottom) {
    const cells = cellsIn(view, row, block);
    const texts = textCells(cells);
    if (texts.length === 0) {
      row += 1;
      continue;
    }

    if (texts.length === 1) {
      const [cell] = texts;
      const text = cell.text;
      if (drawing) {
        out.push(candidate(sheetName, 'diagram', ['arrow-glyphs'], { startRow: row, startCol: cell.col, endRow: cell.endRow, endCol: cell.endCol }, [text]));
        row = cell.endRow + 1;
        continue;
      }
      if (isSentence(text) || BULLET.test(text)) {
        // Consecutive single-cell sentence/bullet rows form one prose block.
        let end = cell.endRow;
        const lines = [text];
        while (end + 1 <= block.bottom) {
          const next = textCells(cellsIn(view, end + 1, block));
          if (next.length !== 1 || !(isSentence(next[0].text) || BULLET.test(next[0].text))) break;
          lines.push(next[0].text);
          end = next[0].endRow;
        }
        const reasons: RoleReason[] = [lines.some((line) => BULLET.test(line)) ? 'bullet-text' : 'sentence-text', 'single-cell-rows'];
        out.push(candidate(sheetName, 'prose', reasons, { startRow: row, startCol: block.left, endRow: end, endCol: block.right }, lines));
        row = end + 1;
        continue;
      }
      // A lone number or date (0.1, 2026/09/27) is a value, not a heading -- even though "0.1" looks numbered.
      if (isValueLike(text)) {
        out.push(candidate(sheetName, 'unknown', ['short-single-cell'], { startRow: row, startCol: cell.col, endRow: cell.endRow, endCol: cell.endCol }, [text]));
        row = cell.endRow + 1;
        continue;
      }
      const reasons: RoleReason[] = [NUMBERED.test(text) ? 'numbered-heading' : 'short-single-cell'];
      out.push(candidate(sheetName, 'heading', reasons, { startRow: row, startCol: cell.col, endRow: cell.endRow, endCol: cell.endCol }, [text]));
      row = cell.endRow + 1;
      continue;
    }

    const consumed = readMultiCellRun(sheetName, view, block, row, width);
    out.push(consumed.candidate);
    row = consumed.nextRow;
  }
  return out;
}

interface RunResult {
  candidate: ImportCandidate;
  nextRow: number;
}

/** A row with two or more text cells: a table, a key/value frame, a form or a diagram. */
function readMultiCellRun(sheetName: string, view: SheetView, block: Block, top: number, blockWidth: number): RunResult {
  const headerCells = cellsIn(view, top, block);
  const headerTexts = textCells(headerCells);
  const headerEnd = Math.max(...headerCells.map((cell) => cell.endRow));
  const { columns, multiRow, tallRows } = tableColumns(view, block, top, headerCells);
  const tableLeft = columns[0].startCol;
  const tableRight = columns[columns.length - 1].endCol;
  const tableWidth = tableRight - tableLeft + 1;

  if (headerTexts.some((cell) => ARROWS.test(cell.text))) {
    const end = lastRowTouching(view, block, top, headerEnd);
    return {
      candidate: candidate(sheetName, 'diagram', ['arrow-glyphs'], { startRow: top, startCol: block.left, endRow: end, endCol: block.right }, texts(view, block, top, end)),
      nextRow: end + 1,
    };
  }

  // Body rows: aligned multi-cell rows, wide single-cell section rows followed
  // by more aligned rows, vertical-merge continuation rows and empty frames.
  const body: number[] = [];
  const offAnchor: string[] = [];
  const sectionRows: number[] = [];
  // A header merged two or more rows tall leaves physical rows that render empty.
  const continuationRows: number[] = [...tallRows];
  body.push(...tallRows);
  const anchors = new Set(columns.map((column) => column.anchor));
  // Per column of the body so far: how many cells are filled and how many are values.
  const columnTypes = new Map<number, { filled: number; values: number }>();
  let row = headerEnd + 1;
  while (row <= block.bottom) {
    const cells = cellsIn(view, row, block);
    const rowTexts = textCells(cells);
    if (rowTexts.length === 0) {
      if (view.continuation.has(row) && body.length > 0) continuationRows.push(row);
      body.push(row);
      row += 1;
      continue;
    }
    // A note under the table (※…, ・…, 注…) is not a body row, whatever its width.
    if (rowTexts.length === 1 && NOTE.test(rowTexts[0].text)) break;
    if (rowTexts.length === 1 && rowTexts[0].endCol - rowTexts[0].col + 1 >= Math.max(2, Math.ceil(tableWidth * 0.6))) {
      // A numbered heading, or a line followed by a new header, starts the next section.
      if (NUMBERED.test(rowTexts[0].text)) break;
      const next = nextTextRow(view, block, rowTexts[0].endRow + 1);
      if (next === undefined) break;
      const nextTexts = textCells(cellsIn(view, next, block));
      if (!isAligned(nextTexts, anchors) || breaksColumnTypes(columnTypes, nextTexts)) break;
      sectionRows.push(row);
      body.push(row);
      row = rowTexts[0].endRow + 1;
      continue;
    }
    if (rowTexts.length === 1 && isSentence(rowTexts[0].text) && !anchors.has(rowTexts[0].col)) break;
    if (!isAligned(rowTexts, anchors)) break;
    if (breaksColumnTypes(columnTypes, rowTexts)) break;
    for (const cell of rowTexts) {
      if (!anchors.has(cell.col)) offAnchor.push(cellRangeToA1({ startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col }));
      const types = columnTypes.get(cell.col) ?? { filled: 0, values: 0 };
      types.filled += 1;
      if (isValueLike(cell.text)) types.values += 1;
      columnTypes.set(cell.col, types);
    }
    body.push(row);
    const tallest = Math.max(...cells.map((cell) => cell.endRow));
    for (let extra = row + 1; extra <= tallest; extra += 1) {
      continuationRows.push(extra);
      body.push(extra);
    }
    row = tallest + 1;
  }
  // Trailing rows without text (empty frames to be filled in later) are not part of the table.
  while (body.length > 0 && textCells(cellsIn(view, body[body.length - 1], block)).length === 0) body.pop();
  const bodyWithText = body.filter((r) => textCells(cellsIn(view, r, block)).length > 0);

  const end = body.length > 0 ? body[body.length - 1] : headerEnd;
  const extent: CellRange = { startRow: top, startCol: tableLeft, endRow: end, endCol: tableRight };
  const excerpt = texts(view, block, top, end);

  if (bodyWithText.length === 0) {
    const frameBelow = cellsIn(view, headerEnd + 1, block).length > 0;
    const role: BlockRole = frameBelow ? 'form' : 'unknown';
    const frameEnd = frameBelow ? lastRowTouching(view, block, headerEnd + 1, headerEnd + 1) : headerEnd;
    return {
      candidate: { ...candidate(sheetName, role, [frameBelow ? 'empty-frame-below-labels' : 'no-body-rows'], { ...extent, endRow: frameEnd }, excerpt), labels: headerTexts.map((cell) => cell.text) },
      nextRow: Math.max(frameEnd, headerEnd) + 1,
    };
  }

  const kv = keyValueReasons(view, block, top, end);
  if (kv) {
    const labels = range(top, end).flatMap((r) => textCells(cellsIn(view, r, block)).filter((_, i) => i % 2 === 0).map((cell) => cell.text));
    return { candidate: { ...candidate(sheetName, 'key-value', kv, extent, excerpt), labels }, nextRow: end + 1 };
  }

  const cautions: ImportCaution[] = [];
  const headerOk =
    headerTexts.length >= Math.max(2, Math.ceil(columns.length * 0.6)) &&
    !headerTexts.some((cell) => isSentence(cell.text)) &&
    (!headerTexts.some((cell) => isValueLike(cell.text)) || isOrdinalHeader(headerTexts));
  if (!headerOk) {
    cautions.push({ code: 'header-not-found', message: '先頭行を見出しと判断できません。見出しなしで表示します。' });
  }
  if (multiRow) {
    cautions.push({
      code: 'multi-row-header',
      message: '見出しが2段以上です。MMI記法の見出しは1行のため、下段の見出しは本文の1行目として表示されます。',
      cells: [cellRangeToA1({ startRow: top, startCol: tableLeft, endRow: headerEnd + 1, endCol: tableRight })],
    });
  }
  if (continuationRows.length > 0) {
    cautions.push({
      code: 'vertical-merge',
      message: `縦に結合したセルがあるため、${continuationRows.map((r) => r + 1).join('・')}行目が空に近い行として表示されます。`,
      cells: continuationRows.map((r) => `${r + 1}`),
    });
  }
  if (sectionRows.length > 0) {
    cautions.push({
      code: 'full-width-row',
      message: `表の途中に横長の区切り行があります（${sectionRows.map((r) => r + 1).join('・')}行目）。先頭列の値として表示されます。`,
      cells: sectionRows.map((r) => cellRangeToA1({ startRow: r, startCol: tableLeft, endRow: r, endCol: tableLeft })),
    });
  }
  if (offAnchor.length > 0) {
    cautions.push({
      code: 'off-anchor-value',
      message: `見出しの列に揃っていないセルがあり、その値は表示されません（${offAnchor.join('、')}）。原本の結合を見出しに合わせるか、範囲を見直してください。`,
      cells: offAnchor,
    });
  }
  if (columns.length > MAX_LOGICAL_COLUMNS_FOR_TABLE) {
    cautions.push({ code: 'wide-table', message: `論理列が${columns.length}列あり、表ではなく別紙（カード）として表示されます。` });
  }

  return {
    candidate: {
      ...candidate(sheetName, 'table', ['header-and-aligned-body'], extent, excerpt),
      columns: headerOk ? columns : columns.map((column) => ({ ...column, header: '' })),
      cautions,
    },
    nextRow: end + 1,
  };
}

/**
 * Logical columns of a table whose header starts on `top`: one per header
 * cell, except that a wide header cell with two or more labels directly
 * below it (a two-row header) is split into those lower labels. Physical
 * columns no header cell covers become unnamed columns, so a plain table
 * with a blank header cell keeps every column.
 */
function tableColumns(
  view: SheetView,
  block: Block,
  top: number,
  headerCells: readonly LogicalCell[],
): { columns: LogicalColumn[]; multiRow: boolean; tallRows: number[] } {
  const below = textCells(cellsIn(view, top + 1, block));
  const headerEnd = Math.max(...headerCells.map((cell) => cell.endRow));
  // Every header cell merged down to the same row, with nothing written under
  // them, is one tall header row -- not a two-level header.
  const tall =
    headerEnd > top &&
    headerCells.every((cell) => cell.endRow === headerEnd) &&
    range(top + 1, headerEnd).every((r) => textCells(cellsIn(view, r, block)).length === 0);
  const tallRows = tall ? range(top + 1, headerEnd) : [];
  let multiRow = !tall && headerCells.some((cell) => cell.endRow > top);
  const spans: { start: number; end: number; header: string }[] = [];
  for (const cell of headerCells) {
    const subs = cell.endCol > cell.col ? below.filter((other) => other.col >= cell.col && other.endCol <= cell.endCol) : [];
    if (cell.endRow === top && subs.length >= 2) {
      multiRow = true;
      for (const sub of subs) spans.push({ start: sub.col, end: sub.endCol, header: `${cell.text}/${sub.text}` });
    } else {
      spans.push({ start: cell.col, end: cell.endCol, header: cell.text });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const filled: typeof spans = [];
  for (const span of spans) {
    const previous = filled[filled.length - 1];
    for (let col = (previous?.end ?? span.start - 1) + 1; col < span.start; col += 1) filled.push({ start: col, end: col, header: '' });
    filled.push(span);
  }
  const columns = filled.map<LogicalColumn>((span) => ({
    anchor: span.start,
    letter: indexToColumn(span.start),
    startCol: span.start,
    endCol: span.end,
    header: span.header,
  }));
  return { columns, multiRow, tallRows };
}

/**
 * A header of ordinals -- a label, then increasing integers such as fiscal
 * years or sequence numbers (指標 | 2024 | 2025 | 2026) -- is still a header.
 */
function isOrdinalHeader(headerTexts: readonly LogicalCell[]): boolean {
  if (isValueLike(headerTexts[0].text)) return false;
  const numbers = headerTexts.filter((cell) => isValueLike(cell.text)).map((cell) => cell.text);
  if (!numbers.every((text) => /^\d+$/.test(text))) return false;
  return numbers.every((text, i) => i === 0 || Number(text) > Number(numbers[i - 1]));
}

/**
 * True when `rowTexts` puts plain text in a column whose body so far is
 * mostly values (numbers, dates) -- the shape of a new header row, which
 * starts another table rather than continuing this one.
 */
function breaksColumnTypes(columnTypes: ReadonlyMap<number, { filled: number; values: number }>, rowTexts: readonly LogicalCell[]): boolean {
  if (rowTexts.some((cell) => isValueLike(cell.text))) return false;
  return rowTexts.some((cell) => {
    const types = columnTypes.get(cell.col);
    // Only a column that is clearly values (4 in 5 or more): item/value lists mix text and values.
    return types !== undefined && types.filled >= 2 && types.values * 5 >= types.filled * 4;
  });
}

/** Most text cells start on a header anchor (off-anchor cells are reported, not hidden). */
function isAligned(rowTexts: readonly LogicalCell[], anchors: ReadonlySet<number>): boolean {
  if (rowTexts.length === 0) return false;
  const aligned = rowTexts.filter((cell) => anchors.has(cell.col)).length;
  return aligned * 2 >= rowTexts.length;
}

/**
 * A run is a key/value frame when every row pairs a label with a value and
 * no column repeats a value. The pairing shows either as labels at the even
 * positions (1st, 3rd, ...) in every row, or as a value (number, date) at an
 * odd position of the first row, which therefore cannot be a header. Tables
 * repeat values down a column (区分, 型, ○/×); frames list distinct
 * attributes, so a repeated value keeps the run a table.
 */
function keyValueReasons(view: SheetView, block: Block, top: number, end: number): RoleReason[] | undefined {
  const rows: LogicalCell[][] = [];
  for (let row = top; row <= end; row += 1) {
    const rowTexts = textCells(cellsIn(view, row, block));
    if (rowTexts.length > 0) rows.push(rowTexts);
  }
  if (rows.some((rowTexts) => rowTexts.length < 2)) return undefined;
  if (!rows.every((rowTexts) => rowTexts.every((cell, i) => i % 2 === 1 || (!isValueLike(cell.text) && !isSentence(cell.text))))) return undefined;
  const seen = new Map<number, Set<string>>();
  for (const rowTexts of rows) {
    for (const cell of rowTexts) {
      const values = seen.get(cell.col) ?? new Set<string>();
      if (values.has(cell.text)) return undefined;
      values.add(cell.text);
      seen.set(cell.col, values);
    }
  }
  const labelsAtEven = rows.every((rowTexts) => rowTexts.every((cell, i) => i % 2 === 1 || isLabelLike(cell.text)));
  const valueInFirstRow = rows[0].some((cell, i) => i % 2 === 1 && isValueLike(cell.text));
  if (labelsAtEven && valueInFirstRow) return ['alternating-labels', 'value-in-first-row'];
  if (labelsAtEven) return ['alternating-labels'];
  if (valueInFirstRow && rows.every((rowTexts) => rowTexts.length % 2 === 0)) return ['value-in-first-row'];
  return undefined;
}

function nextTextRow(view: SheetView, block: Block, from: number): number | undefined {
  for (let row = from; row <= block.bottom; row += 1) {
    if (textCells(cellsIn(view, row, block)).length > 0) return row;
  }
  return undefined;
}

/** Last row reached by any logical cell anchored in rows [from, to]. */
function lastRowTouching(view: SheetView, block: Block, from: number, to: number): number {
  let end = to;
  for (let row = from; row <= Math.min(to, block.bottom); row += 1) {
    for (const cell of cellsIn(view, row, block)) end = Math.max(end, Math.min(cell.endRow, block.bottom));
  }
  return end;
}

function texts(view: SheetView, block: Block, from: number, to: number, limit = 6): string[] {
  const out: string[] = [];
  for (let row = from; row <= to && out.length < limit; row += 1) {
    for (const cell of textCells(cellsIn(view, row, block))) {
      if (out.length < limit) out.push(cell.text.length > 40 ? `${cell.text.slice(0, 40)}…` : cell.text);
    }
  }
  return out;
}

function candidate(sheet: string, role: BlockRole, reasons: RoleReason[], range: CellRange, excerpt: string[]): ImportCandidate {
  return { sheet, role, reasons, range, a1: cellRangeToA1(range), excerpt, cautions: [] };
}

/**
 * A headerless table right below a table with the same column layout (one or
 * two blank rows between) is the rest of that table, split by a blank row.
 */
function joinContinuations(candidates: ImportCandidate[]): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  for (const candidate of candidates) {
    const above = [...out].reverse().find((other) => other.role === 'table' && other.range.endRow < candidate.range.startRow);
    const headerless = candidate.cautions.some((caution) => caution.code === 'header-not-found');
    const sameColumns =
      above?.columns !== undefined &&
      candidate.columns !== undefined &&
      JSON.stringify(above.columns.map((c) => [c.startCol, c.endCol])) === JSON.stringify(candidate.columns.map((c) => [c.startCol, c.endCol]));
    const gap = above ? candidate.range.startRow - above.range.endRow - 1 : Infinity;
    if (candidate.role === 'table' && headerless && above && sameColumns && gap >= 1 && gap <= 2 && !above.cautions.some((c) => c.code === 'header-not-found')) {
      const blank = range(above.range.endRow + 1, candidate.range.startRow - 1);
      above.range = { ...above.range, endRow: candidate.range.endRow };
      above.a1 = cellRangeToA1(above.range);
      above.cautions.push(
        ...candidate.cautions.filter((caution) => caution.code !== 'header-not-found'),
        {
          code: 'blank-row',
          message: `表の途中に空行があります。${blank.map((r) => r + 1).join('・')}行目は空の行として表示されます。`,
          cells: blank.map((r) => `${r + 1}`),
        },
      );
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/**
 * Excel tables (ListObjects) are the author's own declaration of a table:
 * they replace whatever detection found in the same place. The header row
 * and the data rows are kept; a totals row is left out and said so.
 */
function withDeclaredTables(sheetName: string, sheet: SheetSource, detected: ImportCandidate[], structure?: WorkbookStructure): ImportCandidate[] {
  const tables = (structure?.tables ?? []).filter((table) => table.sheet === sheetName);
  if (tables.length === 0) return detected;
  const overlaps = (a: CellRange, b: CellRange): boolean =>
    a.startRow <= b.endRow && a.endRow >= b.startRow && a.startCol <= b.endCol && a.endCol >= b.startCol;
  const kept = detected.filter((candidate) => candidate.role !== 'table' || !tables.some((table) => overlaps(candidate.range, table.range)));
  for (const table of tables) {
    const range: CellRange = { ...table.range, endRow: table.range.endRow - table.totalsRowCount };
    const cautions: ImportCaution[] = [];
    if (table.totalsRowCount > 0) {
      cautions.push({
        code: 'totals-row-excluded',
        message: `集計行（${range.endRow + 2}行目）は範囲に含めていません。集計はExcelの値を別に参照してください。`,
      });
    }
    const columns = range.startCol <= range.endCol
      ? Array.from({ length: range.endCol - range.startCol + 1 }, (_, i) => {
          const col = range.startCol + i;
          const header = table.headerRowCount > 0 ? sheet.cellAt(range.startRow, col)?.text.trim() ?? table.columns[i] ?? '' : '';
          return { anchor: col, letter: indexToColumn(col), startCol: col, endCol: col, header };
        })
      : [];
    const excerpt = columns.map((column) => column.header).filter(Boolean).slice(0, 6);
    kept.push({
      ...candidate(sheetName, 'table', ['excel-table'], range, excerpt),
      title: table.name,
      excelTable: table.name,
      columns,
      cautions,
    });
  }
  return kept.sort((a, b) => a.range.startRow - b.range.startRow || a.range.startCol - b.range.startCol);
}

function attachNames(sheetName: string, candidates: ImportCandidate[], structure?: WorkbookStructure): void {
  for (const name of structure?.names ?? []) {
    if (name.sheet !== sheetName || !name.range) continue;
    const range = name.range;
    const same = candidates.find((c) =>
      c.range.startRow === range.startRow && c.range.endRow === range.endRow && c.range.startCol === range.startCol && c.range.endCol === range.endCol);
    if (same) same.names = [...(same.names ?? []), name.name];
  }
}

/** Rows or columns hidden in Excel (by hand, filter or outline) are still shown by MMI. */
function cautionHidden(candidate: ImportCandidate, sheet: { hiddenRows: number[]; hiddenColumns: number[] }): void {
  const rows = sheet.hiddenRows.filter((row) => row >= candidate.range.startRow && row <= candidate.range.endRow);
  const columns = sheet.hiddenColumns.filter((col) => col >= candidate.range.startCol && col <= candidate.range.endCol);
  if (rows.length > 0) {
    candidate.cautions.push({
      code: 'hidden-rows',
      message: `Excelで非表示の行（${rows.map((row) => row + 1).join('・')}行目。フィルターや折りたたみを含む）も、MMIでは表示されます。`,
      cells: rows.map((row) => `${row + 1}`),
    });
  }
  if (columns.length > 0) {
    candidate.cautions.push({
      code: 'hidden-columns',
      message: `Excelで非表示の列（${columns.map(indexToColumn).join('・')}列）も、MMIでは表示されます。`,
      cells: columns.map(indexToColumn),
    });
  }
}

/** Pieces of one drawing inside a block (boxes, arrows) are one candidate. */
function mergeDrawings(candidates: ImportCandidate[]): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  for (const candidate of candidates) {
    const previous = out[out.length - 1];
    if (previous?.role === 'diagram' && candidate.role === 'diagram') {
      const merged: CellRange = {
        startRow: Math.min(previous.range.startRow, candidate.range.startRow),
        startCol: Math.min(previous.range.startCol, candidate.range.startCol),
        endRow: Math.max(previous.range.endRow, candidate.range.endRow),
        endCol: Math.max(previous.range.endCol, candidate.range.endCol),
      };
      out[out.length - 1] = { ...previous, range: merged, a1: cellRangeToA1(merged), excerpt: [...previous.excerpt, ...candidate.excerpt].slice(0, 6) };
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/** A heading directly above a table (at most one blank row between) becomes its title. */
function attachTitles(candidates: ImportCandidate[]): void {
  for (const table of candidates) {
    if (table.role !== 'table' || table.excelTable) continue;
    const heading = candidates
      .filter((other) => other.role === 'heading' && other.range.endRow < table.range.startRow && table.range.startRow - other.range.endRow <= 2)
      .filter((other) => other.range.startCol <= table.range.endCol && other.range.endCol >= table.range.startCol)
      .sort((a, b) => b.range.endRow - a.range.endRow)[0];
    if (heading) {
      table.title = heading.excerpt[0];
      table.titleA1 = cellRangeToA1({ startRow: heading.range.startRow, startCol: heading.range.startCol, endRow: heading.range.startRow, endCol: heading.range.startCol });
    }
  }
}

// ---------------------------------------------------------------------------
// Reference proposal, re-checked by the real pipeline
// ---------------------------------------------------------------------------

function proposeReference(candidate: ImportCandidate, view: SheetView, referencePath: string, workbook: WorkbookData, previewRows: number): void {
  const columns = candidate.columns ?? [];
  const hasHeader = columns.some((column) => column.header !== '');
  const merged = columns.some((column) => column.endCol > column.startCol);
  const params: Record<string, string> = {};
  const physical = candidate.range;
  if (hasHeader) params.header = 'first';
  // `columns=` letters count from the first column of the slice (user manual
  // "列を選ぶ"), not from the sheet's column A.
  if (merged) params.columns = columns.map((column) => indexToColumn(column.anchor - physical.startCol)).join(',');
  const rowCount = physical.endRow - physical.startRow + 1;
  const bodyRowCount = rowCount - (hasHeader ? 1 : 0);
  const physicalColumns = physical.endCol - physical.startCol + 1;
  const physicalCells = physicalColumns * rowCount;
  // Smart Fallback (spec §7) measures the slice before `columns`, so a
  // 方眼紙 table always exceeds its thresholds. When the projected table is
  // within them, ask for a table explicitly; otherwise let it become a card,
  // as a plain table of that size would.
  const fitsAsTable = columns.length <= MAX_LOGICAL_COLUMNS_FOR_TABLE && columns.length * rowCount <= MAX_LOGICAL_CELLS_FOR_TABLE;
  if (merged && fitsAsTable && (physicalColumns > MAX_LOGICAL_COLUMNS_FOR_TABLE || physicalCells > MAX_LOGICAL_CELLS_FOR_TABLE)) {
    params.mode = 'table';
  }

  const query = new URLSearchParams(params).toString().replace(/%2C/gi, ',');
  const reference = `![[${referencePath}#${candidate.sheet}|${candidate.a1}${query ? `?${query}` : ''}]]`;
  const parsed = parseEmbedSyntax(reference);
  if (!parsed) {
    candidate.cautions.push({ code: 'revalidation-mismatch', message: '提案した参照を記法として解釈できませんでした。' });
    return;
  }

  let decision;
  try {
    decision = getSmartFallbackDecisionAfterLoad(parsed, workbook);
  } catch (error) {
    candidate.cautions.push({ code: 'revalidation-mismatch', message: `提案した参照を描画できませんでした: ${(error as Error).message}` });
    return;
  }
  if (decision.renderMode === 'card') {
    // A card shows no cells, so there is no table to compare; the renderer has accepted the reference.
    if (!candidate.cautions.some((caution) => caution.code === 'wide-table')) {
      candidate.cautions.push({
        code: 'large-table',
        message: `表が${columns.length}列×${bodyRowCount}行と大きいため、別紙（カード）として表示されます。本文に表として載せる場合は範囲を分けてください。`,
      });
    }
    candidate.proposal = {
      reference,
      range: candidate.a1,
      params,
      renderMode: 'card',
      preview: { headers: hasHeader ? columns.map((column) => column.header) : undefined, rows: [], totalRows: bodyRowCount },
    };
    return;
  }
  let logical;
  try {
    logical = buildLogicalTable(parsed, workbook);
  } catch (error) {
    candidate.cautions.push({ code: 'revalidation-mismatch', message: `提案した参照を描画できませんでした: ${(error as Error).message}` });
    return;
  }

  // What the analysis read off the sheet: each row's anchor-column texts.
  const expected: string[][] = [];
  for (let row = physical.startRow; row <= physical.endRow; row += 1) {
    const source = merged ? columns.map((column) => column.anchor) : range(physical.startCol, physical.endCol);
    expected.push(source.map((col) => view.sheet.cellAt(row, col)?.text ?? ''));
  }
  const expectedHeaders = hasHeader ? expected[0] : undefined;
  const expectedBody = hasHeader ? expected.slice(1) : expected;
  const same = JSON.stringify(expectedHeaders) === JSON.stringify(logical.headers) && JSON.stringify(expectedBody) === JSON.stringify(logical.bodyRows);
  if (!same) {
    candidate.cautions.push({ code: 'revalidation-mismatch', message: '提案した参照の描画結果が、解析で読んだ内容と一致しません。参照を提案しません。' });
    return;
  }

  candidate.proposal = {
    reference,
    range: candidate.a1,
    params,
    renderMode: decision.renderMode,
    preview: { headers: logical.headers, rows: logical.bodyRows.slice(0, previewRows), totalRows: logical.bodyRows.length },
  };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
