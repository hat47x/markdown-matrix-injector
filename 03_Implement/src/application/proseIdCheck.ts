/**
 * IDs in prose that the referenced source does not have
 * (ADR-0019 D9: 本文中のID（REQ-、MSG-など）が正本に実在するかの確認).
 *
 * A reference keeps the *table* faithful to its source; prose around it is
 * written by a person or an AI and can name an ID the source never had
 * (REQ-099), or one that was renumbered or deleted after the prose was
 * written. This check is deliberately narrow and deterministic:
 *
 * - An ID *shape* is learned from the referenced sheets themselves: cell
 *   texts such as `ORD-001` or `MSG-E001` become the shape `ORD-\d+` /
 *   `MSG-E\d+`, and only when the sheet holds at least three distinct values
 *   of that shape (so `H2` or `UTF-8` never become a shape).
 * - A prose token is reported only if it has such a shape and appears in no
 *   cell of the sheets the document references.
 *
 * It says "this ID is not in the source you reference", nothing more: it does
 * not judge whether a sentence about a *known* ID is right (that stays with
 * the reader and the AI, ADR-0019 D12). Code fences, inline code, link
 * targets and the reference lines themselves are not scanned.
 */
import type { SheetSource } from '../core/sheetSource.js';

export const UNKNOWN_PROSE_ID_CODE = 'MMI_PROSE_ID_NOT_IN_SOURCE';

export interface ProseIdSource {
  /** Shown in messages, e.g. `./data/要件.xlsx#機能要件`. */
  label: string;
  sheet: SheetSource;
}

export interface ProseIdFinding {
  id: string;
  line: number;
  column: number;
  /** Shapes of the same family the sources do hold, with an example, to help the author. */
  example: string;
  sources: string[];
}

const TOKEN = /(?<![A-Za-z0-9_-])[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*(?![A-Za-z0-9_-])/gu;
const MIN_DISTINCT_PER_SHAPE = 3;

const shapeOf = (token: string): string | undefined => (/\d/u.test(token) && /[-_]|[A-Z]\d/u.test(token) ? token.replace(/\d+/gu, '\\d+') : undefined);

function* cellTexts(sheet: SheetSource): Iterable<string> {
  const used = sheet.usedRange;
  if (!used) return;
  for (let row = used.startRow; row <= used.endRow; row += 1) {
    for (let col = used.startCol; col <= used.endCol; col += 1) {
      const text = sheet.cellAt(row, col)?.text;
      if (text) yield text;
    }
  }
}

export function findUnknownProseIds(markdown: string, sources: readonly ProseIdSource[]): ProseIdFinding[] {
  const known = new Set<string>();
  const byShape = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const text of cellTexts(source.sheet)) {
      for (const match of text.matchAll(TOKEN)) {
        const token = match[0];
        known.add(token);
        const shape = shapeOf(token);
        if (shape) {
          const values = byShape.get(shape) ?? new Set<string>();
          values.add(token);
          byShape.set(shape, values);
        }
      }
    }
  }
  const shapes = new Map([...byShape].filter(([, values]) => values.size >= MIN_DISTINCT_PER_SHAPE));
  if (shapes.size === 0) return [];

  const findings: ProseIdFinding[] = [];
  let fence: string | undefined;
  markdown.split(/\r?\n/u).forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker;
      return;
    }
    if (fence || line.includes('![[')) return;
    // Blank out inline code and link/image targets, keeping columns stable.
    const scrubbed = line
      .replace(/`[^`]*`/gu, (m) => ' '.repeat(m.length))
      .replace(/\]\([^)]*\)/gu, (m) => ' '.repeat(m.length))
      .replace(/<[^>]*>/gu, (m) => ' '.repeat(m.length));
    for (const match of scrubbed.matchAll(TOKEN)) {
      const token = match[0];
      const shape = shapeOf(token);
      if (!shape || !shapes.has(shape) || known.has(token)) continue;
      findings.push({
        id: token,
        line: index + 1,
        column: (match.index ?? 0) + 1,
        example: [...shapes.get(shape)!][0],
        sources: sources.map((source) => source.label),
      });
    }
  });
  return findings;
}
