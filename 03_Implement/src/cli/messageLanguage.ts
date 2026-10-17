import { localizeError, resolveMessageLocale } from '../core/messages/index.js';

/**
 * The language of messages shown to a person from the command line, from the
 * `MMI_LANGUAGE` environment variable (`ja`, `en`, or another BCP 47 tag that
 * `resolveMessageLocale` understands). Unset, empty or `auto` keeps the English
 * reference wording, matching the Core contract. The VS Code extension has its
 * own `markdownMatrixInjector.language` setting instead.
 */
export function cliMessageLanguage(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.MMI_LANGUAGE?.trim();
  if (raw === undefined || raw.length === 0 || raw.toLowerCase() === 'auto') return undefined;
  return resolveMessageLocale(raw);
}

/**
 * The sentence for a caught error in the reader's language. An error with no
 * message id (CLI's own wording, or an unexpected failure) keeps its own text.
 */
export function cliErrorText(error: unknown, env: NodeJS.ProcessEnv = process.env): string {
  return localizeError(error, cliMessageLanguage(env));
}
