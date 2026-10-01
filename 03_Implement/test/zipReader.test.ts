import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

import { readZip, ZipError } from '../src/core/zipReader.js';

function storedZip(
  name = 'a.txt',
  data = Buffer.from('ok', 'utf8'),
): Uint8Array {
  const nameBytes = Buffer.from(name, 'utf8');
  const checksum = crc32(data) >>> 0;

  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint32(14, checksum, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, data.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint32(16, checksum, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, data.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);

  const output = new Uint8Array(local.length + central.length + eocd.length);
  output.set(local, 0);
  output.set(central, local.length);
  output.set(eocd, local.length + central.length);
  return output;
}

function eocdOffset(bytes: Uint8Array): number {
  return bytes.byteLength - 22;
}

test('readZip accepts a consistent single-disk ZIP and verifies its entry', () => {
  const zip = readZip(storedZip());
  assert.equal(zip.size, 1);
  assert.equal(zip.get('a.txt')?.read().toString('utf8'), 'ok');
});

test('readZip rejects multi-disk EOCD metadata', () => {
  const bytes = storedZip().slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(eocdOffset(bytes) + 4, 1, true);

  assert.throws(
    () => readZip(bytes),
    (error: unknown) =>
      error instanceof ZipError
      && error.code === 'unsupported'
      && /multi-disk/u.test(error.message),
  );
});

test('readZip rejects a central directory smaller than its entries', () => {
  const bytes = storedZip().slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = eocdOffset(bytes);
  view.setUint32(at + 12, view.getUint32(at + 12, true) - 1, true);

  assert.throws(
    () => readZip(bytes),
    (error: unknown) =>
      error instanceof ZipError
      && error.code === 'corrupt'
      && /central directory/u.test(error.message),
  );
});

test('readZip rejects a central directory extending into the EOCD', () => {
  const bytes = storedZip().slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = eocdOffset(bytes);
  view.setUint32(at + 12, view.getUint32(at + 12, true) + 1, true);

  assert.throws(
    () => readZip(bytes),
    (error: unknown) =>
      error instanceof ZipError
      && error.code === 'corrupt'
      && /central directory/u.test(error.message),
  );
});

test('readZip requires EOCD comment length to match the terminal record', () => {
  const bytes = storedZip().slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(eocdOffset(bytes) + 20, 1, true);

  assert.throws(
    () => readZip(bytes),
    (error: unknown) =>
      error instanceof ZipError
      && error.code === 'not-a-zip',
  );
});
