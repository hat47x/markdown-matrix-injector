/**
 * Excel copy provenance from the raw Windows clipboard (ADR-0017 option 2).
 * Pure decoding and verification; the platform read is in windowsClipboard.ts.
 *
 * Encodings differ per format and are decoded per format (ADR-0017):
 *   HTML Format        UTF-8 CF_HTML; the path comes from its SourceURL header
 *   Object Descriptor  OBJECTDESCRIPTOR + UTF-16 strings; sheet and address
 *                      come from szSrcOfCopy (`sheet!R5C3:R12C6`)
 *   Link               ANSI -- never used: it corrupts non-ANSI file names
 *
 * Provenance is never proof. A candidate is offered only when
 *   1. the helper's text equals what VS Code received for this paste (same
 *      copy, not a later one), and
 *   2. the source cells at that address, read now from disk, show exactly the
 *      copied values (a filtered copy with hidden rows fails here), and
 *   3. the workbook lies inside a workspace folder.
 * Even then it is only a labelled candidate: the user still chooses (R1).
 */
import path from 'node:path';

import type { SheetSource } from '../core/sheetSource.js';
import { sliceRegion } from '../core/tableGeometry.js';
import { parseTsv } from './pasteDrop.js';

const XL_MAX_ROW = 1_048_576;
const XL_MAX_COL = 16_384;

export interface RawClipboard {
  /** Raw bytes of the registered formats; undefined when absent. */
  html?: Uint8Array;
  objectDescriptor?: Uint8Array;
  /** CF_UNICODETEXT as read by the helper (the TSV Excel published). */
  unicodeText?: string;
}

export interface CopySource {
  /** Absolute path of the source workbook. */
  path: string;
  sheet: string;
  /** A1 range of the copied rectangle. */
  range: string;
}

/**
 * OBJECTDESCRIPTOR: 52-byte struct, then a string heap. dwFullUserTypeName
 * (offset 44) and dwSrcOfCopy (48) are byte offsets from the struct start to
 * NUL-terminated UTF-16 strings, or 0. Every offset is bounds-checked.
 */
export function parseObjectDescriptor(bytes: Uint8Array): { srcOfCopy?: string; userType?: string } | undefined {
  if (bytes.length < 52) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cbSize = view.getUint32(0, true);
  if (cbSize > bytes.length) return undefined;
  const readAt = (offset: number): string | undefined => {
    if (offset === 0 || offset < 52 || offset >= bytes.length || offset % 2 !== 0) return undefined;
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      if (view.getUint16(i, true) === 0) return new TextDecoder('utf-16le').decode(bytes.subarray(offset, i));
    }
    return undefined;
  };
  return { userType: readAt(view.getUint32(44, true)), srcOfCopy: readAt(view.getUint32(48, true)) };
}

/** `sheet!R5C3:R12C6` -> sheet + A1. Sheet names may contain `!`: split at the last one. */
export function parseSrcOfCopy(srcOfCopy: string): { sheet: string; range: string } | undefined {
  const bang = srcOfCopy.lastIndexOf('!');
  if (bang <= 0) return undefined;
  const range = r1c1ToA1(srcOfCopy.slice(bang + 1));
  return range ? { sheet: srcOfCopy.slice(0, bang), range } : undefined;
}

/**
 * R1C1 -> A1. Row-only (`R5:R7`) and column-only (`C3:C4`) forms are
 * rejected -- `C3:C4` would silently read as an A1 range with another meaning.
 */
export function r1c1ToA1(address: string): string | undefined {
  const match = /^R(\d+)C(\d+)(?::R(\d+)C(\d+))?$/u.exec(address);
  if (!match) return undefined;
  const [r1, c1] = [Number(match[1]), Number(match[2])];
  const [r2, c2] = match[3] ? [Number(match[3]), Number(match[4])] : [r1, c1];
  if ([r1, c1, r2, c2].some((n) => !Number.isSafeInteger(n) || n < 1)) return undefined;
  if (r2 > XL_MAX_ROW || c2 > XL_MAX_COL || r2 < r1 || c2 < c1) return undefined;
  const label = (n: number): string => {
    let out = '';
    for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) out = String.fromCharCode(65 + ((v - 1) % 26)) + out;
    return out;
  };
  const start = `${label(c1)}${r1}`;
  return r1 === r2 && c1 === c2 ? start : `${start}:${label(c2)}${r2}`;
}

