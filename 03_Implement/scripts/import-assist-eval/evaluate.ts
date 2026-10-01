/**
 * Import-assistance evaluation (02_Architecture/import-assistance.md §6).
 *
 * Compares what a person importing an existing Excel design document gets
 * today (the region detector behind completion and search, with the obvious
 * `header=first` reference) against the import-candidate prototype, on the
 * fictional 方眼紙 corpus of `corpus.ts`. Every reference is judged by the
 * real pipeline: Smart Fallback decides table or card, and the logical table
 * must equal the expected header and body cell for cell.
 *
 * The research signal for table-likeness (SAI body-candidate, issue #218) is
 * scored on the same blocks as a comparator.
 *
 * Usage: node --import tsx scripts/import-assist-eval/evaluate.ts [--set dev|holdout] [--out result.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CellRange, SheetSource } from '../../src/core/sheetSource.js';
import { buildLogicalTable } from '../../src/core/renderTable.js';
import { getSmartFallbackDecisionAfterLoad } from '../../src/core/smartFallback.js';
import { cellRangeToA1, parseCellRef, parseRangeToCellRange } from '../../src/core/tableGeometry.js';
import { loadWorkbook, type WorkbookData } from '../../src/core/workbookLoader.js';
import { deriveMmiStructuredArtifactBodyCandidateSignal } from '../../src/experimental/structuredArtifactBodyCandidateSignal.js';
import type { ImportCandidate } from '../../src/importAssist/importCandidates.js';
import { analyzeWorkbookForImport } from '../../src/importAssist/importDraft.js';
import { summarizeLayouts } from '../../src/importAssist/layoutGroups.js';
import { parseEmbedSyntax } from '../../src/parser/embedSyntax.js';
import { detectRegions, type DetectedRegion } from '../../src/search/regionDetector.js';
import { writeImportCorpus, type ExpectedBlock, type ExpectedTable } from './corpus.js';
import { writeHoldoutCorpus } from './holdout.js';

interface TableOutcome {
  id: string;
  expressible: boolean;
  baseline: { found: boolean; reference?: string; renderMode?: string; exact: boolean };
  prototype: {
    found: boolean;
    reference?: string;
    renderMode?: string;
    exact: boolean;
    cautions: string[];
    missingCautions: string[];
    extraCautions: string[];
    silentlyDropped: string[];
  };
  sai: 'present' | 'absent';
}

interface BlockOutcome {
  id: string;
  expected: ExpectedBlock['role'];
  prototype: string;
  baselineOfferedAsRange: boolean;
  sai: 'present' | 'absent';
}

function a1Contains(range: CellRange, a1: string): boolean {
  const { row, col } = parseCellRef(a1);
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
}

function judge(reference: string, workbook: WorkbookData, expected: ExpectedTable): { renderMode: string; exact: boolean } {
  const query = parseEmbedSyntax(reference);
  if (!query) return { renderMode: 'invalid', exact: false };
  try {
    const decision = getSmartFallbackDecisionAfterLoad(query, workbook);
    const logical = buildLogicalTable(query, workbook);
    const exact =
      decision.renderMode === 'table' &&
      JSON.stringify(logical.headers ?? null) === JSON.stringify(expected.headers) &&
      JSON.stringify(logical.bodyRows) === JSON.stringify(expected.body);
    return { renderMode: decision.renderMode, exact };
  } catch (error) {
    return { renderMode: `error: ${(error as Error).message}`, exact: false };
  }
}

/** What the current product offers for a table: its detected region with `header=first` when a header was found. */
function baselineReference(book: string, region: DetectedRegion): string {
  const params = region.headerConfidence === 'none' ? '' : '?header=first';
  return `![[./${book}#${region.sheet}|${region.a1}${params}]]`;
}

/** Non-empty cells inside the proposal's range that its logical table does not show and no caution names. */
function silentlyDropped(candidate: ImportCandidate, sheet: SheetSource): string[] {
  if (!candidate.proposal) return [];
  const range = candidate.range;
  const shownColumns = candidate.proposal.params.columns
    ? new Set((candidate.columns ?? []).map((column) => column.anchor))
    : undefined;
  const named = new Set(candidate.cautions.flatMap((caution) => caution.cells ?? []));
  const out: string[] = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const text = sheet.cellAt(row, col)?.text.trim() ?? '';
      if (text === '' || !shownColumns || shownColumns.has(col)) continue;
      const a1 = cellRangeToA1({ startRow: row, startCol: col, endRow: row, endCol: col });
      if (!named.has(a1)) out.push(a1);
    }
  }
  return out;
}

