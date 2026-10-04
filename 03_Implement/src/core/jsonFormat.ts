/**
 * JSON source bytes are UTF-8 only.
 *
 * Node Buffer.toString('utf8') replaces malformed byte sequences with U+FFFD,
 * which would let the same bytes produce different Candidates depending on
 * whether they entered through the normal CLI or Portable Core. Keep the byte
 * boundary strict and shared instead.
 */
export function decodeJsonUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('JSON source must be valid UTF-8');
  }
}
