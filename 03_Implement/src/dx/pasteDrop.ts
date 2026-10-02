const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.xml'] as const;
const FILES_MIME_TYPE = 'files';
const MIME_PRIORITY_BY_SOURCE = {
  paste: ['text/html', 'text/plain'],
  drop: ['text/uri-list', 'text/html', 'text/plain'],
} as const;

type PasteDropSource = 'clipboard-html' | 'file-drop';
export type PasteDropEntrySource = keyof typeof MIME_PRIORITY_BY_SOURCE;
export type PasteDropMimeType = (typeof MIME_PRIORITY_BY_SOURCE)[PasteDropEntrySource][number];

type PasteDropCandidate =
  | { kind: 'clipboard'; value: string }
  | { kind: 'files'; value: readonly string[] };

export interface PasteDropSuggestion {
  source: PasteDropSource;
  filepath: string;
  sheet?: string;
  range?: string;
  markdown: string;
}

export interface PasteDropInput {
  clipboardHtml?: string;
  droppedFiles?: readonly string[];
}

export interface PasteDropTransferValues {
  clipboardValues?: Partial<Record<PasteDropMimeType, string>>;
  droppedFiles?: readonly string[];
}

export interface PasteDropDataTransferItemLike {
  asString(): PromiseLike<string>;
  asFile?(): { uri?: { fsPath: string } } | undefined;
}

export interface PasteDropDataTransferLike {
  get(mimeType: string): PasteDropDataTransferItemLike | undefined;
}

export interface PasteDropTransferReadResult extends PasteDropTransferValues {
  clipboardValues: Partial<Record<PasteDropMimeType, string>>;
}

export function suggestEmbedFromPasteDrop(input: PasteDropInput): PasteDropSuggestion | null {
  return suggestEmbedFromTransferValues('paste', {
    clipboardValues: input.clipboardHtml ? { 'text/html': input.clipboardHtml } : undefined,
    droppedFiles: input.droppedFiles,
  });
}

export function suggestEmbedFromTransferValues(
  source: PasteDropEntrySource,
  input: PasteDropTransferValues,
): PasteDropSuggestion | null {
  const candidates = MIME_PRIORITY_BY_SOURCE[source]
    .map((mimeType) => toTransferCandidate(mimeType, input.clipboardValues?.[mimeType]))
    .filter((candidate): candidate is PasteDropCandidate => candidate !== undefined);

  return firstSuggestionFromCandidates([...candidates, toFilesCandidate(input.droppedFiles)]);
}

export async function suggestEmbedFromDataTransfer(
  dataTransfer: PasteDropDataTransferLike,
  source: PasteDropEntrySource,
): Promise<PasteDropSuggestion | null> {
  return suggestEmbedFromTransferValues(source, await readTransferValuesFromDataTransfer(dataTransfer, source));
}

/**
 * `sheet` and `range` are deliberately never inferred here (issue-0114 /
 * ADR-0016 "残る判断"; paste-provenance.md §6). A real Excel range copy was
 * captured and confirmed (2026-09-11) to contain neither a sheet name (no
 * `<title>`, no `data-sheet`-like attribute) nor the workbook's own file path
 * anywhere in its HTML -- only two `<link>` references to a *temporary*
 * clip-staging folder (see `extractSupportedFilepathFromHtml`). Guessing a
 * sheet from `<title>`/`data-sheet`, or a range from the copied fragment's
 * row/column count assuming an A1 origin, would silently fabricate
 * provenance MMI cannot actually verify (spec P2: failures must be visible,
 * never silent). A bare `![[file.xlsx]]` -- file only -- is the most this
 * function can honestly claim; the caller/user supplies sheet and range
 * (issue-0110 completion, or the content-matching flow issue-0114 "作業D"
 * has not yet implemented).
 */
