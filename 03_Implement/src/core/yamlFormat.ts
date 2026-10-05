/**
 * Generic YAML Tree sources are UTF-8 only, matching JSON and generic XML.
 */
export function decodeYamlUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('YAML source must be valid UTF-8');
  }
}
