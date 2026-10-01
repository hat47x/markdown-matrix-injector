/**
 * Minimal read-only ZIP reader (OOXML packages), zlib only -- no dependency.
 *
 * Reads the central directory, supports stored (0) and deflate (8) entries,
 * and refuses what it does not understand (ZIP64, encryption, other methods)
 * with a typed error instead of returning garbage. Defensive against hostile
 * packages: entry count, per-entry uncompressed size and CRC are checked, and
 * inflating is capped so a zip bomb cannot exhaust memory.
 */
import { crc32, inflateRawSync } from 'node:zlib';

export class ZipError extends Error {
  constructor(
    readonly code: 'not-a-zip' | 'unsupported' | 'corrupt' | 'too-large',
    message: string,
  ) {
    super(message);
  }
}

export interface ZipLimits {
  maxEntries: number;
  /** Largest uncompressed size accepted for one entry. */
  maxEntryBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 20_000, maxEntryBytes: 128 * 1024 * 1024 };

export interface ZipEntry {
  name: string;
  compressedSize: number;
  size: number;
  /** Decompresses and verifies; throws `ZipError` on a bad entry. */
  read(): Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Map<string, ZipEntry> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not-a-zip', 'ZIP end-of-central-directory record not found');
  const total = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || directoryOffset === 0xffffffff) throw new ZipError('unsupported', 'ZIP64 packages are not supported');
  if (total > limits.maxEntries) throw new ZipError('too-large', `package has ${total} entries (limit ${limits.maxEntries})`);

  const entries = new Map<string, ZipEntry>();
  let at = directoryOffset;
  for (let n = 0; n < total; n += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL) throw new ZipError('corrupt', 'bad central directory');
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const compressedSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localOffset = buf.readUInt32LE(at + 42);
    const name = buf.toString(flags & 0x0800 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue; // directory
    entries.set(name, {
      name,
      compressedSize,
      size,
      read: () => {
        if (flags & 0x0001) throw new ZipError('unsupported', `${name} is encrypted`);
        if (size > limits.maxEntryBytes) throw new ZipError('too-large', `${name} is ${size} bytes (limit ${limits.maxEntryBytes})`);
        if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL) throw new ZipError('corrupt', `${name}: bad local header`);
        const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
        const raw = buf.subarray(start, start + compressedSize);
        if (raw.length !== compressedSize) throw new ZipError('corrupt', `${name}: truncated data`);
        let data: Buffer;
        if (method === 0) data = Buffer.from(raw);
        else if (method === 8) {
          try {
            data = inflateRawSync(raw, { maxOutputLength: limits.maxEntryBytes });
          } catch (error) {
            throw new ZipError('corrupt', `${name}: ${error instanceof Error ? error.message : 'inflate failed'}`);
          }
        } else throw new ZipError('unsupported', `${name}: compression method ${method}`);
        if (data.length !== size) throw new ZipError('corrupt', `${name}: size mismatch`);
        if (crc32(data) !== crc) throw new ZipError('corrupt', `${name}: CRC mismatch`);
        return data;
      },
    });
  }
  return entries;
}
