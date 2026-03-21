import path from 'node:path';
import { type AutocompleteCandidate } from './autocompleteProvider.js';
import { validateEmbedDiagnostics, type EmbedDiagnostic, type XmlMode } from './diagnostics.js';
import {
  suggestEmbedFromDataTransfer,
  suggestEmbedFromPasteDrop,
  type PasteDropDataTransferItemLike,
} from './pasteDrop.js';

const EMBED_PATTERN = /!\[\[([^\]]+)\]\]/g;
const XML_SPREADSHEET_SIGNATURES = ['<?mso-application progid="Excel.Sheet"?>', '<Workbook'];
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
    const resolvedFilepath = resolveWorkbookPath(match.filepath, markdownFilePath, workspaceRoot);
    const fileExists = await dependencies.fileExists(resolvedFilepath);
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
      range: { start: 0, end: Math.max(match.raw.length - 1, 0) },
    });

    for (const diagnostic of embedDiagnostics) {
      diagnostics.push({
        diagnostic,
        range: rangeFromOffsets(text, match.absoluteStart + diagnostic.range.start, match.absoluteStart + diagnostic.range.end + 1),
      });
    }
  }

  return diagnostics;
}

export function getPasteInsertText(args?: PasteDropCommandArgs): string | undefined {
  return args?.clipboardHtml ? suggestEmbedFromPasteDrop({ clipboardHtml: args.clipboardHtml })?.markdown : undefined;
}

export function getDropInsertText(args?: PasteDropCommandArgs): string | undefined {
  return args?.droppedFiles ? suggestEmbedFromPasteDrop({ droppedFiles: args.droppedFiles })?.markdown : undefined;
}

export async function getPasteInsertTextFromDataTransfer(dataTransfer: DataTransferLike): Promise<string | undefined> {
  return (await suggestEmbedFromDataTransfer(toPasteDropDataTransfer(dataTransfer), 'paste'))?.markdown;
}

export async function getDropInsertTextFromDataTransfer(dataTransfer: DataTransferLike): Promise<string | undefined> {
  return (await suggestEmbedFromDataTransfer(toPasteDropDataTransfer(dataTransfer), 'drop'))?.markdown;
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
  if (path.isAbsolute(rawFilepath)) {
    return rawFilepath;
  }

  const relativeToDocument = path.resolve(path.dirname(markdownFilePath), rawFilepath);
  return workspaceRoot ? relativeToDocument : relativeToDocument;
}

function* findEmbedMatches(text: string): Iterable<EmbedMatch> {
  for (const match of text.matchAll(EMBED_PATTERN)) {
    const raw = match[0];
    const rawBody = match[1] ?? '';
    const [fileAndTarget] = rawBody.split('|', 1);
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

function toPasteDropDataTransfer(dataTransfer: DataTransferLike) {
  return {
    get(mimeType: string): PasteDropDataTransferItemLike | undefined {
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
