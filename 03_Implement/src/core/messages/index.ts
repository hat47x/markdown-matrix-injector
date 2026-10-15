/**
 * User-facing messages by locale.
 *
 * A message is an id plus the values it is built from (`MessageParamsMap`); each locale's table turns them into a
 * sentence. English is the reference and the fallback: a locale may leave an id out, and a locale nobody has
 * written falls back to English. To add a language, write a `MessageTable` (it may be partial) and call
 * `registerMessages('<language>', table)` -- see `ja.ts` for a complete example.
 *
 * Core code throws `LocalizedError`, whose `message` stays the English sentence (what the command line, logs and
 * tests see). Hosts that show messages to a person -- the VS Code Problems panel, the preview -- call
 * `localizeError` or `formatMessage` with their own locale.
 */
import { enMessages } from './en.js';
import { jaMessages } from './ja.js';
import type { MessageId, MessageParamsMap, MessageTable } from './types.js';

export type { AllowedValues, MessageId, MessageParamsMap, MessageTable } from './types.js';
export { similarNames } from './helpers.js';

const tables = new Map<string, Partial<MessageTable>>([
  ['en', enMessages],
  ['ja', jaMessages],
]);

export const FALLBACK_LOCALE = 'en';

/** Adds or extends one language. `language` is a BCP 47 language such as `de` or `zh-cn`. */
export function registerMessages(language: string, table: Partial<MessageTable>): void {
  const key = language.toLowerCase();
  tables.set(key, { ...tables.get(key), ...table });
}

/**
 * The registered language that best matches what a host reports (`ja`, `ja-JP`, `en-US`, `zh-hans-cn`...):
 * the exact tag first, then the same tag without its last subtag, and so on, else English.
 */
export function resolveMessageLocale(language?: string): string {
  if (!language) return FALLBACK_LOCALE;
  const parts = language.toLowerCase().replace(/_/gu, '-').split('-');
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('-');
    if (tables.has(candidate)) return candidate;
  }
  return FALLBACK_LOCALE;
}

export function formatMessage<K extends MessageId>(id: K, params: MessageParamsMap[K], language?: string): string {
  const table = tables.get(resolveMessageLocale(language));
  const template = (table?.[id] ?? enMessages[id]) as (value: MessageParamsMap[K]) => string;
  return template(params);
}

/**
 * An error whose sentence a host may phrase in the reader's language. `message` is always the English sentence
 * (`plain`, when given, is what it is built from -- for example without the optional sheet suggestions).
 */
export class LocalizedError<K extends MessageId = MessageId> extends Error {
  constructor(
    readonly messageId: K,
    readonly params: MessageParamsMap[K],
    plain?: MessageParamsMap[K],
  ) {
    super(formatMessage(messageId, plain ?? params, FALLBACK_LOCALE));
  }
}

/** The error's sentence in `language`; an error that carries no message id keeps its own text. */
export function localizeError(error: unknown, language?: string): string {
  if (error instanceof LocalizedError) return formatMessage(error.messageId, error.params, language);
  return error instanceof Error ? error.message : String(error);
}