export function suggestEmbedFromClipboardHtml(html: string): PasteDropSuggestion | null {
  const normalizedHtml = html.trim();
  if (!normalizedHtml) {
    return null;
  }

  const filepath = extractSupportedFilepathFromHtml(normalizedHtml);
  if (!filepath) {
    return null;
  }

  return buildSuggestion('clipboard-html', filepath);
}

export function suggestEmbedFromDroppedFiles(files: readonly string[]): PasteDropSuggestion | null {
  const filepath = firstSupportedPath(files);
  if (!filepath) {
    return null;
  }

  return buildSuggestion('file-drop', filepath);
}

export function isSupportedWorkbookPath(filepath: string): boolean {
  const normalized = normalizePath(filepath).toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export interface HtmlTableShape {
  rowCount: number;
  columnCount: number;
}

/**
 * Shape (row/column count) of the first `<table>` in `html`, via an
 * occupancy grid that honors `rowspan`/`colspan` (design review R2:
 * `01_Plans/input-assistance-design-review.md`). This deliberately returns
 * *shape only*, never an A1 range -- see `suggestEmbedFromClipboardHtml` for
 * why inferring an origin from shape alone is unsound. Intended for the
 * content-matching candidate search (issue-0114 "作業D", not yet
 * implemented): comparing a copied fragment's shape against sheets in a
 * candidate workbook is a cheap first filter before comparing cell values.
 *
 * A per-row `<td>` count -- even the max across rows -- cannot recover true
 * width: a table whose first row is `A(rowspan=2), B` and second row is
 * `C, D` has at most 2 cells per row, but true width is 3 (the rowspan
 * pushes `C`/`D` one column right, since browsers/Excel never re-emit a
 * `<td>` for a cell covered by a rowspan from above). Verified against this
 * exact case and against a real captured Excel clipboard payload
 * (`03_Implement/scripts/clipboard-probe/probe-lib.cjs::htmlShape`, the
 * reference implementation this ports from).
 *
 * Counted from the whole `<table>`, not just inside
 * `<!--StartFragment-->`...`<!--EndFragment-->`: a single-row copy was
 * observed to place its `<tr>` *outside* the fragment markers (see
 * `input-assistance-paste-provenance.md` §1.5), so fragment-only counting
 * would under-report by a row.
 */
export function extractHtmlTableShape(html: string): HtmlTableShape | undefined {
  const tableMatch = /<table\b[\s\S]*?<\/table>/i.exec(html);
  if (!tableMatch) {
    return undefined;
  }

  const rowMatches = [...tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) {
    return undefined;
  }

  // grid[row] is a sparse array; a truthy slot means that physical cell is
  // occupied, either by a cell literally emitted at that position or by the
  // colspan/rowspan of an earlier cell reaching into it.
  const grid: boolean[][] = [];
  const occupy = (row: number, col: number): void => {
    (grid[row] ??= [])[col] = true;
  };

  rowMatches.forEach((rowMatch, rowIndex) => {
    grid[rowIndex] ??= [];
    let col = 0;

    for (const cellMatch of rowMatch[1].matchAll(/<(?:td|th)\b([^>]*)>/gi)) {
      const attrs = cellMatch[1];
      const colspan = parseSpanAttribute(attrs, 'colspan');
      const rowspan = parseSpanAttribute(attrs, 'rowspan');

      while (grid[rowIndex][col]) {
        col += 1; // skip a column already covered by an earlier row's rowspan
      }
      for (let dr = 0; dr < rowspan; dr += 1) {
        for (let dc = 0; dc < colspan; dc += 1) {
          occupy(rowIndex + dr, col + dc);
        }
      }
      col += colspan;
    }
  });

  const rowCount = grid.length;
  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
  if (rowCount <= 0 || columnCount <= 0) {
    return undefined;
  }

  return { rowCount, columnCount };
}

function parseSpanAttribute(attrs: string, name: 'colspan' | 'rowspan'): number {
  const match = new RegExp(`${name}=(?:"(\\d+)"|'(\\d+)'|(\\d+))`, 'i').exec(attrs);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  const value = raw === undefined ? 1 : Number.parseInt(raw, 10);
  return Number.isNaN(value) ? 1 : Math.max(1, value);
}

/**
 * Parses Excel's tab-separated plain-text clipboard payload (`text/plain`)
 * into a cell matrix -- the value-matrix half of what content-matching needs
 * from a clipboard capture (`input-assistance-paste-provenance.md` §4/§5):
 * `extractHtmlTableShape` supplies the occupancy-grid-aware shape from
 * `text/html`, this supplies the actual display values from `text/plain`.
 *
 * Mirrors `workbookLoader.ts`'s RFC4180 CSV parser's quoting rules with tab
 * in place of comma, confirmed against real Excel TSV clipboard output
 * (2026-09-14, captured via `03_Implement/scripts/clipboard-probe`):
 *
 * - A cell is wrapped in double quotes only when it contains a tab or an
 *   embedded newline. A bare `"` alone does NOT trigger quoting -- Excel
 *   leaves e.g. `say "hi"` completely unescaped when no tab/newline is
 *   present, which is looser than strict RFC4180 (observed, not assumed).
 * - When quoting IS triggered, an internal `"` is doubled (`""`) exactly
 *   like CSV (confirmed: a cell with both a tab and a quote round-trips as
 *   `"a\tb say ""hi"""`).
 * - The row separator is CRLF; an embedded newline inside a quoted cell is a
 *   bare LF (never CRLF), matching what a `<td>` with an Alt+Enter line break
 *   produces.
 *
 * Unquoted cell payload is trimmed and quoted payload is preserved, but the
 * TSV rectangle itself is not globally trimmed: boundary TABs encode empty
 * first/last cells and therefore belong to the copied shape.
 */
export function parseTsv(text: string): string[][] {
  if (text.trim().length === 0) {
    return [];
  }

  // Preserve boundary TABs: they encode empty first/last cells in the copied rectangle.
  // Remove only Excel's structural final row separator.
  const source = text.replace(/\r?\n$/u, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let fieldIsQuoted = false;
  let inQuotes = false;

  const flushField = (): void => {
    row.push(fieldIsQuoted ? field : field.trim());
    field = '';
    fieldIsQuoted = false;
  };
  const flushRow = (): void => {
    flushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '' && !fieldIsQuoted) {
      inQuotes = true;
      fieldIsQuoted = true;
      continue;
    }

    if (ch === '\t') {
      flushField();
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    if (ch === '\n') {
      flushRow();
      continue;
    }

    field += ch;
  }

  flushRow(); // final logical row after removing only Excel's structural trailing row separator

  return rows;
}

export async function readTransferValuesFromDataTransfer(
  dataTransfer: PasteDropDataTransferLike,
  source: PasteDropEntrySource,
): Promise<PasteDropTransferReadResult> {
  const clipboardValues: Partial<Record<PasteDropMimeType, string>> = {};

  for (const mimeType of MIME_PRIORITY_BY_SOURCE[source]) {
    const item = dataTransfer.get(mimeType);
    const rawValue = item ? await item.asString() : '';
    const value = mimeType === 'text/plain' ? rawValue : rawValue.trim();
    if (value.trim()) {
      clipboardValues[mimeType] = value;
    }
  }

  return {
    clipboardValues,
    droppedFiles: await readDroppedFiles(dataTransfer),
  };
}

function toTransferCandidate(mimeType: PasteDropMimeType, value?: string): PasteDropCandidate | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return mimeType === 'text/uri-list'
    ? { kind: 'files', value: parseUriList(normalized) }
    : { kind: 'clipboard', value: normalized };
}

function toFilesCandidate(value?: readonly string[]): PasteDropCandidate | undefined {
  return value && value.length > 0 ? { kind: 'files', value } : undefined;
}

function firstSuggestionFromCandidates(candidates: readonly (PasteDropCandidate | undefined)[]): PasteDropSuggestion | null {
  for (const candidate of candidates) {
    const suggestion = suggestEmbedFromCandidate(candidate);
    if (suggestion) {
      return suggestion;
    }
  }

  return null;
}

function suggestEmbedFromCandidate(candidate: PasteDropCandidate | undefined): PasteDropSuggestion | null {
  if (!candidate) {
    return null;
  }

  return candidate.kind === 'clipboard'
    ? suggestEmbedFromClipboardHtml(candidate.value)
    : suggestEmbedFromDroppedFiles(candidate.value);
}

function buildSuggestion(
  source: PasteDropSource,
  filepath: string,
  sheet?: string,
  range?: string,
): PasteDropSuggestion {
  const normalizedPath = normalizePath(filepath);
  const markdown = `![[${normalizedPath}${sheet ? `#${sheet}` : ''}${range ? `|${range}` : ''}]]`;

  return {
    source,
    filepath: normalizedPath,
    ...(sheet ? { sheet } : {}),
    ...(range ? { range } : {}),
    markdown,
  };
}

/**
 * Real Excel range copies were observed (2026-09-11, issue-0114 "Cの完了内容")
 * to place two `<link>` elements in `<head>`, both pointing at a *temporary*
 * HTML-clip staging folder (`...\msohtmlclip<N>\...`), never the source
 * workbook:
 *
 *   <link id=Main-File rel=Main-File href="file:///...\msohtmlclip1\01\clip.htm">
 *   <link rel=File-List href="file:///...\msohtmlclip1\01\clip_filelist.xml">
 *
 * The second one ends in `.xml`, one of MMI's supported extensions, so the
 * previous unconditional regex scan matched it and produced a suggestion
 * pointing at that transient staging file instead of the real workbook --
 * confirmed by replaying an actual captured clipboard payload (not a
 * synthetic fixture) through this function. An exhaustive scan of that same
 * real payload found the true workbook path nowhere else in the HTML either,
 * so "no match" (leading to no suggestion, or a fallback to plain-text paste)
 * is the correct outcome for genuine Excel HTML -- not a guess at the wrong
 * file. `<head>` never carries the copied content itself (that is always in
 * `<body>`), so excluding it removes exactly this class of false positive.
 */
function stripHtmlHead(html: string): string {
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
}

function extractSupportedFilepathFromHtml(html: string): string | undefined {
  const decodedHtml = decodeHtmlEntities(stripHtmlHead(html));
  const matches = decodedHtml.match(/(?:file:\/\/\/[^"'\s<>]+|[A-Za-z]:[\/][^"'<>\s]+|\.\.?\/[^"]+?|\/[^"'<>\s]+?)(?:\.xlsx|\.xls|\.csv|\.xml)/gi);
  if (!matches) {
    return undefined;
  }

  // Defense in depth: even outside <head>, never suggest a path that is
  // self-evidently the HTML-clip staging area rather than a real workbook.
  const realWorkbookMatches = matches.filter((match) => !/msohtmlclip/i.test(match));
  if (realWorkbookMatches.length === 0) {
    return undefined;
  }

  return firstSupportedPath(realWorkbookMatches);
}

function firstSupportedPath(files: readonly string[]): string | undefined {
  return files.map((file) => normalizePath(file)).find((file) => isSupportedWorkbookPath(file));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizePath(filepath: string): string {
  const trimmed = filepath.trim();
  const withoutFileScheme = trimmed.replace(/^file:\/\//i, '');
  const decoded = decodeUriComponentSafely(withoutFileScheme);
  const withForwardSlashes = decoded.replace(/\\/g, '/');
  return withForwardSlashes.replace(/^\/(?:[A-Za-z]:\/)/, (match) => match.slice(1));
}

function decodeUriComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readDroppedFiles(dataTransfer: PasteDropDataTransferLike): Promise<string[]> {
  const filepath = dataTransfer.get(FILES_MIME_TYPE)?.asFile?.()?.uri?.fsPath;
  return filepath ? [filepath] : [];
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith('#'))
    .map((entry) => normalizePath(entry));
}
