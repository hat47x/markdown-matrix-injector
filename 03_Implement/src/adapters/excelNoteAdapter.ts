/**
 * Source Adapter: classic Excel cell comments / Notes from .xlsx/.xlsm.
 *
 * Classic Notes are explicit OOXML source facts: a worksheet has a comments
 * relationship, and the comments part states the cell reference, author id
 * and rich-text payload. This adapter does not interpret what the note means.
 *
 * Threaded comments are a different source model and are deliberately not
 * coerced into classic Notes.
 */
import { createHash } from 'node:crypto';

import type { Candidate, Claim } from '../core/candidate.js';
import {
  candidateProblem,
  fingerprintOf,
} from '../core/candidate.js';
import {
  readZip,
  ZipError,
  type ZipEntry,
} from '../core/zipReader.js';

export const NOTE_ADAPTER_ALGORITHM = 'mmi.excel-classic-note-reader';
export const NOTE_ADAPTER_VERSION = '1';

export type NoteDiagnosticCode =
  | 'MMI_NOTE_PACKAGE_UNREADABLE'
  | 'MMI_NOTE_COMMENTS_EXTERNAL'
  | 'MMI_NOTE_COMMENTS_MISSING'
  | 'MMI_NOTE_COMMENTS_UNREADABLE'
  | 'MMI_NOTE_AUTHOR_MISSING'
  | 'MMI_NOTE_THREADED_UNSUPPORTED';

export interface NoteDiagnostic {
  code: NoteDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  sheet?: string;
  part?: string;
  cell?: string;
}

export interface ExcelNote {
  ordinal: number;
  sheet: string;
  cell: string;
  author?: string;
  text: string;
  commentsPart: string;
  /** Digest of author + note text, independent of cell location. */
  contentDigest: string;
}

export interface NoteReadResult {
  notes: ExcelNote[];
  diagnostics: NoteDiagnostic[];
}

export const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(
      /&#x([0-9a-f]+);/giu,
      (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(
      /&#(\d+);/gu,
      (_match, decimal: string) => String.fromCodePoint(Number(decimal)),
    )
    .replace(/&amp;/gu, '&');

export function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (
    const match of tag.matchAll(
      /([\w:.-]+)\s*=\s*"([^"]*)"/gu,
    )
  ) {
    result[match[1]] = decodeEntities(match[2]);
  }
  return result;
}

export const entryText = (entry: ZipEntry): string =>
  entry.read().toString('utf8').replace(/^﻿/u, '');

function resolveTarget(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = ownerPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') base.pop();
    else if (segment !== '.' && segment !== '') base.push(segment);
  }
  return base.join('/');
}

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

export function relationshipsOf(
  zip: Map<string, ZipEntry>,
  part: string,
): Relationship[] {
  const segments = part.split('/');
  const file = segments.pop() ?? '';
  const directory = segments.join('/');
  const rels = zip.get(
    `${directory ? `${directory}/` : ''}_rels/${file}.rels`,
  );
  if (!rels) return [];
  return [
    ...entryText(rels).matchAll(
      /<(?:\w+:)?Relationship\b[^>]*>/gu,
    ),
  ].map((match) => {
    const props = attributes(match[0]);
    const external = props.TargetMode === 'External';
    return {
      id: props.Id ?? '',
      type: props.Type ?? '',
      target: external
        ? props.Target ?? ''
        : resolveTarget(part, props.Target ?? ''),
      external,
    };
  });
}

export function workbookSheets(
  zip: Map<string, ZipEntry>,
): Array<{ name: string; part: string }> {
  const workbook = zip.get('xl/workbook.xml');
  if (!workbook) return [];
  const rels = new Map(
    relationshipsOf(zip, 'xl/workbook.xml').map(
      (relationship) => [relationship.id, relationship.target],
    ),
  );
  const result: Array<{ name: string; part: string }> = [];
  for (
    const match of entryText(workbook).matchAll(
      /<(?:\w+:)?sheet\b[^>]*>/gu,
    )
  ) {
    const props = attributes(match[0]);
    const relationshipId = Object.entries(props).find(
      ([key]) => key === 'r:id' || key.endsWith(':id'),
    )?.[1];
    const part = relationshipId
      ? rels.get(relationshipId)
      : undefined;
    if (props.name && part) {
      result.push({ name: props.name, part });
    }
  }
  return result;
}

