/**
 * Minimal, dependency-free HTML text escaper shared by every renderer
 * (`renderTable`, `renderCard`, `renderEmbedFrame`, and the markdown-it plugin's
 * error fallback).
 *
 * Historically each renderer carried its own byte-identical copy. Centralising
 * it here removes that duplication and guarantees a single escaping contract:
 * every value MMI injects into the preview DOM is escaped the same way, so the
 * "visible degradation, never silent" guarantee (spec P2) and the read-only
 * boundary cannot be undermined by one renderer drifting from the others.
 *
 * The `&` replacement MUST run first; otherwise the `&` introduced by the later
 * entity replacements (`&lt;` etc.) would be double-escaped into `&amp;lt;`.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
