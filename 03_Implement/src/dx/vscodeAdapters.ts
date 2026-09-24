import { parameterIssues } from './parameterDiagnostics.js';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { type AutocompleteCandidate } from './autocompleteProvider.js';
import { validateEmbedDiagnostics, type EmbedDiagnostic, type XmlMode } from './diagnostics.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';
import { isPathWithinBoundary } from '../core/pathResolver.js';
import {
  readTransferValuesFromDataTransfer,
  suggestEmbedFromTransferValues,
  type PasteDropDataTransferLike,
} from './pasteDrop.js';

const EMBED_PATTERN = /!\[\[([^\]]+)\]\]/g;
const XML_SPREADSHEET_SIGNATURES = ['<?mso-application progid="Excel.Sheet"?>', '<Workbook'];
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const SOURCE_METADATA_NEWLINE_BOUNDARY_PATTERN = /\s*\n\s*/g;
const SOURCE_METADATA_MARKDOWN_ESCAPE_PATTERN = /([\\`*_{}\[\]])/g;
export interface PasteDropCommandArgs {
  clipboardHtml?: string;
  droppedFiles?: readonly string[];
}

export interface CompletionItemData {
  label: string;
  insertText: string;
  kind: 'file' | 'sheet' | 'range' | 'query-param';
}

export interface PositionLike {
  line: number;
  character: number;
}

export interface RangeLike {
  start: PositionLike;
  end: PositionLike;
}

export interface ResolvedWorkbookReference {
  rawFilepath: string;
  resolvedFilepath: string;
  target?: string;
}

export interface DataTransferItemLike {
  asString(): PromiseLike<string>;
  asFile?(): { uri?: { fsPath: string } } | undefined;
}

export interface DataTransferLike {
  get(mimeType: string): DataTransferItemLike | undefined;
}

interface EmbedMatch {
  raw: string;
  filepath: string;
  target?: string;
  absoluteStart: number;
}

interface DiagnosticsDependencies {
  fileExists(filepath: string): Promise<boolean>;
  readFile(filepath: string): Promise<Uint8Array | Buffer | string>;
  readWorkbookSheetNames(filepath: string): Promise<readonly string[]>;
}

export interface DocumentDiagnosticItem {
  diagnostic: EmbedDiagnostic;
  range: RangeLike;
}

export interface QueryEvidenceRecord {
  index: number;
  filepath: string;
  target: string;
  range: string;
  query: string;
  raw: string;
}

export function getTextBeforePosition(documentText: string, positionCharacter: number): string {
  return documentText.slice(0, positionCharacter);
}

export function toRelativeSuggestion(markdownFilePath: string, candidatePath: string): string {
  const relativePath = path.relative(path.dirname(markdownFilePath), candidatePath).replace(/\\/g, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

export function resolveWorkbookReference(
  input: string,
  markdownFilePath: string,
  workspaceRoot?: string,
): ResolvedWorkbookReference | undefined {
  const embedMatch = getLastEmbedMatch(input);
  if (!embedMatch) {
    return undefined;
  }

  const rawFilepath = embedMatch.filepath.trim();
  if (!rawFilepath) {
    return undefined;
  }

  return {
    rawFilepath,
    resolvedFilepath: resolveWorkbookPath(rawFilepath, markdownFilePath, workspaceRoot),
    ...(embedMatch.target ? { target: embedMatch.target } : {}),
  };
}

export function buildCompletionItems(candidates: readonly AutocompleteCandidate[]): CompletionItemData[] {
  return candidates.map((candidate) => ({
    label: candidate.label,
    insertText: candidate.insertText,
    kind: candidate.kind,
  }));
}

export async function createDiagnosticsForDocument(
  text: string,
  markdownFilePath: string,
  workspaceRoot: string | undefined,
  dependencies: DiagnosticsDependencies,
): Promise<DocumentDiagnosticItem[]> {
  const matches = [...findEmbedMatches(text)];
  const diagnostics: DocumentDiagnosticItem[] = [];

  for (const match of matches) {
    const resolvedCandidates = resolveWorkbookPathCandidates(match.filepath, markdownFilePath, workspaceRoot);
    let resolvedFilepath = resolvedCandidates[0] ?? match.filepath;
    let fileExists = false;

    for (const candidate of resolvedCandidates) {
      if (await dependencies.fileExists(candidate)) {
        resolvedFilepath = candidate;
        fileExists = true;
        break;
      }
    }

    // Check containment (spec P4): file may exist on disk but lie outside the
    // workspace boundary (e.g. ../../../../etc/hosts).  Report proactively in
    // the Problems panel so the user sees it before opening the preview.
    let containmentOk: boolean | undefined;
    if (fileExists) {
      const boundary = workspaceRoot
        ? path.resolve(workspaceRoot)
        : path.resolve(path.dirname(markdownFilePath));
      let checkPath = resolvedFilepath;
      try { checkPath = fs.realpathSync(resolvedFilepath); } catch { /* best-effort */ }
      containmentOk = isPathWithinBoundary(checkPath, boundary);
    }

    const xmlMode = fileExists ? await detectXmlMode(resolvedFilepath, dependencies) : 'none';
    const sheetExists = fileExists && match.target ? await hasSheet(resolvedFilepath, match.target, dependencies) : undefined;
    const embedDiagnostics = validateEmbedDiagnostics({
      query: {
        raw: match.raw,
        filepath: match.filepath,
        ...(match.target ? { target: match.target } : {}),
      },
      fileExists,
      sheetExists,
      xmlMode,
      containmentOk,
      range: { start: 0, end: Math.max(match.raw.length - 1, 0) },
    });

    for (const diagnostic of embedDiagnostics) {
      diagnostics.push({
        diagnostic,
        range: rangeFromOffsets(text, match.absoluteStart + diagnostic.range.start, match.absoluteStart + diagnostic.range.end + 1),
      });
    }

    // Values the renderer would silently ignore, and likely-misspelt keys.
    for (const issue of parameterIssues(match.raw)) {
      diagnostics.push({
        diagnostic: {
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          range: { start: issue.start, end: Math.max(issue.start, issue.end - 1) },
          source: 'markdown-matrix-injector',
          priority: issue.code === 'MMI_INVALID_PARAM_VALUE' ? 3 : 4,
        },
        range: rangeFromOffsets(text, match.absoluteStart + issue.start, match.absoluteStart + Math.max(issue.start + 1, issue.end)),
      });
    }
  }

  return diagnostics;
}

export function getPasteInsertText(args?: PasteDropCommandArgs): string | undefined {
  if (!args?.clipboardHtml) {
    return undefined;
  }

  return suggestEmbedFromTransferValues('paste', {
    clipboardValues: { 'text/html': args.clipboardHtml },
  })?.markdown;
}

export function getDropInsertText(args?: PasteDropCommandArgs): string | undefined {
  if (!args?.droppedFiles) {
    return undefined;
  }

  return suggestEmbedFromTransferValues('drop', {
    droppedFiles: args.droppedFiles,
  })?.markdown;
}

export async function getPasteInsertTextFromDataTransfer(dataTransfer: DataTransferLike): Promise<string | undefined> {
  const pasteDropTransfer = toPasteDropDataTransfer(dataTransfer);
  return suggestEmbedFromTransferValues(
    'paste',
    await readTransferValuesFromDataTransfer(pasteDropTransfer, 'paste'),
  )?.markdown;
}

export async function getDropInsertTextFromDataTransfer(dataTransfer: DataTransferLike): Promise<string | undefined> {
  const pasteDropTransfer = toPasteDropDataTransfer(dataTransfer);
  return suggestEmbedFromTransferValues(
    'drop',
    await readTransferValuesFromDataTransfer(pasteDropTransfer, 'drop'),
  )?.markdown;
}

export async function getPasteEditFromDataTransfer<T>(
  dataTransfer: DataTransferLike,
  options: { createEdit(insertText: string): T },
): Promise<T | undefined> {
  const insertText = await getPasteInsertTextFromDataTransfer(dataTransfer);
  return insertText ? options.createEdit(insertText) : undefined;
}

export async function getDropEditFromDataTransfer<T>(
  dataTransfer: DataTransferLike,
  options: { createEdit(insertText: string): T },
): Promise<T | undefined> {
  const insertText = await getDropInsertTextFromDataTransfer(dataTransfer);
  return insertText ? options.createEdit(insertText) : undefined;
}

export function resolveWorkbookPath(rawFilepath: string, markdownFilePath: string, workspaceRoot?: string): string {
  return resolveWorkbookPathCandidates(rawFilepath, markdownFilePath, workspaceRoot)[0] ?? rawFilepath;
}

function resolveWorkbookPathCandidates(rawFilepath: string, markdownFilePath: string, workspaceRoot?: string): string[] {
  if (path.isAbsolute(rawFilepath)) {
    return [rawFilepath];
  }

  const candidates = [path.resolve(path.dirname(markdownFilePath), rawFilepath)];
  if (workspaceRoot) {
    candidates.push(path.resolve(workspaceRoot, rawFilepath));
  }

  return [...new Set(candidates)];
}

export function collectQueryEvidenceRecords(text: string): QueryEvidenceRecord[] {
  return extractEmbedQueries(text).map((embed, index) => ({
    index: index + 1,
    filepath: embed.filepath,
    target: embed.target ?? '',
    range: embed.range ?? '',
    query: embed.params.toString(),
    raw: embed.raw,
  }));
}

export function buildQueryEvidenceCsv(records: readonly QueryEvidenceRecord[]): string {
  const header = ['index', 'filepath', 'target', 'range', 'query', 'raw'];
  const rows = records.map((record) => [
    record.index.toString(),
    record.filepath,
    record.target,
    record.range,
    record.query,
    record.raw,
  ]);

  return [header, ...rows]
    .map((columns) => columns.map((column) => escapeCsvColumn(column)).join(','))
    .join('\n');
}

export function buildQueryEvidenceJson(records: readonly QueryEvidenceRecord[]): string {
  return JSON.stringify(records, null, 2);
}

export function buildQueryEvidenceMarkdown(
  records: readonly QueryEvidenceRecord[],
  options?: { sourceName?: string },
): string {
  const hasSourceName = options !== undefined && Object.prototype.hasOwnProperty.call(options, 'sourceName');
  const sourceLine = hasSourceName ? `- Source: ${formatSourceNameForMarkdownMetadata(String(options.sourceName ?? ''))}` : undefined;
  if (records.length === 0) {
    return ['## Query Evidence Report', '', ...(sourceLine ? [sourceLine] : []), '- Total records: 0', '', '_No evidence records found._'].join('\n');
  }

  const header = ['index', 'filepath', 'target', 'range', 'query', 'raw'];
  const divider = ['---', '---', '---', '---', '---', '---'];
  const rows = records.map((record) => [
    record.index.toString(),
    record.filepath,
    record.target || '-',
    record.range || '-',
    record.query || '-',
    record.raw,
  ]);

  const table = [header, divider, ...rows]
    .map((columns) => `| ${columns.map((column) => escapeMarkdownTableColumn(column)).join(' | ')} |`)
    .join('\n');

  return ['## Query Evidence Report', '', ...(sourceLine ? [sourceLine] : []), `- Total records: ${records.length}`, '', table].join('\n');
}

function formatSourceNameForMarkdownMetadata(sourceName: string): string {
  const normalized = sourceName
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replaceAll('\t', ' ')
    .replaceAll(/\r\n/g, '\n')
    .replaceAll(/\r/g, '\n')
    .replaceAll(SOURCE_METADATA_NEWLINE_BOUNDARY_PATTERN, ' ')
    .trim();
  const nonEmpty = normalized.length > 0 ? normalized : 'unknown-source';
  return escapeMarkdownMetadataText(nonEmpty);
}

function escapeMarkdownMetadataText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(SOURCE_METADATA_MARKDOWN_ESCAPE_PATTERN, '\\$1');
}

export function buildQueryEvidenceOutputPaths(markdownFilePath: string): {
  csvOutputPath: string;
  jsonOutputPath: string;
  markdownOutputPath: string;
} {
  const useWindowsPath = markdownFilePath.includes('\\');
  const pathApi = useWindowsPath ? path.win32 : path;
  const outputDirectory = getQueryEvidenceOutputDirectory(markdownFilePath);
  const sourceBasename = getQueryEvidenceSourceBasename(markdownFilePath);
  const safeBasename = normalizeQueryEvidenceBasename(sourceBasename);
  const outputFilenamePrefix = `${safeBasename}.query-evidence`;

  return {
    csvOutputPath: pathApi.join(outputDirectory, `${outputFilenamePrefix}.csv`),
    jsonOutputPath: pathApi.join(outputDirectory, `${outputFilenamePrefix}.json`),
    markdownOutputPath: pathApi.join(outputDirectory, `${outputFilenamePrefix}.md`),
  };
}

function normalizeQueryEvidenceBasename(sourceBasename: string): string {
  const normalized = sourceBasename
    .replaceAll(/[^\p{L}\p{N}_-]/gu, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
  const nonEmpty = normalized.length > 0 ? normalized : 'markdown';
  const reservedSafe = WINDOWS_RESERVED_BASENAME_PATTERN.test(nonEmpty) ? `${nonEmpty}-file` : nonEmpty;

  if (reservedSafe.length <= 64) {
    return reservedSafe;
  }

  const hashSuffix = createHash('sha1').update(reservedSafe).digest('hex').slice(0, 6);
  const cappedPrefix = reservedSafe.slice(0, 57).replaceAll(/-$/g, '');
  const capped = `${cappedPrefix}-${hashSuffix}`.replaceAll(/^-|-$/g, '');

  return capped.length > 0 ? capped : 'markdown';
}

export function buildQueryEvidenceExportArtifacts(markdownText: string, markdownFilePath: string): {
  sourceName: string;
  records: QueryEvidenceRecord[];
  csvText: string;
  jsonText: string;
  markdownReportText: string;
  csvOutputPath: string;
  jsonOutputPath: string;
  markdownOutputPath: string;
} {
  const records = collectQueryEvidenceRecords(markdownText);
  const sourceBasename = getQueryEvidenceSourceBasename(markdownFilePath);
  const { csvOutputPath, jsonOutputPath, markdownOutputPath } = buildQueryEvidenceOutputPaths(markdownFilePath);

  return {
    sourceName: sourceBasename,
    records,
    csvText: buildQueryEvidenceCsv(records),
    jsonText: buildQueryEvidenceJson(records),
    markdownReportText: buildQueryEvidenceMarkdown(records, { sourceName: sourceBasename }),
    csvOutputPath,
    jsonOutputPath,
    markdownOutputPath,
  };
}

function getQueryEvidenceSourceBasename(markdownFilePath: string): string {
  return markdownFilePath.includes('\\')
    ? path.win32.basename(markdownFilePath, path.win32.extname(markdownFilePath))
    : path.basename(markdownFilePath, path.extname(markdownFilePath));
}

function getQueryEvidenceOutputDirectory(markdownFilePath: string): string {
  return markdownFilePath.includes('\\') ? path.win32.dirname(markdownFilePath) : path.dirname(markdownFilePath);
}

function* findEmbedMatches(text: string): Iterable<EmbedMatch> {
  for (const match of text.matchAll(EMBED_PATTERN)) {
    const raw = match[0];
    const rawBody = match[1] ?? '';
    const [fileAndTarget] = rawBody.split('?', 1)[0].split('|', 1);
    const [filepath, target] = fileAndTarget.split('#', 2);

    yield {
      raw,
      filepath,
      ...(target ? { target } : {}),
      absoluteStart: match.index ?? 0,
    };
  }
}

function getLastEmbedMatch(input: string): EmbedMatch | undefined {
  const matches = [...findEmbedMatches(`${input}]]`)];
  return matches.at(-1);
}

async function detectXmlMode(filepath: string, dependencies: DiagnosticsDependencies): Promise<XmlMode> {
  if (!filepath.toLowerCase().endsWith('.xml')) {
    return 'none';
  }

  const fileContents = await dependencies.readFile(filepath);
  const text = typeof fileContents === 'string' ? fileContents : Buffer.from(fileContents).toString('utf8');
  return XML_SPREADSHEET_SIGNATURES.some((signature) => text.includes(signature)) ? 'spreadsheet2003' : 'invalid';
}

async function hasSheet(filepath: string, target: string, dependencies: DiagnosticsDependencies): Promise<boolean> {
  try {
    const sheetNames = await dependencies.readWorkbookSheetNames(filepath);
    return sheetNames.includes(target);
  } catch {
    return false;
  }
}

function toPasteDropDataTransfer(dataTransfer: DataTransferLike): PasteDropDataTransferLike {
  return {
    get(mimeType: string) {
      return dataTransfer.get(mimeType);
    },
  };
}

function rangeFromOffsets(text: string, startOffset: number, endOffset: number): RangeLike {
  return {
    start: positionAt(text, startOffset),
    end: positionAt(text, endOffset),
  };
}

function positionAt(text: string, offset: number): PositionLike {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, safeOffset);
  const lines = prefix.split('\n');
  return {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  };
}

function escapeCsvColumn(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function escapeMarkdownTableColumn(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