function richText(block: string): string {
  return [
    ...block.matchAll(
      /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gu,
    ),
  ].map((match) => decodeEntities(match[1])).join('');
}

function contentDigest(author: string | undefined, text: string): string {
  return `sha256:${createHash('sha256')
    .update(author ?? '', 'utf8')
    .update('\u0000', 'utf8')
    .update(text, 'utf8')
    .digest('hex')}`;
}

/**
 * Read classic cell Notes from one OOXML package.
 *
 * Malformed or missing comments parts are reported per sheet and do not stop
 * other sheets from being inspected.
 */
export function readExcelNotes(bytes: Uint8Array): NoteReadResult {
  const result: NoteReadResult = { notes: [], diagnostics: [] };
  let zip: Map<string, ZipEntry>;
  try {
    zip = readZip(bytes);
  } catch (error) {
    result.diagnostics.push({
      code: 'MMI_NOTE_PACKAGE_UNREADABLE',
      severity: 'error',
      message: error instanceof ZipError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error),
    });
    return result;
  }

  for (const sheet of workbookSheets(zip)) {
    let relationships: Relationship[];
    try {
      relationships = relationshipsOf(zip, sheet.part);
    } catch (error) {
      result.diagnostics.push({
        code: 'MMI_NOTE_COMMENTS_UNREADABLE',
        severity: 'warning',
        sheet: sheet.name,
        part: sheet.part,
        message:
          `worksheet relationships: ${error instanceof Error
            ? error.message
            : String(error)}`,
      });
      continue;
    }

    const threaded = relationships.filter(
      (relationship) =>
        /\/threadedComments?$/iu.test(relationship.type)
        || relationship.type.includes('/threadedComment'),
    );
    for (const relationship of threaded) {
      result.diagnostics.push({
        code: 'MMI_NOTE_THREADED_UNSUPPORTED',
        severity: 'warning',
        sheet: sheet.name,
        part: relationship.target,
        message:
          'threaded comments use a different source model and are not exposed as classic Note Candidates',
      });
    }

    const commentsRelationships = relationships.filter(
      (relationship) => /\/comments$/iu.test(relationship.type),
    );
    for (const relationship of commentsRelationships) {
      if (relationship.external) {
        result.diagnostics.push({
          code: 'MMI_NOTE_COMMENTS_EXTERNAL',
          severity: 'warning',
          sheet: sheet.name,
          part: relationship.target,
          message: 'external comments parts are not read',
        });
        continue;
      }
      const entry = zip.get(relationship.target);
      if (!entry) {
        result.diagnostics.push({
          code: 'MMI_NOTE_COMMENTS_MISSING',
          severity: 'warning',
          sheet: sheet.name,
          part: relationship.target,
          message:
            `comments part ${relationship.target} is missing from the package`,
        });
        continue;
      }

      let xml: string;
      try {
        xml = entryText(entry);
      } catch (error) {
        result.diagnostics.push({
          code: 'MMI_NOTE_COMMENTS_UNREADABLE',
          severity: 'warning',
          sheet: sheet.name,
          part: relationship.target,
          message: error instanceof Error
            ? error.message
            : String(error),
        });
        continue;
      }
      if (
        !/<(?:\w+:)?comments\b/u.test(xml)
        || !/<\/(?:\w+:)?comments>\s*$/u.test(xml)
      ) {
        result.diagnostics.push({
          code: 'MMI_NOTE_COMMENTS_UNREADABLE',
          severity: 'warning',
          sheet: sheet.name,
          part: relationship.target,
          message: 'comments XML is not a complete classic comments part',
        });
        continue;
      }

      const authorsBlock = /<(?:\w+:)?authors\b[^>]*>([\s\S]*?)<\/(?:\w+:)?authors>/u
        .exec(xml)?.[1] ?? '';
      const authors = [
        ...authorsBlock.matchAll(
          /<(?:\w+:)?author\b[^>]*>([\s\S]*?)<\/(?:\w+:)?author>/gu,
        ),
      ].map((match) => decodeEntities(match[1]));

      const commentList = /<(?:\w+:)?commentList\b[^>]*>([\s\S]*?)<\/(?:\w+:)?commentList>/u
        .exec(xml)?.[1] ?? '';
      for (
        const match of commentList.matchAll(
          /<(?:\w+:)?comment\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?comment>/gu,
        )
      ) {
        const props = attributes(`<comment ${match[1]}>`);
        const cell = props.ref?.trim();
        if (!cell) {
          result.diagnostics.push({
            code: 'MMI_NOTE_COMMENTS_UNREADABLE',
            severity: 'warning',
            sheet: sheet.name,
            part: relationship.target,
            message: 'classic comment has no cell ref',
          });
          continue;
        }
        const authorId = props.authorId !== undefined
          ? Number(props.authorId)
          : undefined;
        const author = authorId !== undefined
          && Number.isInteger(authorId)
          && authorId >= 0
          ? authors[authorId]
          : undefined;
        if (props.authorId !== undefined && author === undefined) {
          result.diagnostics.push({
            code: 'MMI_NOTE_AUTHOR_MISSING',
            severity: 'warning',
            sheet: sheet.name,
            part: relationship.target,
            cell,
            message:
              `Note ${cell} refers to missing authorId ${props.authorId}`,
          });
        }
        const textBlock = /<(?:\w+:)?text\b[^>]*>([\s\S]*?)<\/(?:\w+:)?text>/u
          .exec(match[2])?.[1] ?? '';
        const noteText = richText(textBlock);
        result.notes.push({
          ordinal: result.notes.length + 1,
          sheet: sheet.name,
          cell,
          ...(author !== undefined ? { author } : {}),
          text: noteText,
          commentsPart: relationship.target,
          contentDigest: contentDigest(author, noteText),
        });
      }
    }
  }

  return result;
}

