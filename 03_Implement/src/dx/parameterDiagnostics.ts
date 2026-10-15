/**
 * Problems in an embed's query parameters that would otherwise pass silently
 * (a renderer ignores an invalid `mode=tabel` or an unknown `heder=first`).
 *
 * - A known key with a value outside its contract -> warning, with the closest
 *   valid value as the suggested fix when the vocabulary is closed.
 * - An unknown key that looks like a misspelt known key -> information only:
 *   unknown keys are legal and ignored (spec P5), so this never becomes an
 *   error; `x-*` keys are never reported.
 *
 * Offsets are relative to the start of the `![[...]]` text.
 */
import { formatMessage, type AllowedValues } from '../core/messages/index.js';
import { isKnownEmbedQueryParameter, MMI_KNOWN_PARAMETER_CONTRACT, validateKnownEmbedQueryParameters, type KnownEmbedQueryParameter } from '../parser/parameterContract.js';

export type ParameterIssueCode = 'MMI_INVALID_PARAM_VALUE' | 'MMI_UNKNOWN_PARAM';

export interface ParameterIssue {
  code: ParameterIssueCode;
  severity: 'warning' | 'information';
  message: string;
  /** Span to replace for the fix (value for invalid values, key for unknown keys). */
  start: number;
  end: number;
  suggestion?: string;
}

const KNOWN_KEYS = Object.keys(MMI_KNOWN_PARAMETER_CONTRACT) as KnownEmbedQueryParameter[];

export function parameterIssues(raw: string, locale?: string): ParameterIssue[] {
  if (!raw.startsWith('![[') || !raw.endsWith(']]')) return [];
  const body = raw.slice(3, -2);
  const pipe = body.indexOf('|');
  const queryAt = body.indexOf('?', pipe >= 0 ? pipe : 0);
  if (queryAt < 0) return [];
  const issues: ParameterIssue[] = [];
  let offset = 3 + queryAt + 1;
  for (const segment of body.slice(queryAt + 1).split('&')) {
    const eq = segment.indexOf('=');
    const rawKey = eq >= 0 ? segment.slice(0, eq) : segment;
    const rawValue = eq >= 0 ? segment.slice(eq + 1) : '';
    const key = safeDecode(rawKey);
    const value = safeDecode(rawValue);
    const keyStart = offset;
    const valueStart = offset + rawKey.length + 1;
    if (key.length > 0 && isKnownEmbedQueryParameter(key)) {
      const issue = validateKnownEmbedQueryParameters(new URLSearchParams([[key, value]]))[0];
      if (issue) {
        const suggestion = suggestValue(key, value);
        issues.push({
          code: 'MMI_INVALID_PARAM_VALUE',
          severity: 'warning',
          message: invalidValueMessage(key, value, suggestion, locale),
          start: eq >= 0 ? valueStart : keyStart,
          end: eq >= 0 ? valueStart + rawValue.length : keyStart + rawKey.length,
          ...(suggestion !== undefined && eq >= 0 ? { suggestion } : {}),
        });
      }
    } else if (key.length > 0 && !key.startsWith('x-')) {
      const suggestion = closestKey(key);
      if (suggestion) {
        issues.push({
          code: 'MMI_UNKNOWN_PARAM',
          severity: 'information',
          message: formatMessage('unknownParam', { key, suggestion }, locale),
          start: keyStart,
          end: keyStart + rawKey.length,
          suggestion,
        });
      }
    }
    offset += segment.length + 1;
  }
  return issues;
}

function invalidValueMessage(key: KnownEmbedQueryParameter, value: string, suggestion: string | undefined, locale?: string): string {
  const constraint = MMI_KNOWN_PARAMETER_CONTRACT[key].constraint;
  const allowed: AllowedValues =
    constraint.kind === 'enum'
      ? { kind: 'enum', values: constraint.values }
      : key === 'header'
        ? { kind: 'header' }
        : key === 'columns'
          ? { kind: 'columns' }
          : key === 'formatColumn'
            ? { kind: 'formatColumn' }
            : { kind: 'nonEmpty' };
  return formatMessage('invalidParam', { key, value, allowed, ...(suggestion !== undefined ? { suggestion } : {}) }, locale);
}

/** Closest valid value for closed vocabularies; case-only differences first. */
function suggestValue(key: KnownEmbedQueryParameter, value: string): string | undefined {
  const constraint = MMI_KNOWN_PARAMETER_CONTRACT[key].constraint;
  const vocabulary = constraint.kind === 'enum' ? [...constraint.values] : key === 'header' ? ['first', 'none'] : [];
  if (key === 'columns' && /^[A-Za-z]+(\s*[、，,]\s*[A-Za-z]+)*$/u.test(value)) return value.replace(/\s*[、，]\s*/gu, ',');
  if (vocabulary.length === 0) return undefined;
  const folded = vocabulary.find((candidate) => candidate === value.trim().toLowerCase());
  if (folded) return folded;
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of vocabulary) {
    const distance = editDistance(value.toLowerCase(), candidate);
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best && best.distance <= Math.max(1, Math.floor(best.candidate.length / 3)) ? best.candidate : undefined;
}

function closestKey(key: string): string | undefined {
  const lower = key.toLowerCase();
  const exactFold = KNOWN_KEYS.find((known) => known.toLowerCase() === lower);
  if (exactFold) return exactFold;
  let best: { known: string; distance: number } | undefined;
  for (const known of KNOWN_KEYS) {
    const distance = editDistance(lower, known.toLowerCase());
    if (!best || distance < best.distance) best = { known, distance };
  }
  return best && best.distance <= Math.max(1, Math.floor(best.known.length / 4)) ? best.known : undefined;
}

/** Edit distance where swapping two adjacent letters counts once (tabel -> table). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/gu, ' '));
  } catch {
    return text;
  }
}
