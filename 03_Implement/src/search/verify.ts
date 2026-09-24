/**
 * Exact re-verification of a candidate against the source
 * (input-assistance-cpu-search.md §1: similarity is never proof).
 *
 * The index is a snapshot; the book may have changed since. Before a
 * candidate is shown as valid, the cells it was derived from -- the header
 * row and the title -- are read again from the current `SheetSource` and
 * compared exactly. Any drift makes the candidate stale; the caller must
 * re-index that book rather than insert a reference built on old structure.
 * Read-only: nothing here writes to the source.
 */
import type { SheetSource } from '../core/sheetSource.js';
import { parseCellRef } from '../core/tableGeometry.js';
import type { DetectedRegion } from './regionDetector.js';

export interface VerificationResult {
  ok: boolean;
  mismatches: string[];
}

export function verifyRegion(region: DetectedRegion, sheet: SheetSource | undefined): VerificationResult {
  const mismatches: string[] = [];
  if (!sheet) return { ok: false, mismatches: [`シート「${region.sheet}」がありません。`] };

  const text = (row: number, col: number): string => sheet.cellAt(row, col)?.text.trim() ?? '';
  const { startRow, startCol, endRow, endCol } = region.range;
  const used = sheet.usedRange;
  if (!used || used.startRow > startRow || used.startCol > startCol || used.endRow < endRow || used.endCol < endCol) {
    mismatches.push(`範囲 ${region.a1} が現在のシートの使用範囲外です。`);
  }
  if (region.headers) {
    region.headers.forEach((header, offset) => {
      const actual = text(startRow, startCol + offset);
      if (actual !== header.trim()) mismatches.push(`見出し ${offset + 1} 列目: 索引「${header}」/ 現在「${actual}」`);
    });
  }
  if (region.title && region.titleA1) {
    const title = parseCellRef(region.titleA1.split(':')[0]);
    const actual = text(title.row, title.col);
    if (actual !== region.title.trim()) mismatches.push(`表題: 索引「${region.title}」/ 現在「${actual}」`);
  }
  return { ok: mismatches.length === 0, mismatches };
}
