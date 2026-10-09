/**
 * Keeps an open Markdown preview current after a workbook is saved
 * (issue-0211 EW04). The renderer already reads the saved file with an
 * mtime-keyed cache, but VS Code's preview only re-renders when the Markdown
 * changes. So a saved, created or deleted workbook asks the built-in preview
 * to refresh -- a deleted one too, so a missing book shows as the visible
 * error instead of the last table (scenario F).
 *
 * - Excel's lock/temp files (`~$Book.xlsx`) are not saves and never refresh.
 * - A refresh happens only when an open Markdown document names the workbook
 *   (its file name appears in the text); unrelated workbooks cost nothing.
 * - Saves arrive in bursts (temp file, rename, attribute change): one refresh
 *   runs after the burst has been quiet for `delayMs`.
 * - Only saved content is shown. A save that cannot be read yet renders as a
 *   visible error, never as the old table, and the next change refreshes again.
 *
 * Timer, command and the open documents are injected: unit-tested without VS Code.
 */
export interface PreviewRefreshDeps {
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
  refreshPreview(): PromiseLike<unknown>;
  /** Text of the Markdown documents currently open. */
  openMarkdownTexts(): Iterable<string>;
}

export const PREVIEW_REFRESH_DELAY_MS = 600;
const NOT_A_SAVE = /(^|[\\/])(~\$|\.~lock\.|\.#)|\.(tmp|crdownload|part)$/iu;

export function isWorkbookSaveEvent(filePath: string): boolean {
  return !NOT_A_SAVE.test(filePath);
}

const baseName = (filePath: string): string => filePath.split(/[\\/]/u).pop() ?? filePath;

export class PreviewRefresher {
  private handle: unknown;
  private count = 0;

  constructor(private readonly deps: PreviewRefreshDeps, private readonly delayMs = PREVIEW_REFRESH_DELAY_MS) {}

  /** Number of refreshes requested so far (observable in the Extension Host e2e). */
  get refreshes(): number {
    return this.count;
  }

  workbookChanged(filePath: string): void {
    if (!isWorkbookSaveEvent(filePath)) return;
    const name = baseName(filePath).toLowerCase();
    let named = false;
    for (const text of this.deps.openMarkdownTexts()) {
      if (text.toLowerCase().includes(name)) {
        named = true;
        break;
      }
    }
    if (!named) return;
    if (this.handle !== undefined) this.deps.clearTimer(this.handle);
    this.handle = this.deps.setTimer(() => {
      this.handle = undefined;
      this.count += 1;
      void Promise.resolve(this.deps.refreshPreview()).then(undefined, () => undefined); // no preview open: nothing to refresh
    }, this.delayMs);
  }

  dispose(): void {
    if (this.handle !== undefined) this.deps.clearTimer(this.handle);
    this.handle = undefined;
  }
}