export interface NoteCandidateInput {
  source: string;
  sourceDigest: string;
  notes: readonly ExcelNote[];
}

export function noteCandidates(input: NoteCandidateInput): Candidate[] {
  return input.notes.map((note) => {
    const observed = (
      aspect: string,
      value: Claim['value'],
      reasonCode: string,
    ): Claim => ({
      aspect,
      value,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode,
    });
    const claims: Claim[] = [
      observed('location', note.cell, 'classic-comment-ref'),
      observed('text', note.text, 'classic-comment-text'),
      observed(
        'text-length',
        String(note.text.length),
        'classic-comment-text-length',
      ),
      observed(
        'comments-part',
        note.commentsPart,
        'worksheet-comments-relationship',
      ),
    ];
    if (note.author !== undefined) {
      claims.push(
        observed('author', note.author, 'classic-comment-author'),
      );
    }

    const candidate: Candidate = {
      kind: 'note',
      locator: {
        source: input.source,
        sourceDigest: input.sourceDigest,
        sheet: note.sheet,
        range: note.cell,
      },
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      claims,
      provenance: {
        algorithm: NOTE_ADAPTER_ALGORITHM,
        run: {
          execution: 'deterministic',
          inputDigest: input.sourceDigest,
          config: { sourceModel: 'ooxml-classic-comments' },
          implementationVersion: NOTE_ADAPTER_VERSION,
        },
      },
      fingerprint: fingerprintOf(
        'excel-classic-note-author-text-v1',
        `${note.author ?? ''}\u0000${note.text}`,
      ),
      scores: [],
    };
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `invalid Note Candidate at ${note.sheet}!${note.cell}: ${problem}`,
      );
    }
    return candidate;
  });
}
