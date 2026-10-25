/**
 * Media format detection shared by OOXML Source Adapters (Excel drawings,
 * Word pictures). Signature first, part extension second: a package can claim
 * any name, but Markdown extraction must not label bytes with a format they
 * do not have.
 */

export type MediaFormat =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'bmp'
  | 'svg'
  | 'tiff'
  | 'emf'
  | 'wmf'
  | 'unknown';

/** Formats Markdown/browsers can display; others are listed but not extractable. */
export const EXTRACTABLE_MEDIA_FORMATS = ['png', 'jpeg', 'gif', 'bmp', 'svg'] as const;

export function isExtractableMediaFormat(format: MediaFormat): boolean {
  return (EXTRACTABLE_MEDIA_FORMATS as readonly string[]).includes(format);
}

export function mediaFormatOf(bytes: Uint8Array, partName: string): MediaFormat {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startsWith = (...values: number[]) =>
    values.every((value, index) => buffer[index] === value);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (startsWith(0x42, 0x4d)) return 'bmp';
  if (startsWith(0x49, 0x49, 0x2a, 0x00) || startsWith(0x4d, 0x4d, 0x00, 0x2a)) {
    return 'tiff';
  }
  if (buffer.length >= 44 && buffer.readUInt32LE(40) === 0x464d4520) return 'emf';
  if (startsWith(0xd7, 0xcd, 0xc6, 0x9a)) return 'wmf';
  if (/<svg[\s>]/u.test(buffer.subarray(0, 2048).toString('utf8'))) return 'svg';
  const extension = partName.split('.').pop()?.toLowerCase();
  if (extension === 'jpg') return 'jpeg';
  return (['png', 'jpeg', 'gif', 'bmp', 'svg', 'tiff', 'emf', 'wmf'] as const)
    .find((format) => format === extension) ?? 'unknown';
}
