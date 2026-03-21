const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.xml'] as const;

type PasteDropSource = 'clipboard-html' | 'file-drop';

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

export interface PasteDropDataTransferItemLike {
  asString(): PromiseLike<string>;
  asFile?(): { uri?: { fsPath: string } } | undefined;
}

export interface PasteDropDataTransferLike {
  get(mimeType: string): PasteDropDataTransferItemLike | undefined;
}

const PASTE_HTML_MIME_TYPES = ['text/html', 'text/plain'] as const;
const DROP_MIME_TYPES = ['text/uri-list', ...PASTE_HTML_MIME_TYPES] as const;
const FILES_MIME_TYPE = 'files';

export function suggestEmbedFromPasteDrop(input: PasteDropInput): PasteDropSuggestion | null {
  const clipboardSuggestion = input.clipboardHtml
    ? suggestEmbedFromClipboardHtml(input.clipboardHtml)
    : null;

  if (clipboardSuggestion) {
    return clipboardSuggestion;
  }

  return suggestEmbedFromDroppedFiles(input.droppedFiles ?? []);
}

export async function suggestEmbedFromDataTransfer(
  dataTransfer: PasteDropDataTransferLike,
  source: 'paste' | 'drop',
): Promise<PasteDropSuggestion | null> {
  const mimeTypes = source === 'drop' ? DROP_MIME_TYPES : PASTE_HTML_MIME_TYPES;

  for (const mimeType of mimeTypes) {
    const item = dataTransfer.get(mimeType);
    const value = item ? await item.asString() : undefined;

    if (!value) {
      continue;
    }

    const suggestion = mimeType === 'text/uri-list'
      ? suggestEmbedFromDroppedFiles(parseUriList(value))
      : suggestEmbedFromClipboardHtml(value);

    if (suggestion) {
      return suggestion;
    }
  }

  return suggestEmbedFromDroppedFiles(await readDroppedFiles(dataTransfer));
}

export function suggestEmbedFromClipboardHtml(html: string): PasteDropSuggestion | null {
  const filepath = extractSupportedFilepathFromHtml(html);

  if (!filepath) {
    return null;
  }

  const sheet = extractSheetNameFromHtml(html);
  const range = inferRangeFromHtmlTable(html);

  return buildSuggestion('clipboard-html', filepath, sheet, range);
}

export function suggestEmbedFromDroppedFiles(files: readonly string[]): PasteDropSuggestion | null {
  const filepath = files.find((file) => isSupportedWorkbookPath(file));

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
  const matches = decodedHtml.match(/(?:file:\/\/\/[^"'\s<>]+|[A-Za-z]:[\\/][^"'<>\s]+|\.\.?\/[^"]+?|\/[^"'<>\s]+?)(?:\.xlsx|\.xls|\.csv|\.xml)/gi);

  if (!matches) {
    return undefined;
  }

  const filepath = matches.find((candidate) => isSupportedWorkbookPath(candidate));
  return filepath ? normalizePath(filepath) : undefined;
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
  const filesItem = dataTransfer.get(FILES_MIME_TYPE);
  const filepath = filesItem?.asFile?.()?.uri?.fsPath;
  return filepath ? [filepath] : [];
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith('#'))
    .map((entry) => normalizePath(entry));
}