/** SourceURL from the CF_HTML header (UTF-8), as an absolute local path. */
export function sourcePathFromHtml(html: Uint8Array, platform: NodeJS.Platform = process.platform): string | undefined {
  const text = new TextDecoder('utf-8').decode(html);
  const headerEnd = text.indexOf('<');
  const header = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  const url = /^SourceURL:(.+)$/mu.exec(header)?.[1]?.trim();
  if (!url) return undefined;
  let local = url;
  if (/^file:/iu.test(url)) {
    try {
      local = decodeURIComponent(new URL(url).pathname);
    } catch {
      return undefined;
    }
    if (platform === 'win32' && /^\/[A-Za-z]:/u.test(local)) local = local.slice(1);
  }
  if (platform === 'win32') local = local.replace(/\//gu, '\\');
  return pathFor(platform).isAbsolute(local) && /\.(xlsx|xlsm|xls)$/iu.test(local) ? local : undefined;
}

export function decodeCopySource(raw: RawClipboard, platform: NodeJS.Platform = process.platform): CopySource | undefined {
  if (!raw.html || !raw.objectDescriptor) return undefined;
  const filePath = sourcePathFromHtml(raw.html, platform);
  const descriptor = parseObjectDescriptor(raw.objectDescriptor);
  const where = descriptor?.srcOfCopy ? parseSrcOfCopy(descriptor.srcOfCopy) : undefined;
  return filePath && where ? { path: filePath, ...where } : undefined;
}

/** Path rules of the platform the paths come from (Windows paths stay Windows paths even when tested elsewhere). */
function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function insideFolder(candidate: string, folder: string, platform: NodeJS.Platform): boolean {
  const rules = pathFor(platform);
  const fold = (value: string) => (platform === 'win32' ? value.toLowerCase() : value);
  const relative = rules.relative(fold(folder), fold(candidate));
  return relative.length > 0 && !relative.startsWith('..') && !rules.isAbsolute(relative);
}

export type ProvenanceVerdict =
  | { ok: true; source: CopySource }
  | { ok: false; reason: string };

export interface VerifyDependencies {
  workspaceRoots: readonly string[];
  loadSheet(absolutePath: string, sheet: string): SheetSource | undefined;
  platform?: NodeJS.Platform;
  /** Rejection wording, in the reader language. English references by default. */
  reasons?: ClipboardRejectionPhrases;
}

/**
 * Why a copy is not offered as a labelled source. The host phrases it through
 * `l10n`; the plain caller sees the English reference.
 */
export interface ClipboardRejectionPhrases {
  noSourceOnClipboard(): string;
  mismatchedPaste(): string;
  outsideWorkspace(): string;
  unreadableSource(sheet: string): string;
  changedContents(): string;
}

export const enClipboardRejectionPhrases: ClipboardRejectionPhrases = {
  noSourceOnClipboard: () => 'The copied source is not on the clipboard.',
  mismatchedPaste: () => 'The pasted content does not match the current clipboard content (it may be a different copy).',
  outsideWorkspace: () => 'The copied workbook lies outside the workspace.',
  unreadableSource: (sheet) => `Could not read the copied workbook or its sheet "${sheet}" (it may be unsaved).`,
  changedContents: () => 'The saved workbook contents differ from the copy (unsaved changes, or the copy includes hidden rows or columns).',
};

/** The previous Japanese wording, kept verbatim (the reference the paste flow was checked against). */
export const jaClipboardRejectionPhrases: ClipboardRejectionPhrases = {
  noSourceOnClipboard: () => 'コピー元の情報がクリップボードにありません。',
  mismatchedPaste: () => '貼り付けた内容とクリップボードの現在の内容が一致しません（別のコピーの可能性）。',
  outsideWorkspace: () => 'コピー元のブックがワークスペースの外にあります。',
  unreadableSource: (sheet) => `コピー元のブックまたはシート「${sheet}」を読めません（未保存の可能性）。`,
  changedContents: () => '保存済みの原本の内容がコピーと一致しません（未保存の変更、または非表示の行・列を含むコピー）。',
};

/**
 * All three conditions (same copy, same values at the source, inside the
 * workspace), or a reason. `pastedText` is the text/plain VS Code received.
 */
export function verifyCopySource(
  raw: RawClipboard,
  pastedText: string,
  deps: VerifyDependencies,
): ProvenanceVerdict {
  const reasons = deps.reasons ?? enClipboardRejectionPhrases;
  const source = decodeCopySource(raw, deps.platform);
  if (!source) return { ok: false, reason: reasons.noSourceOnClipboard() };
  const normalize = (text: string) => text.replace(/\r\n/gu, '\n').replace(/\n+$/u, '');
  if (raw.unicodeText === undefined || normalize(raw.unicodeText) !== normalize(pastedText)) {
    return { ok: false, reason: reasons.mismatchedPaste() };
  }
  const platform = deps.platform ?? process.platform;
  const within = deps.workspaceRoots.some((root) => insideFolder(source.path, root, platform));
  if (!within) return { ok: false, reason: reasons.outsideWorkspace() };
  let sheet: SheetSource | undefined;
  try {
    sheet = deps.loadSheet(source.path, source.sheet);
  } catch {
    sheet = undefined;
  }
  if (!sheet) return { ok: false, reason: reasons.unreadableSource(source.sheet) };
  const onDisk = sliceRegion(sheet, source.range);
  const copied = parseTsv(pastedText);
  const same =
    onDisk.length === copied.length &&
    onDisk.every((row, r) => row.length === (copied[r]?.length ?? -1) && row.every((cell, c) => cell === copied[r][c]));
  if (!same) {
    return { ok: false, reason: reasons.changedContents() };
  }
  return { ok: true, source };
}
