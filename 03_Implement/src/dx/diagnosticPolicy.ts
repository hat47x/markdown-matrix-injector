/**
 * When to show a diagnostic to a person who is typing (ADR-0019 D13:
 * 執筆中は控えめに、レビュー・CI・AIには網羅的に).
 *
 * A reference under the cursor is unfinished by definition: while a sheet
 * name or a range is being typed, "sheet not found" is true and useless on
 * every keystroke. So in the `authoring` phase the diagnostics of the line
 * being edited are held back. Everything else stays: the reference that was
 * already written and is now broken is still reported at once. `review`
 * (open, save, focus elsewhere) shows everything, as do the CLI `check` and
 * CI, which never use this policy. Nothing is hidden for good: the line is
 * reported as soon as the cursor leaves it or the document is saved.
 *
 * Pure: no VS Code types, so it is unit-tested directly.
 */
import type { DocumentDiagnosticItem } from './vscodeAdapters.js';

export type DiagnosticPhase = 'authoring' | 'review';
export type WhileTyping = 'quiet' | 'full';

export interface DiagnosticPolicyInput {
  phase: DiagnosticPhase;
  /** 0-based line of the cursor in the edited document, when it has one. */
  cursorLine?: number;
  whileTyping?: WhileTyping;
}

export function applyDiagnosticPolicy(items: readonly DocumentDiagnosticItem[], input: DiagnosticPolicyInput): DocumentDiagnosticItem[] {
  if (input.phase === 'review' || input.whileTyping === 'full' || input.cursorLine === undefined) return [...items];
  const line = input.cursorLine;
  return items.filter((item) => !(item.range.start.line <= line && line <= item.range.end.line));
}

/** How long typing must pause before the document is checked again. */
export const AUTHORING_DEBOUNCE_MS = 400;
