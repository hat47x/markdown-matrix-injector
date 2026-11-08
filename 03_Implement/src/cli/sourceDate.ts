/**
 * `--source-date`: the moment a deliverable says it was made. Without it the creation time is "now", so two builds
 * of the same document differ in their bytes and a hash recorded at delivery cannot be checked again. With it
 * (the reproducible-builds `SOURCE_DATE_EPOCH` convention) the same document, tools and fonts give the same file.
 */
export class SourceDateError extends Error {}

/** Seconds since the epoch from `1700000000`, `2026-10-21` (midnight UTC) or an ISO date-time with a zone. */
export function parseSourceDate(value: string): number {
  const text = value.trim();
  // 9-11 digits (1973-2286): a shorter number such as 20261021 is far more likely a mistyped date than a 1970s time.
  if (text === '0' || /^\d{9,11}$/.test(text)) return Number(text);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? new Date(text) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new SourceDateError(`--source-date must be epoch seconds, YYYY-MM-DD or an ISO date-time with a zone (got "${value}")`);
  }
  return Math.floor(date.getTime() / 1000);
}