function saiSignal(sheet: SheetSource, range: CellRange): 'present' | 'absent' {
  const cells = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const text = sheet.cellAt(row, col)?.text ?? '';
      if (text.trim() !== '') cells.push({ row, column: col, text });
    }
  }
  const merges = sheet.merges
    .filter((merge) => merge.startRow <= range.endRow && merge.endRow >= range.startRow && merge.startCol <= range.endCol && merge.endCol >= range.startCol)
    .map((merge) => ({ startRow: merge.startRow, startColumn: merge.startCol, endRow: merge.endRow, endColumn: merge.endCol }));
  return deriveMmiStructuredArtifactBodyCandidateSignal({ cells, merges }).value;
}

export function main(argv = process.argv.slice(2)): Record<string, unknown> {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const setIndex = argv.indexOf('--set');
  const set = setIndex >= 0 ? argv[setIndex + 1] : 'dev';
  if (set !== 'dev' && set !== 'holdout') throw new Error(`Unknown set: ${set}`);
  const corpus = set === 'holdout' ? writeHoldoutCorpus() : writeImportCorpus();

  const workbooks = new Map<string, WorkbookData>();
  const candidatesBySheet = new Map<string, ImportCandidate[]>();
  const regionsBySheet = new Map<string, DetectedRegion[]>();
  const analysisMs: number[] = [];
  const imports = [];
  for (const book of corpus.books) {
    const workbook = loadWorkbook({ absolutePath: path.join(corpus.dir, book) });
    workbooks.set(book, workbook);
    const started = performance.now();
    const analysis = analyzeWorkbookForImport(book, `./${book}`, workbook);
    analysisMs.push(performance.now() - started);
    imports.push(analysis);
    for (const sheet of analysis.sheets) candidatesBySheet.set(`${book}#${sheet.sheet}`, [...sheet.candidates]);
    for (const [name, source] of Object.entries(workbook.sheets)) regionsBySheet.set(`${book}#${name}`, detectRegions(name, source));
  }

  const tables: TableOutcome[] = corpus.tables.map((expected) => {
    const key = `${expected.book}#${expected.sheet}`;
    const workbook = workbooks.get(expected.book)!;
    const sheet = workbook.sheets[expected.sheet];
    const expectedRange = parseRangeToCellRange(expected.range);
    const headerCell = cellRangeToA1({ ...expectedRange, endRow: expectedRange.startRow, endCol: expectedRange.startCol });

    const region = (regionsBySheet.get(key) ?? []).find((candidate) => a1Contains(candidate.range, headerCell));
    const baselineRef = region ? baselineReference(expected.book, region) : undefined;
    const baselineJudged = baselineRef ? judge(baselineRef, workbook, expected) : undefined;

    const candidate = (candidatesBySheet.get(key) ?? []).find((c) => c.role === 'table' && c.a1 === expected.range);
    const protoRef = candidate?.proposal?.reference;
    const protoJudged = protoRef ? judge(protoRef, workbook, expected) : undefined;
    const cautions = candidate?.cautions.map((caution) => caution.code) ?? [];
    return {
      id: expected.id,
      expressible: expected.expressible,
      baseline: { found: Boolean(region), reference: baselineRef, renderMode: baselineJudged?.renderMode, exact: baselineJudged?.exact ?? false },
      prototype: {
        found: Boolean(candidate),
        reference: protoRef,
        renderMode: protoJudged?.renderMode,
        exact: protoJudged?.exact ?? false,
        cautions,
        missingCautions: expected.cautions.filter((code) => !cautions.includes(code)),
        extraCautions: cautions.filter((code) => !(expected.cautions as string[]).includes(code)),
        silentlyDropped: candidate ? silentlyDropped(candidate, sheet) : [],
      },
      sai: saiSignal(sheet, expectedRange),
    };
  });

  const blocks: BlockOutcome[] = corpus.blocks.map((expected) => {
    const key = `${expected.book}#${expected.sheet}`;
    const sheet = workbooks.get(expected.book)!.sheets[expected.sheet];
    const candidate = (candidatesBySheet.get(key) ?? []).find((c) => a1Contains(c.range, expected.anchor));
    const region = (regionsBySheet.get(key) ?? []).find((r) => a1Contains(r.range, expected.anchor));
    return {
      id: `${expected.book}/${expected.id}`,
      expected: expected.role,
      prototype: candidate?.role ?? 'missing',
      baselineOfferedAsRange: Boolean(region),
      sai: region ? saiSignal(sheet, region.range) : 'absent',
    };
  });

  // Extra table candidates that match no expected table (false table suggestions).
  const expectedRanges = new Set(corpus.tables.map((t) => `${t.book}#${t.sheet}!${t.range}`));
  const extraTables = [...candidatesBySheet.entries()].flatMap(([key, candidates]) =>
    candidates.filter((c) => c.role === 'table' && !expectedRanges.has(`${key}!${c.a1}`)).map((c) => `${key}!${c.a1}`),
  );
  const baselineRegions = [...regionsBySheet.values()].flat().length;

  const layoutPerBook = imports.map((analysis) => ({ book: analysis.book, ...summarizeLayouts(analysis.sheets) }));
  const layoutAcrossBooks = summarizeLayouts(imports.flatMap((analysis) => analysis.sheets));

  const expressible = tables.filter((t) => t.expressible);
  const rate = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 1000) / 1000);
  const confusion: Record<string, Record<string, number>> = {};
  for (const block of blocks) {
    confusion[block.expected] ??= {};
    confusion[block.expected][block.prototype] = (confusion[block.expected][block.prototype] ?? 0) + 1;
  }

  const summary = {
    corpus: { set, books: corpus.books.length, sheets: candidatesBySheet.size, tables: tables.length, expressibleTables: expressible.length, nonTableBlocks: blocks.length },
    tables: {
      baselineExact: `${expressible.filter((t) => t.baseline.exact).length}/${expressible.length}`,
      baselineRenderedAsCard: tables.filter((t) => t.baseline.renderMode === 'card').length,
      baselineHeaderFound: tables.filter((t) => t.baseline.reference?.includes('header=first')).length,
      prototypeExact: `${expressible.filter((t) => t.prototype.exact).length}/${expressible.length}`,
      prototypeFound: `${tables.filter((t) => t.prototype.found).length}/${tables.length}`,
      prototypeRenderedAsTable: tables.filter((t) => t.prototype.renderMode === 'table').length,
      inexpressibleWithCaution: `${tables.filter((t) => !t.expressible && t.prototype.missingCautions.length === 0).length}/${tables.length - expressible.length}`,
      cautionRecall: rate(
        tables.reduce((n, t) => n + (t.prototype.cautions.length - t.prototype.extraCautions.length), 0),
        corpus.tables.reduce((n, t) => n + t.cautions.length, 0),
      ),
      unexpectedCautions: tables.flatMap((t) => t.prototype.extraCautions.map((code) => `${t.id}: ${code}`)),
      silentlyDroppedCells: tables.reduce((n, t) => n + t.prototype.silentlyDropped.length, 0),
      extraTableCandidates: extraTables,
    },
    nonTableBlocks: {
      baselineOfferedAsRange: `${blocks.filter((b) => b.baselineOfferedAsRange).length}/${blocks.length}`,
      baselineRegionsTotal: baselineRegions,
      prototypeRoleCorrect: `${blocks.filter((b) => b.prototype === b.expected).length}/${blocks.length}`,
      prototypeCalledTable: blocks.filter((b) => b.prototype === 'table').map((b) => b.id),
      confusion,
    },
    saiBodySignal: {
      tablesPresent: `${tables.filter((t) => t.sai === 'present').length}/${tables.length}`,
      nonTablesPresent: `${blocks.filter((b) => b.baselineOfferedAsRange && b.sai === 'present').length}/${blocks.filter((b) => b.baselineOfferedAsRange).length}`,
    },
    layout: {
      perBook: layoutPerBook.map((l) => ({
        book: l.book,
        groups: l.groups.map((g) => g.members.map((m) => m.sheet)),
        deviations: l.deviations.map((d) => ({ sheet: d.sheet.sheet, nearest: d.nearest.sheet.sheet, overlap: d.overlap, differences: d.differences })),
        unique: l.unique.map((u) => u.sheet),
      })),
      acrossBooks: {
        groups: layoutAcrossBooks.groups.map((g) => g.members.map((m) => `${m.book}#${m.sheet}`)),
        deviations: layoutAcrossBooks.deviations.map((d) => `${d.sheet.book}#${d.sheet.sheet} ~ ${d.nearest.sheet.book}#${d.nearest.sheet.sheet} (${d.overlap})`),
      },
    },
    analysisMsPerBook: analysisMs.map((ms) => Math.round(ms * 10) / 10),
  };

  const report = { summary, tables, blocks };
  if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { summary } = main();
  console.log(JSON.stringify(summary, null, 2));
}
