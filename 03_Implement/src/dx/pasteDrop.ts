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

export function suggestEmbedFromClipboardHtml(html: string): PasteDropSuggestion | null {
  const normalizedHtml = html.trim();
  if (!normalizedHtml) {
    return null;
  }

  const filepath = extractSupportedFilepathFromHtml(normalizedHtml);
  if (!filepath) {
    return null;
  }

  const sheet = extractSheetNameFromHtml(normalizedHtml);
  const range = inferRangeFromHtmlTable(normalizedHtml);
  return buildSuggestion('clipboard-html', filepath, sheet, range);
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

export function inferRangeFromHtmlTable(html: string): string | undefined {
  const rowMatches = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) {
    return undefined;
  }

  const rowCount = rowMatches.length;
  let maxColumnCount = 0;

  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[1].matchAll(/<(td|th)\b[^>]*?(?:colspan=(?:"(\d+)"|'(\d+)'|(\d+)))?[^>]*>/gi)];
    const columnCount = cells.reduce((total, cellMatch) => {
      const colspan = Number.parseInt(cellMatch[2] ?? cellMatch[3] ?? cellMatch[4] ?? '1', 10);
      return total + (Number.isNaN(colspan) ? 1 : Math.max(colspan, 1));
    }, 0);

    maxColumnCount = Math.max(maxColumnCount, columnCount);
  }

  if (rowCount <= 0 || maxColumnCount <= 0) {
    return undefined;
  }

  return `A1:${columnNumberToLabel(maxColumnCount)}${rowCount}`;
}

export async function readTransferValuesFromDataTransfer(
  dataTransfer: PasteDropDataTransferLike,
  source: PasteDropEntrySource,
): Promise<PasteDropTransferReadResult> {
  const clipboardValues: Partial<Record<PasteDropMimeType, string>> = {};

  for (const mimeType of MIME_PRIORITY_BY_SOURCE[source]) {
    const item = dataTransfer.get(mimeType);
    const value = item ? (await item.asString()).trim() : '';
    if (value) {
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

function extractSupportedFilepathFromHtml(html: string): string | undefined {
  const decodedHtml = decodeHtmlEntities(html);
  const matches = decodedHtml.match(/(?:file:\/\/\/[^"'\s<>]+|[A-Za-z]:[\/][^"'<>\s]+|\.\.?\/[^"]+?|\/[^"'<>\s]+?)(?:\.xlsx|\.xls|\.csv|\.xml)/gi);
  if (!matches) {
    return undefined;
  }

  return firstSupportedPath(matches);
}

function extractSheetNameFromHtml(html: string): string | undefined {
  const decodedHtml = decodeHtmlEntities(html);
  const patterns = [
    /data-sheet=(?:"([^"]+)"|'([^']+)')/i,
    /(?:sheet|worksheet|tab)=(?:"([^"]+)"|'([^']+)')/i,
    /<title>([^<]+)<\/title>/i,
  ];

  for (const pattern of patterns) {
    const match = decodedHtml.match(pattern);
    const value = match?.[1] ?? match?.[2];
    if (value) {
      return value.trim();
    }
  }

  return undefined;
}

function firstSupportedPath(files: readonly string[]): string | undefined {
  return files.map((file) => normalizePath(file)).find((file) => isSupportedWorkbookPath(file));
}

function columnNumberToLabel(columnNumber: number): string {
  let value = columnNumber;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
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
